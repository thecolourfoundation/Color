#!/usr/bin/env bash
# Colors — Install Script
# curl -fsSL https://raw.githubusercontent.com/thecolourfoundation/Color/main/install.sh | bash

set -e

REPO="https://github.com/thecolourfoundation/Color.git"
INSTALL_DIR="$HOME/.colors-agent"
BIN_DIR="$HOME/.local/bin"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

print()  { echo -e "$1"; }
ok()     { echo -e "${GREEN}  ✓  $1${RESET}"; }
info()   { echo -e "${CYAN}  →  $1${RESET}"; }
err()    { echo -e "${RED}  ✗  $1${RESET}"; exit 1; }

print ""
print "${BOLD}  Colors — AI Agent Installer${RESET}"
print "${DIM}  Local. Encrypted. Conscious.${RESET}"
print ""

# ── Check Node ───────────────────────────────────────────────────────────────
info "Checking Node.js (>=18 required)..."
if ! command -v node &> /dev/null; then
  err "Node.js not found. Install from https://nodejs.org and try again."
fi

NODE_VER=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_VER" -lt 18 ]; then
  err "Node.js 18+ required. Current: $(node --version)"
fi
ok "Node.js $(node --version)"

# ── Check Git ─────────────────────────────────────────────────────────────────
if ! command -v git &> /dev/null; then
  err "git not found. Install git and try again."
fi
ok "git $(git --version | cut -d' ' -f3)"

# ── Clone ────────────────────────────────────────────────────────────────────
info "Cloning Colors to $INSTALL_DIR..."
if [ -d "$INSTALL_DIR" ]; then
  print "${DIM}  Directory exists — pulling latest...${RESET}"
  git -C "$INSTALL_DIR" pull --quiet
else
  git clone --quiet "$REPO" "$INSTALL_DIR"
fi
ok "Repository ready"

# ── Install deps ──────────────────────────────────────────────────────────────
info "Installing dependencies..."
cd "$INSTALL_DIR"
npm install --silent
ok "Dependencies installed"

# ── Build ─────────────────────────────────────────────────────────────────────
info "Building..."
npm run build --silent
ok "Build complete"

# ── Link CLI ──────────────────────────────────────────────────────────────────
mkdir -p "$BIN_DIR"
ln -sf "$INSTALL_DIR/dist/cli.js" "$BIN_DIR/colors"
chmod +x "$INSTALL_DIR/dist/cli.js"

# ── Done ──────────────────────────────────────────────────────────────────────
print ""
print "  ${BOLD}Colors installed.${RESET}"
print ""
print "  ${CYAN}Add to your PATH if needed:${RESET}"
print "  ${DIM}export PATH=\"\$HOME/.local/bin:\$PATH\"${RESET}"
print ""
print "  ${CYAN}Set your API key:${RESET}"
print "  ${DIM}export ANTHROPIC_API_KEY=sk-ant-...${RESET}"
print ""
print "  ${CYAN}Start Colors:${RESET}"
print "  ${DIM}colors chat${RESET}      # terminal"
print "  ${DIM}colors web${RESET}       # browser UI"
print ""
print "  ${CYAN}Run the security demo:${RESET}"
print "  ${DIM}cd $INSTALL_DIR && npm run demo:injection${RESET}"
print ""
print "  ${DIM}Research: github.com/thecolourfoundation/Color/blob/main/RESEARCH.md${RESET}"
print ""
