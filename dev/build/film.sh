#!/bin/bash
# Makes the opening film's web files (dev/src/film/) from the Higgsfield originals in dev/media/.
# Run it by hand only when an original changes, then run dev/build.sh, which copies the web files into lib/.
# Files in lib/ are cached by browsers for a year, so raise V whenever the films change: the new names make browsers fetch them.
#   hall-wide / hall-tall : the sunlit hall behind the paintings while the gallery loads (computers / phones), made into a
#                           seamless loop by blending the last LOOP seconds into the start.
#   doors                 : the bronze doors opening as visitors enter.
# Needs ffmpeg with libx264 and libvpx-vp9.
set -e
DEV="$(cd "$(dirname "$0")/.." && pwd)"; IN="$DEV/media"; OUT="$DEV/src/film"; V=1; LOOP=1.5
mkdir -p "$OUT"
len(){ ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
enc(){  # input, output name: H.264 MP4 for Safari and most browsers, VP9 WebM for the rest; no sound
  ffmpeg -v error -y -i "$1" -an -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -profile:v high -level 4.0 -movflags +faststart "$OUT/$2.mp4"
  ffmpeg -v error -y -i "$1" -an -c:v libvpx-vp9 -crf 36 -b:v 0 -row-mt 1 -deadline good -cpu-used 2 "$OUT/$2.webm"
}
loop(){  # input, output name, seconds to skip at the start
  local T X=$LOOP tmp; T=$(python3 -c "print(round($(len "$1")-$3,3))"); tmp=$(mktemp --suffix=.mkv)
  ffmpeg -v error -y -i "$1" -filter_complex "[0:v]trim=start=$3,setpts=PTS-STARTPTS,split=3[a][b][c];\
[a]trim=start=$X:end=$(python3 -c "print($T-$X)"),setpts=PTS-STARTPTS[body];\
[b]trim=start=$(python3 -c "print($T-$X)"):end=$T,setpts=PTS-STARTPTS[tail];\
[c]trim=start=0:end=$X,setpts=PTS-STARTPTS[head];\
[tail][head]xfade=transition=fade:duration=$X:offset=0[blend];[body][blend]concat=n=2:v=1:a=0[out]" \
    -map "[out]" -c:v ffv1 "$tmp"
  enc "$tmp" "$2"
  ffmpeg -v error -y -i "$tmp" -frames:v 1 -q:v 4 "$OUT/$2.jpg"     # first frame: shown until the film plays, and instead of it
  rm -f "$tmp"
}
loop "$IN/hall-wide.mp4" "hall-wide-v$V" 0
loop "$IN/hall-tall.mp4" "hall-tall-v$V" 1.5     # its first second and a half is darker than the rest, so it starts later
enc "$IN/doors.mp4" "doors-v$V"
ls -l "$OUT"
