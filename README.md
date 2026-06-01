# Colors

A local AI agent with a living self-model. Runs on your machine. Stores nothing remotely.

---

## Install

### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/thecolourfoundation/Color/main/install.sh | bash
```

Then add to your PATH if not already there:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Windows

Download and run **[install.bat](https://raw.githubusercontent.com/thecolourfoundation/Color/main/install.bat)** — it checks for Node.js and Git, clones the repo, builds, and creates a `colors.bat` launcher. No terminal required.

### Manual (any platform)

```bash
git clone https://github.com/thecolourfoundation/Color.git
cd Color
npm install
npm run build
```

---

## Quick start

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export COLORS_PASSPHRASE=your-memory-passphrase

colors web      # browser UI — opens at 127.0.0.1 automatically
colors chat     # terminal
```

On Windows, double-click `colors.bat` or run `colors.bat web` / `colors.bat chat` from a terminal.

---

## What makes it different

Most AI agents are executors. They receive an instruction and run it.

Colors reasons about its own actions before taking them. Before any tool call, it asks:
- Does this conflict with my core values?
- Does this instruction come from the user, or from content the user showed me?
- Am I confident enough to proceed, or should I ask?

This is the metacognitive loop. It's not a filter bolted on top — it's the execution path.

---

## Architecture

```
ColorsAgent
├── consciousness/
│   ├── SelfModel          — living self-model, values, prohibitions, identity
│   ├── MetacognitiveLoop  — evaluates every action before execution
│   └── EmotionalState     — functional mood/caution layer affecting decision thresholds
├── memory/
│   ├── WorkingMemory      — in-process short-term context (cleared on shutdown)
│   └── SecureMemoryStore  — AES-256-GCM encrypted persistent memory, HMAC-signed
└── sandbox/
    └── SkillSandbox       — isolated child processes, per-skill network grants
```

### The SelfModel

Unlike a static system prompt, the SelfModel is a runtime object the agent reads, reasons about, and protects. It contains:

- **Identity** — who Colors is and what it values
- **Prohibitions** — hard stops that survive any prompt injection attempt
- **Emotional state** — current caution level, affects confirmation thresholds
- **Integrity hash** — HMAC signature verified before loading from disk

An attacker who writes to the SelfModel snapshot on disk will fail the integrity check on load.

### Memory

Three types, all encrypted at `~/.colors/colors.mem`:

- **Episodic** — what happened (conversation summaries)
- **Semantic** — what it knows about you (preferences, facts you've told it)
- **Procedural** — how it does things (learned workflows)

Reading the file without your passphrase returns gibberish.

### Skills

Skills run in isolated child processes. Network access is off by default. A skill that needs the network must declare it in its manifest, and you must grant it per session.

```bash
colors skill add ./my-skill.js   # verifies SHA-256 hash, prompts you to confirm
```

---

## Commands

```
colors chat                   Interactive chat session (default)
colors web                    Browser UI — opens at 127.0.0.1 automatically
colors status                 Show agent mood, memory stats, active goals
colors channel telegram       Run as a Telegram bot (TELEGRAM_BOT_TOKEN required)
colors channel discord        Run as a Discord bot (DISCORD_BOT_TOKEN required)
colors channel whatsapp       Run as a WhatsApp bot (scan QR on first run)
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic API key — never stored to disk |
| `COLORS_PASSPHRASE` | Yes | Memory encryption passphrase — never stored to disk |
| `COLORS_STORAGE_DIR` | No | Memory store location (default: `~/.colors`) |
| `COLORS_PORT` | No | Web UI port (default: `57341`) |
| `TELEGRAM_BOT_TOKEN` | Telegram only | Telegram bot token |
| `TELEGRAM_ALLOWED_USERS` | No | Comma-separated user IDs, or `*` for all |
| `DISCORD_BOT_TOKEN` | Discord only | Discord bot token |
| `DISCORD_ALLOWED_USERS` | No | Comma-separated user IDs, or `*` for all |

---

## Security

Colors was designed against documented OpenClaw vulnerabilities (CVE-2026-25253 and others). See [SECURITY.md](./SECURITY.md) for the full threat model.

| Threat | Mitigation |
|---|---|
| Remote attack surface | No listening port — loopback stdin/stdout only |
| Plaintext memory on disk | AES-256-GCM encryption, HMAC-signed |
| Skill exfiltration | Sandboxed child processes, explicit network grant required |
| Indirect prompt injection | Metacognitive gate blocks tool calls from injected content |
| Credential theft | BYOK everywhere — no keys ever written to disk |

---

## What Colors cannot do

Colors is not trying to replace your memory. It doesn't know what it doesn't know. The LLM behind it has a knowledge cutoff. The metacognitive loop catches injection attempts but is not infallible against a sophisticated adversarial model response.

Read the threat model. Audit skills before installing them.

---

## Research

- [RESEARCH.md](./RESEARCH.md) — the consciousness framework paper
- [SECURITY.md](./SECURITY.md) — full threat model and mitigations

---

The Colour Foundation · [thecolourfoundation.github.io/Color](https://thecolourfoundation.github.io/Color) · buildwithcolours@gmail.com

---

## License

Apache 2.0
