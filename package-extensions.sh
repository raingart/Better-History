#!/bin/sh
# chmod a+x package-extensions.sh

ver="$(cat manifest.json | jq -r '.version')" #need installed - jq
# need after git push
# ver="$(git show HEAD:manifest.json | grep '"version"' | cut -d\" -f4)"
filename="/tmp/history-extensions_v${ver}.zip"
# TODAY=$(date)

echo "Zipping extension..."
rm $filename
zip -q -r $filename \
                  _locales \
                  css/*/*.css \
                  css/*.css \
                  html/*.html \
                  icons/16.png \
                  icons/32.png \
                  icons/48.png \
                  icons/64.png \
                  icons/128.png \
                  js/*.js \
                  js/*/*.js \
                  manifest.json \
 --exclude="*/-*.*" \
#  -x \*.DS_Store
# -z $TODAY

echo "Compressed $filename"
