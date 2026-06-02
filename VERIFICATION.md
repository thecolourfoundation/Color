# Verification Guide

This document exists because you should not blindly trust any software that runs on your machine with an AI agent and filesystem access. We wrote it to make Colors as auditable as possible.

---

## What Colors actually is

Colors is a TypeScript project. Every file in this repository is human-readable source code. There are no:

- Pre-compiled binaries
- Native extensions you cannot read
- Obfuscated scripts
- Automatic update mechanisms
- Background processes that persist after you quit

When you run `npm install`, Node.js downloads declared dependencies from npm. When you run `npm run build`, TypeScript compiles the source to JavaScript. That is the entire surface area.

---

## What runs on your machine

```
src/
├── ColorsAgent.ts        — main agent orchestrator
├── cli.ts                — terminal interface (stdin/stdout only)
├── WebUIServer.ts        — local web UI (127.0.0.1 only, no external binding)
├── consciousness/
│   ├── SelfModel.ts      — agent identity, HMAC-signed
│   ├── MetacognitiveLoop.ts — instruction gate (the security primitive)
│   └── EmotionalState.ts — caution/mood tracking
├── memory/
│   ├── WorkingMemory.ts  — in-process short-term memory (cleared on shutdown)
│   └── SecureMemoryStore.ts — AES-256-GCM encrypted local memory
├── sandbox/
│   └── SkillSandbox.ts   — isolated child processes for third-party skills
├── tools/
│   └── ToolRegistry.ts   — built-in tools (file, web, shell, math)
└── channels/
    ├── TelegramAdapter.ts
    └── DiscordAdapter.ts
```

Read any of these files before running them. They are short, commented, and written to be understood.

---

## What network calls Colors makes

Colors makes exactly two categories of network calls:

**1. To your chosen LLM provider**
- Anthropic (`api.anthropic.com`) if you set `ANTHROPIC_API_KEY`
- OpenAI (`api.openai.com`) if you set `OPENAI_API_KEY`
- Groq (`api.groq.com`) if you set `GROQ_API_KEY`
- Your local Ollama instance (`localhost`) if configured

No other outbound connections are made. Colors does not call home. Colors does not send telemetry. Colors does not contact any Colour Foundation server.

**2. Tool calls you explicitly request**
- `web_fetch` only runs when you ask Colors to fetch a URL
- `shell_exec` only runs allowlisted commands, always prompts for confirmation
- Skills only get network access if you explicitly grant it per session

You can verify this yourself by running Colors with network monitoring:

```bash
# macOS / Linux — monitor all outbound connections while Colors runs
sudo lsof -i -n | grep node
# or
sudo tcpdump -i any -n host api.anthropic.com
```

If you see any connection to a domain other than your LLM provider, that is a bug. Please open an issue.

---

## What Colors stores on disk

One file: `~/.colors/colors.mem`

This file is AES-256-GCM encrypted using a key derived from your `COLORS_PASSPHRASE` via Argon2id. Without your passphrase, it is ciphertext. You can verify:

```bash
# This should return binary gibberish, not readable text
cat ~/.colors/colors.mem
```

Colors also writes `~/.colors/.colors_initialized` — a plain text timestamp marking first run. That is the complete list of files Colors writes to disk.

Your API key and passphrase are **never written to disk**. They live in process memory and are cleared when Colors exits. You can verify this:

```bash
# After Colors exits, search for your key on disk
grep -r "sk-ant" ~/.colors/    # should return nothing
grep -r "sk-ant" ~/.config/    # should return nothing
```

---

## How to audit the install

```bash
# 1. Clone without running anything
git clone https://github.com/thecolourfoundation/Color.git
cd Color

# 2. Read the files you care about before installing
cat src/ColorsAgent.ts
cat src/cli.ts
cat install.sh

# 3. Check what npm will download
npm install --dry-run

# 4. Review the dependency list
cat package.json

# 5. Build from source yourself
npm install
npm run build

# 6. Run only when satisfied
npm run demo:injection   # no API key needed for this
```

---

## Dependencies

Colors uses the following runtime dependencies:

| Package | Version | Purpose | Source |
|---------|---------|---------|--------|
| `@anthropic-ai/sdk` | ^0.24.0 | Anthropic API client | anthropic/anthropic-sdk-js |
| `better-sqlite3` | ^9.4.3 | Local SQLite database | WiseLibs/better-sqlite3 |
| `express` | ^4.18.0 | Local web UI server | expressjs/express |
| `chalk` | ^4.1.2 | Terminal colors | chalk/chalk |

All are open source, widely audited, and available on npm. No dependencies have been forked or modified.

---

## What the shell command does

The one-line installer:

```bash
curl -fsSL https://raw.githubusercontent.com/thecolourfoundation/Color/main/install.sh | bash
```

Does exactly this, in order:

1. Checks Node.js version (>=18 required)
2. Checks git is installed
3. Clones the repository to `~/.colors-agent`
4. Runs `npm install`
5. Runs `npm run build`
6. Creates a symlink from `~/.local/bin/colors` to `dist/cli.js`

Nothing else. You can read the full script at `install.sh` in this repository before running it.

If you prefer not to use the one-liner, clone manually:

```bash
git clone https://github.com/thecolourfoundation/Color.git
cd Color
npm install && npm run build
node dist/cli.js chat
```

---

## Reporting security issues

If you find something that looks wrong — a network call you didn't expect, a file being written somewhere it shouldn't be, a dependency that looks suspicious — please open an issue or email buildwithcolours@gmail.com.

We will respond within 24 hours. Security reports are taken seriously and credited publicly if desired.

Full threat model: [SECURITY.md](./SECURITY.md)

---

## The short version

- Every file is readable TypeScript source
- No binaries, no obfuscation, no auto-updates
- Only calls your LLM provider — nothing else
- One encrypted file on disk, nothing else
- API key and passphrase never touch disk
- You can audit everything before running anything

If something doesn't match what's written here, that is a bug and we want to know about it.
