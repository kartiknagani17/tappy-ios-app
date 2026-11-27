#!/usr/bin/env bash
# One product, POV v2 clip + a handheld camera layer (drift, bob, slight roll the whole shot, calming at the scan),
# barcode pushed into Tappy's fixed scan frame -> green lock + beep + flash -> real Tappy verdict.
set -euo pipefail
FF=/d/AIVideoEditor2/Setup/.tools/ffmpeg/ffmpeg.exe
S="C:/Users/HP/AppData/Local/Temp/claude/13cbded61b820e19/4d0968cb-5bb2-466f-ae5d-d436fc13851b/scratchpad/rec"
IN="D:/tappy ios app/reel analyse/inputs"
OUT="D:/tappy ios app/reel analyse/tappy-clips/pov-messy-cool-ranch-v2.mp4"
T="$S/build-pov3"; rm -rf "$T"; mkdir -p "$T"
CAP="$S/cap"; LOGO="$S/logo.png"
ENC="-c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r 30"
$FF -v error -y -f lavfi -i "sine=f=1800:d=0.12" -af "afade=t=out:st=0.03:d=0.09,volume=0.5,aresample=48000,pan=stereo|c0=c0|c1=c0" "$T/beep.wav"

# product <n> <video> <source end s> <barcode bx by> <zoom> <push start> <push end> <frames> <A> <B> <B speed> <C>
product() {
  local n=$1 vid=$2 VE=$3 BX=$4 BY=$5 Z=$6 Z0=$7 Z1=$8 frames=$9 A=${10} B=${11} SP=${12} C=${13}
  local D=$VE TL=$(awk "BEGIN{print $VE-0.55}") TF=$(awk "BEGIN{print $VE-0.3}")
  local t="(on/30)" ZB=1.1
  local q="clip(($t-$Z0)/($Z1-$Z0),0,1)"; local P="($q*$q*(3-2*$q))"
  local ZE="($ZB+($Z-$ZB)*$P)"
  local qt="clip((t-$Z0)/($Z1-$Z0),0,1)"; local PT="($qt*$qt*(3-2*$qt))"
  # handheld offsets in output px: slow drift + bob + a little jitter, amplitude easing from 22px to 7px at the scan
  local AMP="(22-15*$P)"
  local HX="$AMP*(0.6*sin($t*1.3)+0.3*sin($t*2.9+1)+0.15*sin($t*7.1))"
  local HY="$AMP*(0.6*sin($t*1.7+2)+0.35*sin($t*3.7)+0.15*sin($t*8.3))"
  local XC="(2160-2160/$ZE)/2" YC="(3840-3840/$ZE)/2"
  local XT="(2*$BX-1080/$ZE)" YT="(2*$BY-2134/$ZE)"
  local X="clip((1-$P)*$XC+$P*$XT+2*$HX/$ZE,0,2160-2160/$ZE)"
  local Y="clip((1-$P)*$YC+$P*$YT+2*$HY/$ZE,0,3840-3840/$ZE)"
  # 1) camera layer
  $FF -v error -y -t $D -i "$vid" -filter_complex "\
[0:v]fps=30,scale=2160:3840:flags=lanczos,rotate=a='(0.010-0.006*$PT)*sin(t*1.1)+0.004*sin(t*2.7)':ow=iw:oh=ih:c=black,\
zoompan=z='$ZE':x='$X':y='$Y':d=1:s=1080x1920:fps=30[v];[0:a]volume=0.6,aresample=48000[a]" \
    -map "[v]" -map "[a]" $ENC -c:a aac -ar 48000 -t $D "$T/$n-cam.mp4"
  $FF -v error -y -ss $(awk "BEGIN{print $D-0.1}") -i "$T/$n-cam.mp4" -frames:v 1 "$T/$n-bg.png"
  # 2) scan shot
  $FF -v error -y -i "$T/$n-cam.mp4" -loop 1 -framerate 30 -t $D -i "$LOGO" -loop 1 -framerate 30 -t $D -i "$CAP/frame.png" \
    -loop 1 -framerate 30 -t $D -i "$CAP/frame-hit.png" -loop 1 -framerate 30 -t $D -i "$CAP/label$n.png" -i "$T/beep.wav" -filter_complex "\
[0:v][1:v]overlay[c1];[c1][2:v]overlay=enable='lt(t,$TL)'[c2];[c2][3:v]overlay=enable='gte(t,$TL)'[c3];[c3][4:v]overlay[c4];\
[c4]eq=brightness='if(gte(t,$TF),0.85*(1-abs(t-($TF+0.12))/0.25),0)':eval=frame[v];\
[5:a]adelay=$(awk "BEGIN{printf \"%d\", $TL*1000}")|$(awk "BEGIN{printf \"%d\", $TL*1000}")[bp];[0:a][bp]amix=inputs=2:duration=first:normalize=0[a]" \
    -map "[v]" -map "[a]" $ENC -c:a aac -ar 48000 -t $D "$T/$n-a-scan.mp4"
  # 3) verdict
  local SA=${A%:*} EA=${A#*:} SB=${B%:*} EB=${B#*:} SC=${C%:*} EC=${C#*:}
  local DUR=$(awk "BEGIN{print ($EA-$SA)+($EB-$SB)/$SP+($EC-$SC)}")
  local HOLD=$(awk "BEGIN{print ($EA-$SA)+($EB-$SB)/$SP}")
  $FF -v error -y -f concat -safe 0 -i "$frames/frames.ffconcat" -loop 1 -t $DUR -framerate 30 -i "$T/$n-bg.png" -loop 1 -t $DUR -framerate 30 -i "$LOGO" \
    -f lavfi -t $DUR -i "color=c=0x1F1513:s=1080x1920:r=30,format=rgba" -loop 1 -t $DUR -framerate 30 -i "$CAP/sub$n.png" \
    -stream_loop 2 -i "$vid" -filter_complex "\
[0:v]fps=30,format=rgb24,split=3[s1][s2][s3];\
[s1]trim=$SA:$EA,setpts=PTS-STARTPTS[a];[s2]trim=$SB:$EB,setpts=(PTS-STARTPTS)/$SP[b];[s3]trim=$SC:$EC,setpts=PTS-STARTPTS[c];\
[a][b][c]concat=n=3:v=1,colorkey=0xFF00FF:0.25:0.06[sheet];\
[1:v]format=rgba[cam];[cam][2:v]overlay[cl];[3:v]colorchannelmixer=aa=0.45,fade=t=in:st=0:d=0.3:alpha=1[dim];[cl][dim]overlay[cd];\
[cd][sheet]overlay=shortest=1[v0];[v0][4:v]overlay=enable='gte(t,$HOLD)'[v];\
[5:a]volume=0.35,aresample=48000,afade=t=out:st=$(awk "BEGIN{print $DUR-0.4}"):d=0.4[aa]" \
    -map "[v]" -map "[aa]" $ENC -c:a aac -ar 48000 -t $DUR "$T/$n-b-verdict.mp4"
}

#       n  video                        end  barcode bx by  zoom push s0-s1  frames   A        B        Bspd C
product 1 "$IN/pov3-cool-ranch.mp4"     6.0  565  1110      1.5  4.3  5.4    "$S/p1"  0.15:2.6 3.4:8.0  2.0  8.0:10.3

ls "$T"/1-[ab]-*.mp4 | sed "s/.*/file '&'/" > "$T/list.txt"
$FF -v error -y -f concat -safe 0 -i "$T/list.txt" $ENC -c:a aac -ar 48000 -movflags +faststart "$OUT"
echo "done: $OUT"
