# Contributing to Colors

## What we're building

Colors is a local AI agent focused on two things: security and self-awareness. Contributions should move the needle on one or both.

Good contributions:
- Close a documented attack surface
- Improve the metacognitive loop's accuracy
- Add a channel adapter (Slack, Signal, SMS, email)
- Add a well-audited built-in tool
- Improve test coverage on the consciousness or memory layers
- Add a benchmark against the claims in RESEARCH.md

We are not looking for:
- UI flourishes over security substance
- Features that require sending data to external servers by default
- Dependencies that add attack surface without commensurate value

---

## Skill authoring

Skills are the primary extension point. A skill is a Node.js script that:

1. Reads input from stdin as JSON
2. Does its work
3. Writes output to stdout as JSON
4. Exits cleanly

```javascript
let inputData = "";
process.stdin.on("data", d => inputData += d);
process.stdin.on("end", async () => {
  const { input, networkGranted, executionId } = JSON.parse(inputData);
  // do work
  process.stdout.write(JSON.stringify({ executionId, output: result, networkCallsMade: 0 }));
  process.exit(0);
});
```

Skills that need network access must declare `requiresNetwork: true` in their manifest. The user will be prompted to grant this per session.

Skills are verified by SHA-256 hash before every execution. If you modify a registered skill, you must re-register it.

See `src/skills/examples/web-search.js` for a reference implementation.

---

## Development setup

```bash
git clone https://github.com/colors-agent/colors
cd colors
npm install
npm run build
npm test
```

Required env vars for development:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
export COLORS_PASSPHRASE=dev-passphrase
```

---

## Pull request process

1. Tests must pass: `npm test`
2. No TypeScript errors: `npx tsc --noEmit`
3. New features need tests
4. Security-relevant changes need an explanation of the threat they address or introduce
5. Skills submitted to `src/skills/` must include their SHA-256 hash in a companion `.manifest.json`

---

## Security disclosures

Do not open a public issue for security vulnerabilities. Use GitHub's private vulnerability reporting. We will respond within 48 hours.
