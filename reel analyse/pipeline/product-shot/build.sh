#!/usr/bin/env bash
# Tappy product shot: AI POV clip -> retime (quick turn) + step-in + handheld + Tappy logo + FIXED scan frame,
# barcode pushed into the frame -> green lock + beep + soft flash -> real Tappy verdict over that camera view.
# usage: build.sh <productDir>      (reads <productDir>/shot.env; see README in SKILL.md)
# outputs: <productDir>/shot.mp4 (scan + verdict), scan-only.mp4, qa-scan.jpg, qa-verdict.jpg
set -euo pipefail
FF=/d/AIVideoEditor2/Setup/.tools/ffmpeg/ffmpeg.exe
KIT="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
P="$(cd "$1" && pwd -W 2>/dev/null || pwd)"
source "$P/shot.env"
: "${VIDEO:?}" "${SEGMENTS:?}" "${BARCODE_X:?}" "${BARCODE_Y:?}"
ZOOM=${ZOOM:-1.3}
VERDICT_A=${VERDICT_A:-0.15:2.6} VERDICT_B=${VERDICT_B:-3.4:8.0} VERDICT_B_SPEED=${VERDICT_B_SPEED:-2.0} VERDICT_C=${VERDICT_C:-8.0:10.3}
T="$P/.build"; rm -rf "$T"; mkdir -p "$T"
A="$KIT/assets"; VID="$P/$VIDEO"; FRAMES="$P/verdict"
ENC="-c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r 30"
for f in "$VID" "$FRAMES/frames.ffconcat" "$P/label.png" "$P/sub.png"; do [ -e "$f" ] || { echo "missing: $f"; exit 1; }; done

D=$(echo $SEGMENTS | tr ' ' '\n' | awk -F: '{d+=($2-$1)/$3} END{printf "%.3f", d}')
# aim push-in defaults: the 0.6 s before the lock, ending 0.15 s before it
TL=$(awk "BEGIN{print $D-0.45}") TF=$(awk "BEGIN{print $D-0.3}")
PUSH_END=${PUSH_END:-$(awk "BEGIN{print $TL-0.15}")}; PUSH_START=${PUSH_START:-$(awk "BEGIN{print $PUSH_END-0.6}")}
Z0=$PUSH_START Z1=$PUSH_END BX=$BARCODE_X BY=$BARCODE_Y Z=$ZOOM
echo "scan shot ${D}s, lock at ${TL}s, push ${Z0}-${Z1}s"

$FF -v error -y -f lavfi -i "sine=f=1800:d=0.12" -af "afade=t=out:st=0.03:d=0.09,volume=0.5,aresample=48000,pan=stereo|c0=c0|c1=c0" "$T/beep.wav"
t="(on/30)" ZB=1.08 ZS=1.13
q="clip(($t-$Z0)/($Z1-$Z0),0,1)"; PP="($q*$q*(3-2*$q))"
qt="clip((t-$Z0)/($Z1-$Z0),0,1)"; PT="($qt*$qt*(3-2*$qt))"
s="clip($t/1.6,0,1)"; STEP="($s*$s*(3-2*$s))"
ZBASE="($ZB+($ZS-$ZB)*$STEP)"; ZE="($ZBASE+($Z-$ZBASE)*$PP)"
AMP="(26-18*$PP)"
HX="$AMP*(0.6*sin($t*1.3)+0.3*sin($t*2.9+1)+0.15*sin($t*7.1))"
HY="$AMP*(0.6*sin($t*1.7+2)+0.35*sin($t*3.7)+0.15*sin($t*8.3))-20*abs(sin(PI*$t/0.8))*(1-$STEP)"
XC="(2160-2160/$ZE)/2" YC="(3840-3840/$ZE)/2" XT="(2*$BX-1080/$ZE)" YT="(2*$BY-2134/$ZE)"
X="clip((1-$PP)*$XC+$PP*$XT+2*$HX/$ZE,0,2160-2160/$ZE)"; Y="clip((1-$PP)*$YC+$PP*$YT+2*$HY/$ZE,0,3840-3840/$ZE)"
VG="" AG="" i=0 VL="" AL=""
for sg in $SEGMENTS; do
  IFS=: read s0 s1 sp <<< "$sg"; i=$((i+1))
  at="atempo=$sp"; if awk "BEGIN{exit !($sp>2)}"; then at="atempo=2,atempo=$(awk "BEGIN{print $sp/2}")"; fi
  VG="$VG[0:v]trim=$s0:$s1,setpts=(PTS-STARTPTS)/$sp[v$i];"; AG="$AG[0:a]atrim=$s0:$s1,asetpts=PTS-STARTPTS,$at[a$i];"
  VL="$VL[v$i]"; AL="$AL[a$i]"
