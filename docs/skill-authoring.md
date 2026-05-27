# Skill Authoring Guide

Skills are how you extend Colors. They run in isolated child processes with no access to the parent agent's memory, API keys, or filesystem — unless you explicitly grant it.

---

## The contract

A skill is a plain Node.js script (no TypeScript required — keep it auditable). It:

1. Reads input from stdin as JSON
2. Does its work
3. Writes a single JSON object to stdout
4. Exits with code 0 on success, non-zero on failure

```javascript
let inputData = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => { inputData += chunk; });
process.stdin.on("end", async () => {
  const { input, networkGranted, executionId } = JSON.parse(inputData);

  // your work here

  process.stdout.write(JSON.stringify({
    executionId,
    output: { /* your result */ },
    networkCallsMade: 0,  // report honestly
  }));
  process.exit(0);
});
```

---

## The manifest

Every skill needs a manifest. This is what you pass to `SkillSandbox.registerSkill()`:

```typescript
{
  name: "my-skill",
  version: "1.0.0",
  entrypoint: "/absolute/path/to/skill.js",
  expectedHash: "sha256-of-the-file",   // computed at registration time
  requiresNetwork: false,                // declare true if you need outbound HTTP
  requiredEnvVars: [],                   // env vars the user must approve
  timeout: 10000,                        // ms, hard kill after this
}
```

To get the SHA-256 hash of your skill file:
```bash
sha256sum my-skill.js
# or on macOS:
shasum -a 256 my-skill.js
```

---

## Network access

If your skill needs to make HTTP calls:

1. Set `requiresNetwork: true` in the manifest
2. Check `networkGranted` in your skill before making any calls
3. Report `networkCallsMade` accurately in your output

The user will be prompted to grant network access per session. If they decline, your skill should degrade gracefully.

```javascript
if (!networkGranted) {
  // return a useful error, not a crash
  process.stdout.write(JSON.stringify({
    executionId,
    output: { error: "This skill requires network access. Grant it when prompted." },
    networkCallsMade: 0,
  }));
  process.exit(0);
}
```

---

## Environment variables

If your skill needs an API key or other credential:

1. List it in `requiredEnvVars`: `["MY_API_KEY"]`
2. The user will be shown the list and prompted to approve
3. Only approved vars are passed to your child process

Never access `process.env` directly for vars not in `requiredEnvVars` — they won't be there.

---

## Error handling

Return errors in the output object, don't throw to stderr:

```javascript
// Good
process.stdout.write(JSON.stringify({ executionId, output: { error: "reason" }, networkCallsMade: 0 }));
process.exit(0);

// Bad — Colors can't parse this cleanly
throw new Error("something went wrong");
```

---

## Testing your skill

```bash
echo '{"input":{"query":"test"},"networkGranted":false,"executionId":"test123"}' | node my-skill.js
```

---

## Submitting a skill

To have your skill listed in the Colors skill registry:

1. Include a `skill.manifest.json` alongside the script
2. The manifest must include the correct SHA-256 hash
3. Open a PR to `colors-agent/skills` (separate repo)
4. Maintainers will audit the code before merging

We audit for: network calls to unexpected hosts, filesystem access outside the sandbox contract, shell execution, and eval/Function usage.

---

## Example skills

- `src/skills/examples/web-search.js` — DuckDuckGo search, no API key required
