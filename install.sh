#!/usr/bin/env bash
# Colors — installer
# Usage: curl -fsSL https://raw.githubusercontent.com/colors-agent/colors/main/install.sh | bash

set -e

INSTALL_DIR="$HOME/.colors-agent"
BIN_DIR="$HOME/.local/bin"

echo ""
echo "  Colors — local AI agent"
echo ""

# ── Dependencies ──────────────────────────────────────────────────────────────

# Node.js >= 18
if ! command -v node &>/dev/null; then
  echo "  Error: Node.js is required (>= 18)"
  echo "  Install it: https://nodejs.org/en/download"
  echo ""
  echo "  On Ubuntu/Debian:"
  echo "    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "    sudo apt-get install -y nodejs"
  exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "  Error: Node.js >= 18 required. You have $(node --version)"
  exit 1
fi

# git
if ! command -v git &>/dev/null; then
  echo "  Error: git is required"
  echo "  Install: sudo apt install git  (or brew install git on macOS)"
  exit 1
fi

# ── Install or update ─────────────────────────────────────────────────────────

if [ -d "$INSTALL_DIR/.git" ]; then
  echo "  Updating Colors..."
  cd "$INSTALL_DIR"
  git pull --quiet origin main
else
  echo "  Downloading Colors..."
  git clone --quiet --depth=1 https://github.com/colors-agent/colors.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo "  Installing dependencies..."
npm install --silent --omit=dev

echo "  Building..."
npm run build --silent

# ── Create launcher ───────────────────────────────────────────────────────────

mkdir -p "$BIN_DIR"

cat > "$BIN_DIR/colors" << LAUNCHER
#!/usr/bin/env bash
exec node "$INSTALL_DIR/dist/cli.js" "\$@"
LAUNCHER

chmod +x "$BIN_DIR/colors"

# ── Shell PATH check ──────────────────────────────────────────────────────────

PATH_LINE='export PATH="$HOME/.local/bin:$PATH"'
SHELL_RC=""

if [ -f "$HOME/.zshrc" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ] && ! grep -q ".local/bin" "$SHELL_RC"; then
  echo "" >> "$SHELL_RC"
  echo "# Colors" >> "$SHELL_RC"
  echo "$PATH_LINE" >> "$SHELL_RC"
  echo "  Added ~/.local/bin to PATH in $SHELL_RC"
fi

# ── Setup wizard ──────────────────────────────────────────────────────────────

echo ""
echo "  ✓ Colors installed at $INSTALL_DIR"
echo ""
echo "  ─────────────────────────────────────────────"
echo "  Before you run Colors, set two things:"
echo ""
echo "  1. Your AI API key (Colors never stores this):"
echo "     export ANTHROPIC_API_KEY=sk-ant-..."
echo ""
echo "  2. Your memory passphrase (encrypts your memory store):"
echo "     export COLORS_PASSPHRASE=something-only-you-know"
echo ""
echo "  Add both to your ~/.bashrc or ~/.zshrc so they persist."
echo "  ─────────────────────────────────────────────"
echo ""
echo "  Then open Colors:"
echo ""
echo "    colors web      ← browser UI (recommended for most users)"
echo "    colors chat     ← terminal"
echo "    colors help     ← all commands"
echo ""
echo "  Telegram / Discord / WhatsApp:"
echo "    colors channel telegram"
echo "    colors channel discord"
echo "    colors channel whatsapp"
echo ""