done
# 1) camera layer
$FF -v error -y -i "$VID" -filter_complex "$VG$AG${VL}concat=n=$i:v=1,fps=30,scale=2160:3840:flags=lanczos,rotate=a='(0.008-0.005*$PT)*sin(t*1.1)+0.003*sin(t*2.7)':ow=iw:oh=ih:c=black,zoompan=z='$ZE':x='$X':y='$Y':d=1:s=1080x1920:fps=30,unsharp=5:5:0.8:5:5:0[v];${AL}concat=n=$i:v=0:a=1,volume=0.6,aresample=48000[a]" \
  -map "[v]" -map "[a]" $ENC -c:a aac -ar 48000 -t $D "$T/cam.mp4"
$FF -v error -y -ss $(awk "BEGIN{print $D-0.1}") -i "$T/cam.mp4" -frames:v 1 "$T/bg.png"
# 2) scan shot
$FF -v error -y -i "$T/cam.mp4" -loop 1 -framerate 30 -t $D -i "$A/logo.png" -loop 1 -framerate 30 -t $D -i "$A/frame.png" \
  -loop 1 -framerate 30 -t $D -i "$A/frame-hit.png" -loop 1 -framerate 30 -t $D -i "$P/label.png" -i "$T/beep.wav" -filter_complex "\
[0:v][1:v]overlay[c1];[c1][2:v]overlay=enable='lt(t,$TL)'[c2];[c2][3:v]overlay=enable='gte(t,$TL)'[c3];[c3][4:v]overlay[c4];\
[c4]eq=brightness='if(between(t,$TF,$TF+0.2),0.3*(1-abs(t-$TF-0.1)/0.1),0)':eval=frame[v];\
[5:a]adelay=$(awk "BEGIN{printf \"%d\", $TL*1000}")|$(awk "BEGIN{printf \"%d\", $TL*1000}")[bp];[0:a][bp]amix=inputs=2:duration=first:normalize=0[a]" \
  -map "[v]" -map "[a]" $ENC -c:a aac -ar 48000 -t $D "$T/a-scan.mp4"
# 3) verdict
SA=${VERDICT_A%:*} EA=${VERDICT_A#*:} SB=${VERDICT_B%:*} EB=${VERDICT_B#*:} SC=${VERDICT_C%:*} EC=${VERDICT_C#*:} SP=$VERDICT_B_SPEED
DUR=$(awk "BEGIN{print ($EA-$SA)+($EB-$SB)/$SP+($EC-$SC)}"); HOLD=$(awk "BEGIN{print ($EA-$SA)+($EB-$SB)/$SP}")
$FF -v error -y -f concat -safe 0 -i "$FRAMES/frames.ffconcat" -loop 1 -t $DUR -framerate 30 -i "$T/bg.png" -loop 1 -t $DUR -framerate 30 -i "$A/logo.png" \
  -f lavfi -t $DUR -i "color=c=0x1F1513:s=1080x1920:r=30,format=rgba" -loop 1 -t $DUR -framerate 30 -i "$P/sub.png" \
  -stream_loop 2 -i "$VID" -filter_complex "\
[0:v]fps=30,format=rgb24,split=3[s1][s2][s3];\
[s1]trim=$SA:$EA,setpts=PTS-STARTPTS[a];[s2]trim=$SB:$EB,setpts=(PTS-STARTPTS)/$SP[b];[s3]trim=$SC:$EC,setpts=PTS-STARTPTS[c];\
[a][b][c]concat=n=3:v=1,colorkey=0xFF00FF:0.25:0.06[sheet];\
[1:v]format=rgba[cam];[cam][2:v]overlay[cl];[3:v]colorchannelmixer=aa=0.45,fade=t=in:st=0:d=0.3:alpha=1[dim];[cl][dim]overlay[cd];\
[cd][sheet]overlay=shortest=1[v0];[v0][4:v]overlay=enable='gte(t,$HOLD)'[v];\
[5:a]volume=0.35,aresample=48000,afade=t=out:st=$(awk "BEGIN{print $DUR-0.4}"):d=0.4[aa]" \
  -map "[v]" -map "[aa]" $ENC -c:a aac -ar 48000 -t $DUR "$T/b-verdict.mp4"
# outputs
printf "file '%s'\nfile '%s'\n" "$T/a-scan.mp4" "$T/b-verdict.mp4" > "$T/list.txt"
AOPT="-an"; [ "${AUDIO:-0}" = 1 ] && AOPT="-c:a aac -ar 48000"
$FF -v error -y -f concat -safe 0 -i "$T/list.txt" $ENC $AOPT -movflags +faststart "$P/shot.mp4"
$FF -v error -y -i "$T/a-scan.mp4" -c:v copy $AOPT "$P/scan-only.mp4"
bash "$KIT/sheet.sh" "$P/scan-only.mp4" "$P/qa-scan.jpg" 6 >/dev/null
bash "$KIT/sheet.sh" "$P/shot.mp4" "$P/qa-verdict.jpg" 2 $D >/dev/null
echo "done: $P/shot.mp4  (scan ${D}s + verdict ${DUR}s)"
