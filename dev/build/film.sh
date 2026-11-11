#!/bin/bash
# Makes the opening film's web files (dev/src/film/) from the Higgsfield originals in dev/media/.
# Run it by hand only when an original changes, then run dev/build.sh, which copies the web files into lib/.
# Files in lib/ are cached by browsers for a year, so raise V whenever the films change: the new names make browsers fetch them.
#   hall-wide / hall-tall : the sunlit hall behind the paintings while the gallery loads (computers / phones), made into a
#                           seamless loop by blending the last LOOP seconds into the start.
#   doors                 : the bronze doors opening as visitors enter.
#   *-ink                 : the same three films drawn in ink on paper (dev/build/inkfilm.py, no AI credits), for the ink look.
#                           INK=1 bash dev/build/film.sh makes only these.
# Needs ffmpeg with libx264 and libvpx-vp9.
set -e
DEV="$(cd "$(dirname "$0")/.." && pwd)"; IN="$DEV/media"; OUT="$DEV/src/film"; V=1; LOOP=1.5
mkdir -p "$OUT"
len(){ ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }
enc(){  # input, output name: H.264 MP4 for Safari and most browsers, VP9 WebM for the rest; no sound
  ffmpeg -v error -y -i "$1" -an -c:v libx264 -preset slow -crf ${XCRF:-26} -pix_fmt yuv420p -profile:v high -level 4.0 -movflags +faststart "$OUT/$2.mp4"
  ffmpeg -v error -y -i "$1" -an -c:v libvpx-vp9 -crf ${WCRF:-36} -b:v 0 -row-mt 1 -deadline good -cpu-used 2 "$OUT/$2.webm"
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
  ffmpeg -v error -y -i "$tmp" -frames:v 1 -vf "scale='min(1280,iw)':-2" -q:v ${JQ:-4} "$OUT/$2.jpg"     # first frame (at most 1280 wide): shown until the film plays, and instead of it
  rm -f "$tmp"
}
if [ -z "$INK" ]; then
loop "$IN/hall-wide.mp4" "hall-wide-v$V" 0
loop "$IN/hall-tall.mp4" "hall-tall-v$V" 1.5     # its first second and a half is darker than the rest, so it starts later
enc "$IN/doors.mp4" "doors-v$V"
fi
# the ink drawings of the same films (their own version number, VI)
VI=1; T=$(mktemp -d); WCRF=46; JQ=7; XCRF=28     # pen lines and paper grain are fine detail: a little more compression keeps the files small
python3 "$DEV/build/inkfilm.py" "$IN/hall-wide.mp4" "$T/hall-wide.mkv" 1920   # computers: drawn at full HD for crisp pen lines
python3 "$DEV/build/inkfilm.py" "$IN/hall-tall.mp4" "$T/hall-tall.mkv"
python3 "$DEV/build/inkfilm.py" "$IN/doors.mp4" "$T/doors.mkv" 1920
loop "$T/hall-wide.mkv" "hall-wide-ink-v$VI" 0
loop "$T/hall-tall.mkv" "hall-tall-ink-v$VI" 1.5
enc "$T/doors.mkv" "doors-ink-v$VI"
rm -rf "$T"
ls -l "$OUT"
