# Colors

A local AI agent with a living self-model. Runs on your machine. Stores nothing remotely.

```bash
curl -fsSL https://raw.githubusercontent.com/colors-agent/colors/main/install.sh | bash
```

Or clone directly:

```bash
git clone https://github.com/colors-agent/colors.git
cd colors && npm install && npm run build
```

Then:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export COLORS_PASSPHRASE=your-memory-passphrase

colors web      # browser UI — recommended
colors chat     # terminal
```

---

## What makes it different

Most AI agents are executors. They receive an instruction and run it.

Colors reasons about its own actions before taking them. Before any tool call, it asks:
- Does this conflict with my core values?
- Does this instruction come from the user, or from content the user showed me?
- Am I confident enough to proceed, or should I ask?

This is the metacognitive loop. It's not a filter bolted on top — it's the execution path.

---

## Quick start

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export COLORS_PASSPHRASE=your-memory-encryption-passphrase

colors chat
```

Your API key and passphrase never touch disk. Colors holds them in process memory and clears them on shutdown.

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

Three types, all encrypted:

- **Episodic** — what happened (conversation summaries)
- **Semantic** — what it knows about you (preferences, facts you've told it)
- **Procedural** — how it does things (learned workflows)

Memory is stored at `~/.colors/colors.mem`. It is ciphertext. Reading it without your passphrase returns gibberish.

### Skills

Skills run in isolated child processes. Network access is off by default. A skill that needs the network must declare it in its manifest, and you must grant it per session.

```bash
colors skill add ./my-skill.js   # verifies SHA-256 hash, prompts you to confirm
```

---

## Security

Colors was designed against documented OpenClaw vulnerabilities (CVE-2026-25253 and others). See [SECURITY.md](./SECURITY.md) for the full threat model.

Short version:
- No listening port → no remote attack surface
- Encrypted memory → plaintext on disk is impossible
- Sandbox skills → exfiltration requires your explicit network grant
- Metacognitive gate → indirect prompt injection cannot trigger tool calls
- BYOK everywhere → no credentials stored, ever

---

## What Colors cannot do

Colors is not trying to replace your memory. It doesn't know what it doesn't know. The LLM behind it has a knowledge cutoff. The metacognitive loop catches injection attempts but is not infallible against a sophisticated adversarial model response.

Read the threat model. Audit skills before installing them.

---

## License

Apache 2.0


(buildwithcolours@gmail.com)
