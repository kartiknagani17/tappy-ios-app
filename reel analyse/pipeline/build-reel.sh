#!/usr/bin/env bash
# Builds the trial reel: hook (reference footage) -> 3x [AI video: hand turns the pack to its barcode,
# scan frame locks onto the barcode, flash -> real Tappy verdict over that camera view + tappy logo]
# -> CTA (reference footage). 1080x1920, 30 fps.
set -euo pipefail
FF=/d/AIVideoEditor2/Setup/.tools/ffmpeg/ffmpeg.exe
S="C:/Users/HP/AppData/Local/Temp/claude/13cbded61b820e19/4d0968cb-5bb2-466f-ae5d-d436fc13851b/scratchpad/rec"
IN="D:/tappy ios app/reel analyse/inputs"
REF="D:/tappy ios app/reel analyse/Video-70215.mp4"
OUT="D:/tappy ios app/reel analyse/tappy-clips/trial-reel.mp4"
T="$S/build"; rm -rf "$T"; mkdir -p "$T"
CAP="$S/cap"; LOGO="$S/logo.png"
ENC="-c:v libx264 -crf 17 -preset medium -pix_fmt yuv420p -r 30"
SILENT="-f lavfi -t 20 -i anullsrc=r=48000:cl=stereo"

# --- hook + CTA from the reference reel (muted), caption cards over the burned-in text ---
$FF -v error -y -ss 0 -t 3.0 -i "$REF" -i "$CAP/hook.png" $SILENT -filter_complex "[0:v]scale=1080:1920,fps=30[v];[v][1:v]overlay[o]" \
  -map "[o]" -map 2:a -shortest $ENC -c:a aac -ar 48000 "$T/00-hook.mp4"
$FF -v error -y -ss 39.5 -t 3.3 -i "$REF" -i "$CAP/cta.png" $SILENT -filter_complex "[0:v]scale=1080:1920,fps=30[v];[v][1:v]overlay[o]" \
  -map "[o]" -map 2:a -shortest $ENC -c:a aac -ar 48000 "$T/99-cta.mp4"

# Scan "beep".
$FF -v error -y -f lavfi -i "sine=f=1800:d=0.12" -af "afade=t=out:st=0.03:d=0.09,volume=0.5,aresample=48000,pan=stereo|c0=c0|c1=c0" "$T/beep.wav"

L=110; TH=12
corner="color=c=white:s=${L}x${L}:r=30,format=rgba,geq=r=255:g=255:b=255:a='if(lt(X,$TH)+lt(Y,$TH),255,0)'"

