#!/usr/bin/env bash
# Final reel: character clip (start) -> product shot (shot.mp4 from build.sh) -> character clip (end).
# Hard cuts, no transitions. Character clips keep their spoken audio; silence under the product shot.
# Every piece is normalised to 1080x1920, 30 fps, yuv420p, SAR 1, audio 48 kHz stereo AAC.
# env: CS_IN/CS_OUT, CE_IN/CE_OUT (trim seconds), SHOT_AUDIO=1 (keep shot.mp4 audio), MUTE=1 (no audio at all)
# usage: stitch.sh <productDir>
#   needs <productDir>/shot.mp4 (run build.sh first) and the character clips:
#     character-start.mp4  and  character-end.mp4      (or one character.mp4 used for both)
#   override with CHAR_START=<file> CHAR_END=<file> (paths relative to productDir or absolute).
# outputs: <productDir>/final.mp4, qa-final.jpg (frames either side of both cuts)
set -euo pipefail
FF=/d/AIVideoEditor2/Setup/.tools/ffmpeg/ffmpeg.exe
FP="${FF%ffmpeg.exe}ffprobe.exe"
KIT="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
P="$(cd "$1" && pwd -W 2>/dev/null || pwd)"

pick() { # first existing file among the args, relative to $P unless absolute
  for f in "$@"; do
    [ -z "$f" ] && continue
    case "$f" in /*|?:*) c="$f";; *) c="$P/$f";; esac
    [ -f "$c" ] && { echo "$c"; return; }
  done
}
CS=$(pick "${CHAR_START:-}" character-start.mp4 character-start.mov character.mp4 character.mov)
CE=$(pick "${CHAR_END:-}" character-end.mp4 character-end.mov character.mp4 character.mov)
SHOT="$P/shot.mp4"
[ -f "$SHOT" ] || { echo "missing: $SHOT (run build.sh first)"; exit 1; }
[ -n "$CS" ] || { echo "missing: character-start.mp4 (or character.mp4) in $P"; exit 1; }
[ -n "$CE" ] || { echo "missing: character-end.mp4 (or character.mp4) in $P"; exit 1; }

dur() { "$FP" -v error -show_entries format=duration -of csv=p=0 "$1"; }
info() { "$FP" -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$1"; }
for f in "$CS" "$SHOT" "$CE"; do
  IFS=, read w h r <<< "$(info "$f")"
  echo "in: $(basename "$f")  ${w}x${h} @ ${r}  $(dur "$f")s"
  # warn when the aspect is not 9:16: it gets scaled to cover and centre-cropped
  awk "BEGIN{a=$w/$h; exit !(a<0.555||a>0.57)}" && echo "  warning: not 9:16, will be centre-cropped to fill 1080x1920"
done

# Trims (seconds; empty = whole clip): CS_IN/CS_OUT for the start clip, CE_IN/CE_OUT for the end clip.
# Audio: the character clips keep their own audio (spoken lines). The product shot gets silence,
# unless SHOT_AUDIO=1 and shot.mp4 has an audio track. MUTE=1 drops all audio (old behaviour).
hasaudio() { [ -n "$("$FP" -v error -select_streams a -show_entries stream=index -of csv=p=0 "$1")" ]; }
seg() { # in out file -> duration of the used part
  local d; d=$(dur "$3"); awk -v i="${1:-0}" -v o="${2:-$d}" 'BEGIN{print o-i}'; }
D1=$(seg "${CS_IN:-}" "${CS_OUT:-}" "$CS"); D2=$(dur "$SHOT"); D3=$(seg "${CE_IN:-}" "${CE_OUT:-}" "$CE")
TR() { echo "trim=start=${1:-0}${2:+:end=$2}"; }
ATR() { echo "atrim=start=${1:-0}${2:+:end=$2}"; }

NORM="fps=30,scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,format=yuv420p,setpts=PTS-STARTPTS"
ANORM="aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS"
SIL() { echo "anullsrc=r=48000:cl=stereo,atrim=duration=$1,aformat=sample_fmts=fltp:channel_layouts=stereo"; }
V="[0:v]$(TR "${CS_IN:-}" "${CS_OUT:-}"),$NORM[v0];[1:v]$NORM[v1];[2:v]$(TR "${CE_IN:-}" "${CE_OUT:-}"),$NORM[v2]"
if [ "${MUTE:-0}" = 1 ]; then
  $FF -v error -y -i "$CS" -i "$SHOT" -i "$CE" -filter_complex "$V;[v0][v1][v2]concat=n=3:v=1:a=0[v]" \
    -map "[v]" -an -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r 30 -movflags +faststart "$P/final.mp4"
else
  if hasaudio "$CS"; then A0="[0:a]$(ATR "${CS_IN:-}" "${CS_OUT:-}"),$ANORM,apad,atrim=duration=$D1[a0]"; else A0="$(SIL "$D1")[a0]"; fi
  if [ "${SHOT_AUDIO:-0}" = 1 ] && hasaudio "$SHOT"; then A1="[1:a]$ANORM,apad,atrim=duration=$D2[a1]"; else A1="$(SIL "$D2")[a1]"; fi
  if hasaudio "$CE"; then A2="[2:a]$(ATR "${CE_IN:-}" "${CE_OUT:-}"),$ANORM,apad,atrim=duration=$D3[a2]"; else A2="$(SIL "$D3")[a2]"; fi
  $FF -v error -y -i "$CS" -i "$SHOT" -i "$CE" -filter_complex "$V;$A0;$A1;$A2;[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]" \
    -map "[v]" -map "[a]" -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 192k -movflags +faststart "$P/final.mp4"
fi

# QA: 1 s around each cut at 6 fps
C1=$(awk "BEGIN{print $D1}"); C2=$(awk "BEGIN{print $D1+$D2}")
S1=$(awk "BEGIN{s=$C1-0.5; print (s<0?0:s)}") S2=$(awk "BEGIN{print $C2-0.5}")
LBL="fps=6,scale=240:-1,drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='%{pts\:hms}':x=3:y=3:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6"
$FF -v error -y -ss $S1 -t 1 -i "$P/final.mp4" -ss $S2 -t 1 -i "$P/final.mp4" -filter_complex "\
[0:v]setpts=PTS-STARTPTS+$S1/TB,$LBL,tile=6x1[a];[1:v]setpts=PTS-STARTPTS+$S2/TB,$LBL,tile=6x1[b];[a][b]vstack" \
  -frames:v 1 "$P/qa-final.jpg"
IFS=, read w h r <<< "$(info "$P/final.mp4")"
echo "done: $P/final.mp4  ${w}x${h} @ ${r}  $(dur "$P/final.mp4")s  (cuts at ${C1}s and ${C2}s)"
