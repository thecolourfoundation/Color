#!/usr/bin/env bash
# Colors — Demo GIF Generator
#
# Generates the README demo GIF using asciinema + agg
#
# Requirements:
#   npm install -g asciinema
#   cargo install agg   (or: brew install agg)
#
# Usage:
#   chmod +x scripts/record-demo.sh
#   ./scripts/record-demo.sh

set -e

OUTPUT_CAST="demo.cast"
OUTPUT_GIF="demo.gif"

echo ""
echo "  Colors — Demo Recorder"
echo "  This will record the injection demo and export a GIF."
echo ""

# Check asciinema
if ! command -v asciinema &> /dev/null; then
  echo "  Install asciinema first: npm install -g asciinema"
  exit 1
fi

# Record the demo
echo "  Recording demo..."
asciinema rec "$OUTPUT_CAST" \
  --title "Colors — Blocking a ClawJacked Attack" \
  --cols 80 \
  --rows 24 \
  --command "npm run demo:injection" \
  --overwrite

echo "  Recorded: $OUTPUT_CAST"

# Convert to GIF if agg is available
if command -v agg &> /dev/null; then
  echo "  Converting to GIF..."
  agg \
    --theme "dracula" \
    --font-size 14 \
    --line-height 1.4 \
    --speed 1.2 \
    "$OUTPUT_CAST" "$OUTPUT_GIF"
  echo "  GIF saved: $OUTPUT_GIF"
  echo "  Drop demo.gif into the repo root and update README.md"
else
  echo ""
  echo "  agg not found — install with: cargo install agg"
  echo "  Or upload $OUTPUT_CAST to https://asciinema.org and embed the link."
  echo ""
  echo "  To embed asciinema player in README:"
  echo '  [![Demo](https://asciinema.org/a/YOUR_ID.svg)](https://asciinema.org/a/YOUR_ID)'
fi

echo ""
echo "  Done."
