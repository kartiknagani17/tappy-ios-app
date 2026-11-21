#!/usr/bin/env bash
# Final reel: character clip (start) -> product shot (shot.mp4 from build.sh) -> character clip (end).
# Hard cuts, no transitions, no audio. Every piece is normalised to 1080x1920, 30 fps, yuv420p, SAR 1.
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

NORM="fps=30,scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,format=yuv420p,setpts=PTS-STARTPTS"
$FF -v error -y -i "$CS" -i "$SHOT" -i "$CE" -filter_complex "\
[0:v]$NORM[a];[1:v]$NORM[b];[2:v]$NORM[c];[a][b][c]concat=n=3:v=1:a=0[v]" \
  -map "[v]" -an -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r 30 -movflags +faststart "$P/final.mp4"

# QA: 1 s around each cut at 6 fps
D1=$(dur "$CS"); D2=$(dur "$SHOT")
C1=$(awk "BEGIN{print $D1}"); C2=$(awk "BEGIN{print $D1+$D2}")
S1=$(awk "BEGIN{s=$C1-0.5; print (s<0?0:s)}") S2=$(awk "BEGIN{print $C2-0.5}")
LBL="fps=6,scale=240:-1,drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='%{pts\:hms}':x=3:y=3:fontsize=16:fontcolor=yellow:box=1:boxcolor=black@0.6"
$FF -v error -y -ss $S1 -t 1 -i "$P/final.mp4" -ss $S2 -t 1 -i "$P/final.mp4" -filter_complex "\
[0:v]setpts=PTS-STARTPTS+$S1/TB,$LBL,tile=6x1[a];[1:v]setpts=PTS-STARTPTS+$S2/TB,$LBL,tile=6x1[b];[a][b]vstack" \
  -frames:v 1 "$P/qa-final.jpg"
IFS=, read w h r <<< "$(info "$P/final.mp4")"
echo "done: $P/final.mp4  ${w}x${h} @ ${r}  $(dur "$P/final.mp4")s  (cuts at ${C1}s and ${C2}s)"
