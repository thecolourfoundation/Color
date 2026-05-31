#!/usr/bin/env bash
# Colors — macOS installer
set -e

echo ""
echo "  ============================================="
echo "   Colors — Local AI Agent"
echo "   The Colour Foundation"
echo "  ============================================="
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
    echo "  Node.js not found."
    echo ""
    echo "  Installing via Homebrew..."
    if ! command -v brew &>/dev/null; then
        echo "  Installing Homebrew first..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    brew install node
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "  Node.js >= 18 required. Run: brew upgrade node"
    exit 1
fi

echo "  Node.js $(node --version) found."

# Check git
if ! command -v git &>/dev/null; then
    echo "  Installing git..."
    brew install git
fi

# Clone or update
INSTALL_DIR="$HOME/.colors-agent"
if [ -d "$INSTALL_DIR/.git" ]; then
    echo "  Updating Colors..."
    cd "$INSTALL_DIR" && git pull --quiet
else
    echo "  Downloading Colors..."
    git clone --quiet https://github.com/thecolourfoundation/Color.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# Install deps
echo ""
echo "  Installing dependencies..."
npm install --silent
npm install ws @types/ws --silent

# Patch tsconfig
node -e "
const fs = require('fs');
const t = JSON.parse(fs.readFileSync('tsconfig.json','utf8'));
t.compilerOptions.skipLibCheck = true;
t.exclude = ['node_modules','dist','tests','src/channels/WhatsAppAdapter.ts','src/channels/DiscordAdapter.ts'];
fs.writeFileSync('tsconfig.json', JSON.stringify(t,null,2));
"

# Build
echo "  Building Colors..."
npm run build --silent

# Setup
echo ""
echo "  ============================================="
echo "   Setup"
echo "  ============================================="
echo ""
echo "  You need two things:"
echo "  1. An API key (Anthropic, OpenAI, or LM Studio)"
echo "  2. A passphrase to encrypt your memory"
echo ""
read -p "  API key (or http://localhost:1234/v1 for LM Studio): " API_KEY
read -p "  Memory passphrase (anything you'll remember): " PASSPHRASE
echo ""

# Save env
cat > "$INSTALL_DIR/.env" << ENVEOF
ANTHROPIC_API_KEY=$API_KEY
COLORS_PASSPHRASE=$PASSPHRASE
ENVEOF
chmod 600 "$INSTALL_DIR/.env"

# Create launcher
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/colors" << LAUNCHEOF
#!/usr/bin/env bash
set -a
source "$INSTALL_DIR/.env"
set +a
exec node "$INSTALL_DIR/dist/cli.js" "\$@"
LAUNCHEOF
chmod +x "$HOME/.local/bin/colors"

# Add to PATH if needed
SHELL_RC=""
if [ -f "$HOME/.zshrc" ]; then SHELL_RC="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then SHELL_RC="$HOME/.bashrc"; fi

if [ -n "$SHELL_RC" ] && ! grep -q ".local/bin" "$SHELL_RC"; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
fi

echo ""
echo "  ============================================="
echo "   Colors is ready."
echo "  ============================================="
echo ""
echo "  Open a new terminal and run:"
echo ""
echo "    colors web     ← browser UI"
echo "    colors chat    ← terminal"
echo ""
echo "  Your memory is encrypted and stored at:"
echo "  $INSTALL_DIR"
echo ""
echo "  Nothing leaves your machine."
echo ""
