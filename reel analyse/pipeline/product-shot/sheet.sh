#!/usr/bin/env bash
# Contact sheet with timestamps.  usage: sheet.sh <video> <out.jpg> [fps=4] [start=0] [dur=all]
set -euo pipefail
FF=/d/AIVideoEditor2/Setup/.tools/ffmpeg/ffmpeg.exe
V=$1 O=$2 FPS=${3:-4} SS=${4:-0} DUR=${5:-}
T=""; [ -n "$DUR" ] && T="-t $DUR"
N=$("${FF%ffmpeg.exe}ffprobe.exe" -v error -show_entries format=duration -of csv=p=0 "$V")
COLS=16
$FF -v error -y -ss $SS $T -i "$V" -vf "fps=$FPS,scale=150:-1,drawtext=fontfile='C\:/Windows/Fonts/arialbd.ttf':text='%{pts\:hms}':x=2:y=2:fontsize=13:fontcolor=yellow:box=1:boxcolor=black@0.6,tile=${COLS}x3" -frames:v 1 "$O"
echo "sheet: $O (source ${N}s)"
