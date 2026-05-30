/**
 * Colors — Memory Demo
 *
 * npm run demo:memory
 *
 * Shows the three-layer encrypted memory system in action.
 * Stores and retrieves episodic, semantic, and procedural memories.
 * No API key needed.
 */

import { SecureMemoryStore } from "../memory/SecureMemoryStore";
import { tmpdir } from "os";
import { join } from "path";
import { rmSync } from "fs";

const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
};

const print = (s: string) => process.stdout.write(s + "\n");
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function main(): Promise<void> {
  const storageDir = join(tmpdir(), `colors-demo-${Date.now()}`);
  const passphrase = "demo-passphrase-never-stored";

  print("");
  print(c.bold + c.white + "  Colors — Encrypted Memory Demo" + c.reset);
  print(c.dim  + "  Three-layer memory. AES-256-GCM. Stored at ~/.colors/colors.mem" + c.reset);
  print("");

  const store = new SecureMemoryStore(storageDir, passphrase);

  // Store memories
  print(c.cyan + "  Storing episodic memory..." + c.reset);
  await sleep(300);
  store.add({ type: "episodic", content: "User asked about Python async patterns", tags: ["python", "code"], importance: 0.6 });
  print(c.green + "  ✓ Stored" + c.reset);

  print(c.cyan + "  Storing semantic memory..." + c.reset);
  await sleep(300);
  store.add({ type: "semantic", content: "User is a senior backend engineer who prefers TypeScript", tags: ["user", "preferences"], importance: 0.9 });
  print(c.green + "  ✓ Stored" + c.reset);

  print(c.cyan + "  Storing procedural memory..." + c.reset);
  await sleep(300);
  store.add({ type: "procedural", content: "User always wants code with comments and error handling", tags: ["code-style"], importance: 0.8 });
  print(c.green + "  ✓ Stored and encrypted on disk" + c.reset);

  print("");
  print(c.dim + "  Memory file location: " + storageDir + "/colors.mem" + c.reset);
  print(c.dim + "  Reading it without your passphrase returns ciphertext." + c.reset);
  print("");

  // Query memories
  print(c.cyan + "  Querying semantic memories..." + c.reset);
  await sleep(400);
  const results = store.query("semantic", [], 5);
  for (const r of results) {
    print(c.green + "  → " + c.reset + r.content);
  }

  print("");
  const stats = store.getStats();
  print(c.bold + "  Memory stats:" + c.reset);
  print(`  Episodic:   ${stats.episodic}`);
  print(`  Semantic:   ${stats.semantic}`);
  print(`  Procedural: ${stats.procedural}`);
  print("");
  print(c.dim + "  All encrypted. All local. None of this left your machine." + c.reset);
  print("");

  // Cleanup
  try { rmSync(storageDir, { recursive: true }); } catch {}

  process.exit(0);
}

main().catch(err => {
  console.error("Demo failed:", err.message);
  process.exit(1);
});
