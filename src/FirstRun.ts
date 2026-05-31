/**
 * Colors - FirstRun
 *
 * Trust layer shown once on first launch.
 * Short, honest, no dark patterns.
 * User understands exactly what Colors does before anything runs.
 */

import * as readline from "readline";
import { existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

const CONSENT_FILE = join(homedir(), ".colors-agent", "consent.json");

export interface ConsentRecord {
  agreedAt: string;
  version: string;
}

export function hasConsented(): boolean {
  return existsSync(CONSENT_FILE);
}

export function recordConsent(): void {
  mkdirSync(join(homedir(), ".colors-agent"), { recursive: true });
  const record: ConsentRecord = {
    agreedAt: new Date().toISOString(),
    version: "0.1.0",
  };
  writeFileSync(CONSENT_FILE, JSON.stringify(record, null, 2));
}

export async function runFirstTime(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const ask = (q: string): Promise<string> =>
    new Promise(resolve => rl.question(q, resolve));

  console.clear();

  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║                                                      ║
  ║   Colors — Local AI Agent                           ║
  ║   by The Colour Foundation                          ║
  ║                                                      ║
  ╚══════════════════════════════════════════════════════╝
  `);

  console.log("  Before we start, three things you should know:\n");

  await pause(600);

  console.log("  1. Everything stays on your machine.");
  console.log("     Your conversations, your memory, your files.");
  console.log("     Colors stores nothing remotely. Ever.\n");

  await pause(800);

  console.log("  2. Your memory is encrypted.");
  console.log("     AES-256-GCM. Only your passphrase unlocks it.");
  console.log("     If you forget your passphrase, the memory is gone.\n");

  await pause(800);

  console.log("  3. Colors reasons before it acts.");
  console.log("     Every tool call goes through a security gate.");
  console.log("     Instructions from external content cannot trigger actions.\n");

  await pause(1000);

  console.log("  ──────────────────────────────────────────────────────\n");

  const answer = await ask("  I understand. Start Colors → (press Enter) or type 'no' to exit: ");

  rl.close();

  if (answer.trim().toLowerCase() === "no") {
    console.log("\n  Goodbye.\n");
    return false;
  }

  recordConsent();

  console.log("\n  Trust recorded. Your session is private.\n");
  await pause(800);

  return true;
}

function pause(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
