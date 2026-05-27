# Running Colors 24/7

Colors runs as a background service via your OS process manager.
Pick your platform:

---

## Linux (systemd)

**1. Create your env file — never commit this**
```bash
mkdir -p ~/.colors
cat > ~/.colors/.env << EOF
ANTHROPIC_API_KEY=sk-ant-...
COLORS_PASSPHRASE=your-passphrase
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_ALLOWED_USERS=*
EOF
chmod 600 ~/.colors/.env
```

**2. Install the service**
```bash
sudo cp deploy/colors@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable colors@$USER
sudo systemctl start colors@$USER
```

**3. Check it's running**
```bash
sudo systemctl status colors@$USER
journalctl -u colors@$USER -f   # live logs
```

**4. Restart after updates**
```bash
sudo systemctl restart colors@$USER
```

---

## macOS (launchd)

**1. Edit the plist** — fill in YOUR_USERNAME and credentials in `deploy/com.colors-agent.colors.plist`

**2. Install**
```bash
cp deploy/com.colors-agent.colors.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.colors-agent.colors.plist
```

**3. Check logs**
```bash
tail -f /tmp/colors-agent.log
tail -f /tmp/colors-agent-error.log
```

**4. Restart**
```bash
launchctl unload ~/Library/LaunchAgents/com.colors-agent.colors.plist
launchctl load ~/Library/LaunchAgents/com.colors-agent.colors.plist
```

---

## VPS / Cloud (cheapest path)

A $4/month VPS (Hetzner CX11, DigitalOcean Basic) runs Colors for a full team.

```bash
# On the VPS
curl -fsSL https://raw.githubusercontent.com/colors-agent/colors/main/install.sh | bash
# Set up systemd as above
# Done — Colors runs 24/7, survives reboots
```

Colors uses ~50MB RAM at idle. The VPS cost is the only infrastructure cost.
Your API key costs are per-call, not per-month.

---

## Channel selection for 24/7

For 24/7 deployment, Telegram is the most reliable channel:
- Long polling reconnects automatically on network drop
- No webhook server to maintain
- Bot API is highly stable

Discord Gateway also reconnects automatically.
WhatsApp is session-based — if the phone that scanned the QR logs out, you need to re-pair.
