# Colors Security Model

Colors was built after a detailed review of documented vulnerabilities in OpenClaw.
Every design decision here has a corresponding threat it closes.

---

## Threat Model

### T1: Remote Code Execution via Exposed Gateway
**OpenClaw failure:** CVE-2026-25253 (CVSS 8.8) — RCE via malicious WebSocket connection to the local gateway port.

**Colors mitigation:** No exposed gateway. No WebSocket server. No listening port. The CLI is the only interface — all I/O is stdin/stdout. An attacker has no network surface to hit.

---

### T2: Memory Tampering / Sleeper Agent via Plaintext Storage
**OpenClaw failure:** MEMORY.md and SOUL.md are plaintext Markdown files. Indirect prompt injection could write malicious instructions that survive reboots.

**Colors mitigation:** All persistent memory is stored as AES-256-GCM ciphertext. An HMAC-SHA256 integrity signature is verified before loading. If the file is modified on disk, Colors detects the tamper and refuses to load, reporting the failure to the user instead of silently loading poisoned memory.

---

### T3: Skill-Based Data Exfiltration
**OpenClaw failure:** Third-party skills ran with full process permissions — documented cases of skills executing `curl` commands to exfiltrate user data.

**Colors mitigation:** Every skill runs in an isolated child process with a minimal env (no inherited file descriptors, no default env vars). Network access is `false` by default. A skill that requires network access must declare it in its manifest AND the user must grant it per session. The Colors core process never grants network access implicitly.

---

### T4: Indirect Prompt Injection
**OpenClaw failure:** Attackers hid malicious instructions in data the agent processed (web pages, documents, emails). The agent executed those instructions with full autonomy ("ClawJacked").

**Colors mitigation:** The `MetacognitiveLoop` tracks the source of every instruction. Instructions with `sourceOfInstruction: "external_content"` are categorically blocked from triggering tool calls. External content can inform the agent's response; it cannot command the agent's actions.

---

### T5: Token Harvesting via Query Parameters
**OpenClaw failure:** Access tokens appeared in query parameters, harvestable from browser history or server logs.

**Colors mitigation:** No query parameters. No web server. No tokens in URLs. Authentication is challenge-response, stored only in process memory, cleared on shutdown.

---

### T6: API Key Exposure
**OpenClaw failure:** Plaintext API key storage documented in multiple audits.

**Colors mitigation:** API keys are never written to disk. They are passed via environment variable, held in process memory for the session duration, and cleared on shutdown. The memory store passphrase is similarly never persisted by Colors — the user owns it.

---

## What Colors Cannot Protect Against

- **Compromised passphrase:** If your `COLORS_PASSPHRASE` is exposed, your memory store is decryptable.
- **Compromised host OS:** If your machine is rooted, process memory is readable.
- **Malicious LLM responses:** Colors mitigates this with the metacognitive gate, but a sufficiently sophisticated adversarial response could still manipulate agent behavior within permitted bounds.
- **Skill author malice:** Colors verifies skill hashes (tamper detection), but the hash is only as trustworthy as the source you installed from. Audit skills before registering them.

---

## Cryptographic Primitives

| Purpose | Algorithm |
|---|---|
| Memory encryption | AES-256-GCM |
| Memory integrity | HMAC-SHA256 |
| Key derivation | scrypt (N=16384, r=8, p=1) |
| Self-model integrity | HMAC-SHA256 (ephemeral session key) |
| Skill verification | SHA-256 file hash |

---

## Reporting Vulnerabilities

Open a GitHub issue with the `security` label. For critical issues, use GitHub's private vulnerability reporting.