# product <n> <video> <start> <end> <speed> <barcode box x0 y0 x1 y1 (1080x1920)> <frames> <A> <B> <B speed> <C>
product() {
  local n=$1 vid=$2 VS=$3 VE=$4 VSP=$5 X0=$6 Y0=$7 X1=$8 Y1=$9 frames=${10} A=${11} B=${12} SP=${13} C=${14}
  local D=$(awk "BEGIN{printf \"%.3f\", ($VE-$VS)/$VSP}")
  local TC=$(awk "BEGIN{print $D-1.15}") TL=$(awk "BEGIN{print $D-0.6}") TF=$(awk "BEGIN{print $D-0.3}")
  # corner margin: hidden before TC, closes in onto the barcode by TL
  local M="if(lt(t,$TC),2000,if(lt(t,$TL),130*($TL-t)/($TL-$TC),0))"
  # 1) scan shot: the AI video (sped up a little) with Tappy's hint, then corners lock on the barcode, beep + flash
  $FF -v error -y -ss $VS -t $(awk "BEGIN{print $VE-$VS}") -i "$vid" -loop 1 -framerate 30 -t $D -i "$LOGO" \
    -f lavfi -t $D -i "$corner" -loop 1 -framerate 30 -t $D -i "$CAP/hint.png" -loop 1 -framerate 30 -t $D -i "$CAP/label$n.png" \
    -i "$T/beep.wav" -filter_complex "\
[0:v]setpts=(PTS-STARTPTS)/$VSP,scale=1080:1920:flags=lanczos,fps=30[cam];[cam][1:v]overlay[c1];\
[2:v]split=4[k1][k2][k3][k4];[k2]hflip[k2f];[k3]vflip[k3f];[k4]hflip,vflip[k4f];\
[c1][k1]overlay=x='$X0-$M':y='$Y0-$M':eval=frame[c2];[c2][k2f]overlay=x='$X1+$M-$L':y='$Y0-$M':eval=frame[c3];\
[c3][k3f]overlay=x='$X0-$M':y='$Y1+$M-$L':eval=frame[c4];[c4][k4f]overlay=x='$X1+$M-$L':y='$Y1+$M-$L':eval=frame[c5];\
[c5][3:v]overlay=enable='lt(t,$TL)'[c6];[c6][4:v]overlay[c7];\
[c7]eq=brightness='if(gte(t,$TF),0.85*(1-abs(t-($TF+0.12))/0.25),0)':eval=frame[v];\
[0:a]asetpts=(PTS-STARTPTS)/$VSP,atempo=$VSP,volume=0.6,aresample=48000[amb];[5:a]adelay=$(awk "BEGIN{printf \"%d\", $TF*1000}")|$(awk "BEGIN{printf \"%d\", $TF*1000}")[bp];\
[amb][bp]amix=inputs=2:duration=first:normalize=0[a]" \
    -map "[v]" -map "[a]" $ENC -c:a aac -ar 48000 -t $D "$T/$n-a-scan.mp4"

  # last camera frame (barcode in view) = what's behind the sheet, like the live camera in the app
  $FF -v error -y -ss $(awk "BEGIN{print $VE-0.05}") -i "$vid" -vf "scale=1080:1920:flags=lanczos" -frames:v 1 "$T/$n-bg.png"

  # 2) verdict: real Tappy sheet (keyed off magenta) over that camera view + logo + the app's dim
  local SA=${A%:*} EA=${A#*:} SB=${B%:*} EB=${B#*:} SC=${C%:*} EC=${C#*:}
  local DUR=$(awk "BEGIN{print ($EA-$SA)+($EB-$SB)/$SP+($EC-$SC)}")
  local HOLD=$(awk "BEGIN{print ($EA-$SA)+($EB-$SB)/$SP}")
  $FF -v error -y -f concat -safe 0 -i "$frames/frames.ffconcat" -loop 1 -t $DUR -framerate 30 -i "$T/$n-bg.png" -loop 1 -t $DUR -framerate 30 -i "$LOGO" \
    -f lavfi -t $DUR -i "color=c=0x1F1513:s=1080x1920:r=30,format=rgba" -loop 1 -t $DUR -framerate 30 -i "$CAP/sub$n.png" \
    -stream_loop 1 -i "$vid" -filter_complex "\
[0:v]fps=30,format=rgb24,split=3[s1][s2][s3];\
[s1]trim=$SA:$EA,setpts=PTS-STARTPTS[a];[s2]trim=$SB:$EB,setpts=(PTS-STARTPTS)/$SP[b];[s3]trim=$SC:$EC,setpts=PTS-STARTPTS[c];\
[a][b][c]concat=n=3:v=1,colorkey=0xFF00FF:0.25:0.06[sheet];\
[1:v]format=rgba[cam];[cam][2:v]overlay[cl];[3:v]colorchannelmixer=aa=0.45,fade=t=in:st=0:d=0.3:alpha=1[dim];[cl][dim]overlay[cd];\
[cd][sheet]overlay=shortest=1[v0];[v0][4:v]overlay=enable='gte(t,$HOLD)'[v];\
[5:a]volume=0.35,aresample=48000,afade=t=out:st=$(awk "BEGIN{print $DUR-0.4}"):d=0.4[aa]" \
    -map "[v]" -map "[aa]" $ENC -c:a aac -ar 48000 -t $DUR "$T/$n-b-verdict.mp4"
}

#        n  video                            VS   VE   VSP  barcode box (1080x1920)   frames  A        B         speed C
product 1 "$IN/vid1-cool-ranch.mp4"   0.3  5.6  1.4  380 1320 865 1570       "$S/p1" 0.15:2.6 3.4:8.0   2.0   8.0:10.3
product 2 "$IN/vid2-pringles-bbq.mp4" 0.2  4.6  1.3  395 1035 700 1345       "$S/p2" 0.15:2.6 3.4:12.6  3.7   12.6:14.8
product 3 "$IN/vid3-skinnypop.mp4"    0.3  6.0  1.5  435 1190 800 1435       "$S/p3" 0.15:2.6 3.4:8.0   2.0   8.0:10.3

ls "$T"/00-hook.mp4 "$T"/[1-3]-*.mp4 "$T"/99-cta.mp4 | sed "s/.*/file '&'/" > "$T/list.txt"
$FF -v error -y -f concat -safe 0 -i "$T/list.txt" $ENC -c:a aac -ar 48000 -movflags +faststart "$OUT"
echo "done: $OUT"
