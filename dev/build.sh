#!/bin/bash
# Builds Pam's Gallery from dev/src/House of Pam.html and dev/api/app.src.js into the live files at the repo root:
#   index.html, api/app.js and any new pictures in lib/. Then commit and push; Vercel publishes automatically.
# DREAM=1 bash dev/build.sh makes the dream-look preview (only on the dream-look branch; never publish it to main).
# Needs: python3 with Pillow, node 18+. Fonts used for the share card and watermarks: Lora Italic and Inter (see CLAUDE.md).
set -e
DEV="$(cd "$(dirname "$0")" && pwd)"; REPO="$(cd "$DEV/.." && pwd)"; OUT="$DEV/out"
mkdir -p "$OUT" "$REPO/lib" "$REPO/api"
python3 "$DEV/build/mk3.py" "$DEV/src/House of Pam.html" "$OUT/full.html" ${DREAM:+--dream} >/dev/null           # the gallery page with three.js
rm -rf "$OUT/lib2"; python3 "$DEV/build/split4.py" "$OUT/full.html" "$OUT/index.html" "$OUT/lib2" > "$OUT/split.log"   # pictures out into files (watermarks, copyright)
NEW=0; for f in "$OUT"/lib2/*; do b=$(basename "$f"); [ -e "$REPO/lib/$b" ] || { cp "$f" "$REPO/lib/"; NEW=$((NEW+1)); }; done; echo "new pictures: $NEW"
for f in "$DEV"/src/film/* "$DEV"/src/clay/*; do [ -e "$REPO/lib/$(basename "$f")" ] || cp "$f" "$REPO/lib/"; done   # opening films (made by dev/build/film.sh) and clay pictures
python3 "$DEV/build/fill4.py" "$OUT/index.html" "$DEV/api/app.src.js" "$OUT/app.js" >/dev/null && node --check "$OUT/app.js"   # catalogue of built-in works into the server
python3 "$DEV/build/webp.py" "$OUT/app.js" "$REPO/lib"                                          # smaller WebP copies
CARD=$(python3 "$DEV/build/sharecard.py" "$OUT/app.js" "$OUT/lib2"); cp -n "$OUT/lib2/$(basename "$CARD")" "$REPO/lib/" 2>/dev/null || true
sed -i.bak "s#__SHARECARD__#https://itsamepameo.com$CARD#g" "$OUT/index.html" && rm -f "$OUT/index.html.bak"
python3 "$DEV/build/dbgify.py" "$OUT/index.html" "$OUT/dbg.html"                                  # a test copy for the local server
python3 "$DEV/build/csp.py" "$OUT/index.html"; python3 "$DEV/build/csp.py" "$OUT/dbg.html"        # security policy hashes (always last)
cp "$OUT/index.html" "$REPO/index.html"; cp "$OUT/app.js" "$REPO/api/app.js"
echo "built: index.html, api/app.js and lib/ updated at $REPO"
