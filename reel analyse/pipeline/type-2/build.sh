#!/usr/bin/env bash
# Type 2 reel ("Documentaries to watch if you're waking up"):
#   hook clip + serif title -> N posters, one per beat (fit width on a blurred copy, hard cuts)
#   -> [optional Tappy promo in the middle] -> [optional promo before the end] -> Tappy App Store end card.
# Silent by default (add the trending sound in Instagram). 1080x1920, 30 fps.
# usage: build.sh <reelDir>
#   needs <reelDir>/hook.mp4 and <reelDir>/posters/NN.jpg (from posters.mjs); settings in <reelDir>/reel.env
# outputs: <reelDir>/reel.mp4, qa.jpg (whole reel), qa-cards.jpg (title, promo, end card full size)
set -euo pipefail
FF=/d/AIVideoEditor2/Setup/.tools/ffmpeg/ffmpeg.exe
FP="${FF%ffmpeg.exe}ffprobe.exe"
KIT="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
P="$(cd "$1" && pwd -W 2>/dev/null || pwd)"
[ -f "$P/reel.env" ] && set -a && source "$P/reel.env" && set +a

# ---- settings (defaults = the viral reference reels) ----
HOOK=${HOOK:-hook.mp4}            # character hook clip (in reelDir)
HOOK_START=${HOOK_START:-0}       # where the hook starts in that clip (s)
HOOK_DUR=${HOOK_DUR:-3.0}         # hook length: 3.0 s = 4.5 beats, first poster lands on a beat
TAG_AT=${TAG_AT:-0}               # when the TAG line ("Part 2") appears (s); reference R2 used 0.77
BEAT=${BEAT_FRAMES:-20}           # frames per poster: 20 @ 30 fps = 0.667 s = one beat at 90 BPM
MID_PROMO=${MID_PROMO:-0}         # 0 = no middle promo; N = promo cut in after poster N
END_PITCH=${END_PITCH:-0}         # 1 = promo clip again just before the end card (viral reels did this)
PROMO_CLIP=${PROMO_CLIP:-}        # clip for the promo; default pitch.mp4 if present, else the hook clip
PROMO_START=${PROMO_START:-}      # start inside PROMO_CLIP (s); default: see below
PROMO_BEATS=${PROMO_BEATS:-4}     # promo length in beats: 4 = 2.667 s
PHONE_AT=${PHONE_AT:-0.5}         # phone pops in this long after the promo starts (s)
RESULT=${RESULT:-}                # Tappy result screen PNG (result.cjs); empty = promo text only, end card without phone
END_CARD=${END_CARD:-1}           # 1 = Tappy end card at the very end
END_DUR=${END_DUR:-3.1}           # end card length (s)
MUSIC=${MUSIC:-}                  # optional audio file to lay under the reel (default silent)
[ -n "$RESULT" ] && case "$RESULT" in /*|?:*) ;; *) RESULT="$P/$RESULT";; esac
export TITLE TAG PROMO_TEXT BADGE HEADLINE SUBLINE RESULT 2>/dev/null || true

T="$P/.build"; rm -rf "$T"; mkdir -p "$T/seg"
ENC="-c:v libx264 -crf 14 -preset medium -pix_fmt yuv420p -r 30 -an"
NORM="fps=30,scale=1080:1920:force_original_aspect_ratio=increase:flags=lanczos,crop=1080:1920,setsar=1,format=yuv420p"
dur() { "$FP" -v error -show_entries format=duration -of csv=p=0 "$1"; }
fr() { awk "BEGIN{printf \"%d\", $1*30+0.5}"; }
abs() { case "$1" in /*|?:*) echo "$1";; *) echo "$P/$1";; esac; }

HOOKF=$(abs "$HOOK"); [ -f "$HOOKF" ] || { echo "missing hook clip: $HOOKF"; exit 1; }
ls "$P"/posters/[0-9]*.jpg >/dev/null 2>&1 || { echo "missing posters: run posters.mjs first"; exit 1; }
[ -n "$RESULT" ] && [ ! -f "$RESULT" ] && { echo "missing RESULT: $RESULT"; exit 1; }

# ---- overlays ----
PLAYWRIGHT_BROWSERS_PATH="D:/playwright-mcp/browsers" node "$KIT/render.cjs" "$T"

# ---- 1. hook ----
HD=$(dur "$HOOKF")
if awk "BEGIN{exit !($HOOK_START+$HOOK_DUR>$HD+0.01)}"; then
  HOOK_DUR=$(awk "BEGIN{print $HD-$HOOK_START}"); echo "warning: hook clip is short, hook = ${HOOK_DUR}s"
fi
HF=$(fr $HOOK_DUR)
TAGIN=""; TAGF=""
[ -f "$T/tag.png" ] && TAGIN="-loop 1 -framerate 30 -i $T/tag.png" && TAGF=";[h1][2:v]overlay=enable='gte(t,$TAG_AT)'[h2]"
$FF -v error -y -ss $HOOK_START -i "$HOOKF" -loop 1 -framerate 30 -i "$T/title.png" $TAGIN -filter_complex "\
[0:v]setpts=PTS-STARTPTS,$NORM[h0];[h0][1:v]overlay[h1]$TAGF" -map "[$([ -n "$TAGF" ] && echo h2 || echo h1)]" \
  -frames:v $HF $ENC "$T/seg/hook.mp4"

# ---- 2. posters: fit inside 1080x1920 (full width for 2:3 posters), blurred + slightly darker copy behind ----
N=0
for f in "$P"/posters/[0-9]*.jpg; do
  N=$((N+1)); id=$(printf %02d $N)
  $FF -v error -y -i "$f" -filter_complex "\
[0:v]split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=40,eq=brightness=-0.07[bg];\
[b]scale=1080:1920:force_original_aspect_ratio=decrease:flags=lanczos[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=rgb24" \
    -frames:v 1 "$T/card$id.png"
  $FF -v error -y -loop 1 -framerate 30 -i "$T/card$id.png" -vf "setsar=1,format=yuv420p" -frames:v $BEAT $ENC "$T/seg/p$id.mp4"
done
[ $N -ne 20 ] && echo "note: $N posters (the viral reels use 20)"

# ---- 3. promo (middle and/or before the end card) ----
PF=$((PROMO_BEATS*BEAT))
if [ "$MID_PROMO" != 0 ] || [ "$END_PITCH" = 1 ]; then
  if [ -n "$PROMO_CLIP" ]; then SRC=$(abs "$PROMO_CLIP"); elif [ -f "$P/pitch.mp4" ]; then SRC="$P/pitch.mp4"; else SRC="$HOOKF"; fi
  [ -f "$SRC" ] || { echo "missing promo clip: $SRC"; exit 1; }
  PD=$(awk "BEGIN{print $PF/30}")
  if [ -z "$PROMO_START" ]; then
    if [ "$SRC" = "$HOOKF" ]; then
      # reuse the hook clip: footage after the hook if there is enough, else its last PD seconds (the calm stare)
      PROMO_START=$(awk "BEGIN{a=$HOOK_START+$HOOK_DUR; d=$HD; print (a+$PD<=d)?a:((d-$PD>0)?d-$PD:0)}")
    else PROMO_START=0; fi
  fi
  PHIN=""; PHF=""
  [ -f "$T/phone.png" ] && PHIN="-loop 1 -framerate 30 -i $T/phone.png" && PHF=";[q1][2:v]overlay=enable='gte(t,$PHONE_AT)'[q2]"
  $FF -v error -y -ss $PROMO_START -i "$SRC" -loop 1 -framerate 30 -i "$T/promo.png" $PHIN -filter_complex "\
[0:v]setpts=PTS-STARTPTS,$NORM,tpad=stop_mode=clone:stop_duration=$PD[q0];[q0][1:v]overlay[q1]$PHF" \
    -map "[$([ -n "$PHF" ] && echo q2 || echo q1)]" -frames:v $PF $ENC "$T/seg/promo.mp4"
  echo "promo: $(basename "$SRC") from ${PROMO_START}s, ${PD}s$([ -f "$T/phone.png" ] && echo ", phone at +${PHONE_AT}s")"
fi

# ---- 4. end card ----
EF=$(fr $END_DUR)
[ "$END_CARD" = 1 ] && $FF -v error -y -loop 1 -framerate 30 -i "$T/endcard.png" -vf "setsar=1,format=yuv420p" -frames:v $EF $ENC "$T/seg/end.mp4"

# ---- assemble ----
L="$T/list.txt"; : > "$L"; t=0; TL=""
add() { echo "file '$T/seg/$1.mp4'" >> "$L"; TL="$TL$(awk "BEGIN{printf \"%6.2f\", $t/30}")s  $2\n"; t=$((t+$3)); }
add hook "hook (${HOOK_DUR}s)" $HF
for i in $(seq 1 $N); do
  id=$(printf %02d $i); add p$id "poster $id  $(basename "$(ls "$P"/posters/[0-9]*.jpg | sed -n ${i}p)")" $BEAT
  [ "$MID_PROMO" = "$i" ] && add promo "promo (middle)" $PF
done
[ "$END_PITCH" = 1 ] && add promo "promo (before end card)" $PF
[ "$END_CARD" = 1 ] && add end "end card" $EF
if [ -n "$MUSIC" ]; then
  TOT=$(awk "BEGIN{print $t/30}")
  $FF -v error -y -f concat -safe 0 -i "$L" -i "$(abs "$MUSIC")" -map 0:v -map 1:a -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r 30 \
    -af "afade=t=out:st=$(awk "BEGIN{print $TOT-0.5}"):d=0.5" -c:a aac -b:a 192k -t $TOT -movflags +faststart "$P/reel.mp4"
else
  $FF -v error -y -f concat -safe 0 -i "$L" -c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r 30 -an -movflags +faststart "$P/reel.mp4"
fi
printf "timeline:\n$TL"

# ---- QA ----
D=$(dur "$P/reel.mp4")
$FF -v error -y -i "$P/reel.mp4" -vf "fps=48/$D,scale=180:-1,drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='%{pts\:hms}':x=3:y=3:fontsize=14:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=12x4" -frames:v 1 "$P/qa.jpg"
QIN="-ss 1.5 -i $P/reel.mp4"; QN=1; QS="[0:v]scale=360:-1[a0];"; QL="[a0]"
if [ -f "$T/seg/promo.mp4" ]; then QIN="$QIN -ss 2.2 -i $T/seg/promo.mp4"; QS="$QS[1:v]scale=360:-1[a1];"; QL="$QL[a1]"; QN=2; fi
if [ "$END_CARD" = 1 ]; then QIN="$QIN -i $T/endcard.png"; QS="$QS[$QN:v]scale=360:-1[a$QN];"; QL="$QL[a$QN]"; QN=$((QN+1)); fi
$FF -v error -y $QIN -filter_complex "${QS}${QL}hstack=$QN" -frames:v 1 "$P/qa-cards.jpg" 2>/dev/null || \
  $FF -v error -y -ss 1.5 -i "$P/reel.mp4" -frames:v 1 -vf scale=360:-1 "$P/qa-cards.jpg"
echo "done: $P/reel.mp4  $(awk "BEGIN{printf \"%.2f\", $D}")s, $N posters"
