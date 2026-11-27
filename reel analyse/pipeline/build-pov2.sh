#!/usr/bin/env bash
# POV sample: [AI clip: hand picks pack off the shelf, turns it, barcode moves into Tappy's FIXED scan frame
# -> frame turns green + beep + flash -> real Tappy verdict over that camera view] x2, back to back.
set -euo pipefail
FF=/d/AIVideoEditor2/Setup/.tools/ffmpeg/ffmpeg.exe
S="C:/Users/HP/AppData/Local/Temp/claude/13cbded61b820e19/4d0968cb-5bb2-466f-ae5d-d436fc13851b/scratchpad/rec"
IN="D:/tappy ios app/reel analyse/inputs"
OUT="D:/tappy ios app/reel analyse/tappy-clips/pov-messy-cool-ranch.mp4"
T="$S/build-pov2"; rm -rf "$T"; mkdir -p "$T"
CAP="$S/cap"; LOGO="$S/logo.png"
ENC="-c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r 30"
$FF -v error -y -f lavfi -i "sine=f=1800:d=0.12" -af "afade=t=out:st=0.03:d=0.09,volume=0.5,aresample=48000,pan=stereo|c0=c0|c1=c0" "$T/beep.wav"

# product <n> <video> <speed> <barcode centre bx by (1080x1920 coords, last frame)> <zoom> <zoom start> <zoom end (source s)> <frames> <A> <B> <B speed> <C>
product() {
  local n=$1 vid=$2 SP0=$3 BX=$4 BY=$5 Z=$6 Z0=$7 Z1=$8 frames=$9 A=${10} B=${11} SP=${12} C=${13}
  local D=$(awk "BEGIN{printf \"%.3f\", 8.0/$SP0}")
  local T0=$(awk "BEGIN{print $Z0/$SP0}") T1=$(awk "BEGIN{print $Z1/$SP0}")
  local TL=$(awk "BEGIN{print $D-0.55}") TF=$(awk "BEGIN{print $D-0.3}")
  # eased 0..1 progress of the "aim" push-in, then zoom + pan that lands the barcode in the frame centre (540,1067)
  local P="(clip((on/30-$T0)/($T1-$T0),0,1)*clip((on/30-$T0)/($T1-$T0),0,1)*(3-2*clip((on/30-$T0)/($T1-$T0),0,1)))"
  local ZE="1+($Z-1)*$P"
  # 1) camera layer (no overlays): AI clip sped up a touch, upscaled, with the aim push-in
  $FF -v error -y -i "$vid" -filter_complex "\
[0:v]setpts=PTS/$SP0,fps=30,scale=2160:3840:flags=lanczos,\
zoompan=z='$ZE':x='$P*(2*$BX-1080/($ZE)+5*sin(on*0.9)+3*sin(on*2.3))':y='$P*(2*$BY-2134/($ZE)+5*sin(on*0.7+1)+3*sin(on*1.9))':d=1:s=1080x1920:fps=30[v];\
[0:a]atempo=$SP0,volume=0.6,aresample=48000[a]" -map "[v]" -map "[a]" $ENC -c:a aac -ar 48000 -t $D "$T/$n-cam.mp4"
  # what's behind the verdict sheet = the camera at the moment of the scan
  $FF -v error -y -ss $(awk "BEGIN{print $D-0.1}") -i "$T/$n-cam.mp4" -frames:v 1 "$T/$n-bg.png"
  # 2) scan shot: logo + Tappy's fixed scan frame the whole time; frame turns green on lock, beep + flash
  $FF -v error -y -i "$T/$n-cam.mp4" -loop 1 -framerate 30 -t $D -i "$LOGO" -loop 1 -framerate 30 -t $D -i "$CAP/frame.png" \
    -loop 1 -framerate 30 -t $D -i "$CAP/frame-hit.png" -loop 1 -framerate 30 -t $D -i "$CAP/label$n.png" -i "$T/beep.wav" -filter_complex "\
[0:v][1:v]overlay[c1];[c1][2:v]overlay=enable='lt(t,$TL)'[c2];[c2][3:v]overlay=enable='gte(t,$TL)'[c3];[c3][4:v]overlay[c4];\
[c4]eq=brightness='if(gte(t,$TF),0.85*(1-abs(t-($TF+0.12))/0.25),0)':eval=frame[v];\
[5:a]adelay=$(awk "BEGIN{printf \"%d\", $TL*1000}")|$(awk "BEGIN{printf \"%d\", $TL*1000}")[bp];[0:a][bp]amix=inputs=2:duration=first:normalize=0[a]" \
    -map "[v]" -map "[a]" $ENC -c:a aac -ar 48000 -t $D "$T/$n-a-scan.mp4"
  # 3) verdict: real Tappy sheet (keyed off magenta) over that camera view + logo + the app's dim
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

#       n  video                          speed  barcode bx by  zoom  zoom s0-s1  frames   A        B         Bspd  C
product 1 "$IN/pov2-cool-ranch.mp4"       1.25   565  1110      1.5   6.2  7.4    "$S/p1"  0.15:2.6 3.4:8.0   2.0   8.0:10.3

ls "$T"/1-[ab]-*.mp4 | sed "s/.*/file '&'/" > "$T/list.txt"
$FF -v error -y -f concat -safe 0 -i "$T/list.txt" $ENC -c:a aac -ar 48000 -movflags +faststart "$OUT"
echo "done: $OUT"
