#!/usr/bin/env bash
# One frame at time t with a measuring grid (cells = 108 x 96 px of the 1080x1920 frame), shown at half size.
# Read the barcode centre: x = (col px in image)*2, y = (row px in image)*2.   usage: grid.sh <video> <t> <out.jpg>
set -euo pipefail
FF=/d/AIVideoEditor2/Setup/.tools/ffmpeg/ffmpeg.exe
$FF -v error -y -ss $2 -i "$1" -vf "scale=1080:1920,drawgrid=w=108:h=96:t=2:c=yellow@0.6,scale=540:-1" -frames:v 1 "$3"
echo "grid: $3"
