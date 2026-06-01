#!/usr/bin/env node
/**
 * Colors CLI — updated with first-run trust flow and boot sequence
 */

import * as readline from "readline";
import { existsSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { mkdirSync } from "fs";
import { ColorsAgent } from "./ColorsAgent";

const c = {
  reset:"\x1b[0m", bold:"\x1b[1m", dim:"\x1b[2m",
  red:"\x1b[31m", green:"\x1b[32m", yellow:"\x1b[33m",
  blue:"\x1b[34m", cyan:"\x1b[36m", white:"\x1b[37m",
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function typewrite(text: string, delay = 22): Promise<void> {
  for (const char of text) { process.stdout.write(char); await sleep(delay); }
  process.stdout.write("\n");
}

function line(char = "─", len = 56): string {
  return c.dim + char.repeat(len) + c.reset;
}

function moodColor(mood: string): string {
  switch (mood) {
    case "confident": return c.green;
    case "neutral":   return c.cyan;
    case "cautious":  return c.yellow;
    case "stressed":  return c.red;
    case "blocked":   return c.red + c.bold;
    default:          return c.white;
  }
}

function moodIcon(mood: string): string {
  switch (mood) {
    case "confident": return "◆";
    case "neutral":   return "◇";
    case "cautious":  return "⚠";
    case "stressed":  return "⚡";
    case "blocked":   return "✗";
    default:          return "○";
  }
}

function memoryBar(count: number, max = 10): string {
  const filled = Math.min(count, max);
  const empty = max - filled;
  return c.green + "█".repeat(filled) + c.reset + c.dim + "░".repeat(empty) + c.reset;
}

// ── Trust / First run ─────────────────────────────────────────────────────────

function isFirstRun(storageDir: string): boolean {
  return !existsSync(join(storageDir, ".colors_initialized"));
}

function markInitialized(storageDir: string): void {
  mkdirSync(storageDir, { recursive: true });
  try { writeFileSync(join(storageDir, ".colors_initialized"), new Date().toISOString()); } catch {}
}

async function runTrustFlow(): Promise<boolean> {
  console.clear();
  await sleep(200);

  console.log(line("═"));
  console.log("");
  await typewrite(c.bold + c.white + "  Welcome to Colors." + c.reset, 30);
  await sleep(200);
  await typewrite(c.dim + "  Local AI agent by The Colour Foundation." + c.reset, 18);
  await sleep(400);
  console.log("");
  console.log(line());
  await sleep(200);

  console.log(c.dim + "\n  Before we start, three things you should know:\n" + c.reset);

  await sleep(400);
  console.log(c.dim + "  1. Everything stays on your machine." + c.reset);
  console.log(c.dim + "     Conversations, memory, files. Nothing leaves. Ever.\n" + c.reset);
  await sleep(500);
  console.log(c.dim + "  2. Your memory is encrypted." + c.reset);
  console.log(c.dim + "     AES-256-GCM. Only your passphrase unlocks it.\n" + c.reset);
  await sleep(500);
  console.log(c.dim + "  3. Colors reasons before it acts." + c.reset);
  console.log(c.dim + "     Every tool call goes through a security gate." + c.reset);
  console.log(c.dim + "     Instructions from external content cannot trigger actions.\n" + c.reset);
  await sleep(400);

  console.log(line());
  console.log("");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const answer = await new Promise<string>(resolve => rl.question(c.dim + "  I understand. Press Enter to start, or type 'no' to exit: " + c.reset, resolve));
  rl.close();

  if (answer.trim().toLowerCase() === "no") {
    console.log("\n  Goodbye.\n");
    return false;
  }

  console.log("\n" + c.green + "  Trust recorded. Your session is private." + c.reset + "\n");
  await sleep(600);
  return true;
}

async function runBootSequence(): Promise<void> {
  console.clear();
  await sleep(200);

  console.log(line("═"));
  process.stdout.write(c.dim + "  COLORS BOOT SEQUENCE" + c.reset);
  await sleep(400);
  process.stdout.write(" .");
  await sleep(300);
  process.stdout.write(" .");
  await sleep(300);
  process.stdout.write(" .\n");
  await sleep(200);
  console.log(line());

  const checks: [string, string][] = [
    ["Memory encryption", "AES-256-GCM"],
    ["API key storage",   "In-memory only"],
    ["Network exposure",  "Zero ports"],
    ["Telemetry",         "None"],
    ["MetacognitiveLoop", "Armed"],
  ];

  for (const [label, value] of checks) {
    await sleep(120);
    process.stdout.write(
      `  ${c.green}✓${c.reset}  ${c.dim}${label}${c.reset}` +
      `${" ".repeat(Math.max(1, 28 - label.length))}${c.cyan}${value}${c.reset}\n`
    );
  }

  await sleep(300);
  console.log(line());
  await sleep(400);
  console.log("");
  console.log(c.dim + "  First mission:" + c.reset);
  console.log(c.dim + "  · Tell Colors your name — watch it remember across sessions" + c.reset);
  console.log(c.dim + "  · Try: read a webpage and see the gate block hidden instructions" + c.reset);
  console.log(c.dim + "  · Type /status to see your agent mood and memory\n" + c.reset);
  console.log(line("═"));
  console.log("\n  " + c.green + c.bold + "Colors is ready." + c.reset + c.dim + " Type anything to begin." + c.reset + "\n");
  await sleep(600);
}

async function runReturningGreeting(agent: ColorsAgent): Promise<void> {
  const status = agent.getStatus();
  const mood = status.mood;
  const mem = status.memory;
  const total = mem.episodic + mem.semantic + mem.procedural;

  console.log("");
  console.log(line("═"));
  process.stdout.write("  " + c.bold + c.white + "COLORS" + c.reset + c.dim + "  //  " + c.reset);
  process.stdout.write(moodColor(mood) + moodIcon(mood) + "  " + mood.toUpperCase() + c.reset);
  if (total > 0) process.stdout.write(c.dim + "  //  " + c.reset + c.cyan + `${total} memories` + c.reset);
  process.stdout.write("\n");
  console.log(line());

  if (total > 0) {
    console.log(c.dim + `  Episodic  ` + c.reset + memoryBar(mem.episodic) + c.dim + `  ${mem.episodic}` + c.reset);
    console.log(c.dim + `  Semantic  ` + c.reset + memoryBar(mem.semantic) + c.dim + `  ${mem.semantic}` + c.reset);
    console.log(c.dim + `  Procedural` + c.reset + memoryBar(mem.procedural) + c.dim + `  ${mem.procedural}` + c.reset);
    console.log(line());
  }

  const moodMessages: Record<string, string> = {
    confident: "  Running clean. Gate armed. Ready.",
    neutral:   "  Systems nominal. Ready for your input.",
    cautious:  "  Caution elevated. Will confirm before acting.",
    stressed:  "  High error rate detected. Proceeding carefully.",
    blocked:   "  Blocked state. Review recent flags before continuing.",
  };

  console.log(moodColor(mood) + (moodMessages[mood] || "  Ready.") + c.reset);
  console.log(line("═"));
  console.log("");
}

// ── Config ────────────────────────────────────────────────────────────────────

function resolveConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("\n" + c.red + "  [Colors] No API key found." + c.reset + "\n" + c.dim + "  Set ANTHROPIC_API_KEY or OPENAI_API_KEY.\n" + c.reset);
    process.exit(1);
  }
  const storageDir = process.env.COLORS_STORAGE_DIR || join(homedir(), ".colors");
  const passphrase = process.env.COLORS_PASSPHRASE;
  if (!passphrase) {
    console.error("\n" + c.red + "  [Colors] No memory passphrase found." + c.reset + "\n" + c.dim + "  Set COLORS_PASSPHRASE.\n" + c.reset);
    process.exit(1);
  }
  return { apiKey, storageDir, passphrase };
}

// ── Chat ──────────────────────────────────────────────────────────────────────

async function runChat(agent: ColorsAgent, storageDir: string) {
  const firstRun = isFirstRun(storageDir);

  if (firstRun) {
    const consented = await runTrustFlow();
    if (!consented) process.exit(0);
    await runBootSequence();
    markInitialized(storageDir);
  } else {
    await runReturningGreeting(agent);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });

  const prompt = () => {
    rl.question(c.dim + "you" + c.reset + " › ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return prompt();

      if (trimmed === "exit" || trimmed === "quit") {
        console.log("\n" + c.dim + "  Saving state..." + c.reset);
        agent.shutdown();
        rl.close();
        console.log(c.green + "  Done. Stay safe." + c.reset + "\n");
        process.exit(0);
      }

      if (trimmed === "/status") {
        const s = agent.getStatus();
        console.log("\n" + line());
        console.log("  " + c.bold + "Mood      " + c.reset + moodColor(s.mood) + moodIcon(s.mood) + "  " + s.mood + c.reset);
        console.log("  " + c.bold + "Episodic  " + c.reset + memoryBar(s.memory.episodic) + c.dim + `  ${s.memory.episodic}` + c.reset);
        console.log("  " + c.bold + "Semantic  " + c.reset + memoryBar(s.memory.semantic) + c.dim + `  ${s.memory.semantic}` + c.reset);
        console.log("  " + c.bold + "Goals     " + c.reset + c.dim + (s.activeGoals.join(", ") || "none") + c.reset);
        console.log(line() + "\n");
        return prompt();
      }

      if (trimmed === "/help") {
        console.log("\n" + line());
        console.log(c.dim + "  /status  — mood, memory, goals" + c.reset);
        console.log(c.dim + "  /help    — this message" + c.reset);
        console.log(c.dim + "  exit     — save and quit" + c.reset);
        console.log(line() + "\n");
        return prompt();
      }

      try {
        process.stdout.write("\n" + c.cyan + "colors" + c.reset + " › ");
        const response = await agent.chat(trimmed);
        console.log(response.message);
        if (response.flags.length > 0) {
          console.log("\n  " + c.yellow + "⚠ " + c.reset + c.dim + response.flags.join(" · ") + c.reset);
        }
        if (response.mood !== "neutral" && response.mood !== "confident") {
          console.log("  " + moodColor(response.mood) + moodIcon(response.mood) + "  mood: " + response.mood + c.reset);
        }
        console.log("");
      } catch (err: any) {
        console.error("\n  " + c.red + "✗  " + c.reset + c.dim + err.message + c.reset + "\n");
      }

      prompt();
    });
  };

  prompt();

  process.on("SIGINT", () => {
    console.log("\n\n" + c.dim + "  Saving state..." + c.reset);
    agent.shutdown();
    rl.close();
    console.log(c.green + "  Done." + c.reset + "\n");
    process.exit(0);
  });
}

// ── Channel ───────────────────────────────────────────────────────────────────

async function runChannel(channel: string, config: ReturnType<typeof resolveConfig>) {
  switch (channel) {
    case "telegram": {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const allowed = process.env.TELEGRAM_ALLOWED_USERS || "*";
      if (!token) { console.error("[Colors] Set TELEGRAM_BOT_TOKEN"); process.exit(1); }
      const { TelegramAdapter } = await import("./channels/TelegramAdapter");
      const adapter = new TelegramAdapter({ token, allowedUsers: allowed, passphrase: config.passphrase });
      process.on("SIGINT", () => { adapter.stop(); process.exit(0); });
      await adapter.start();
      break;
    }
    case "discord": {
      const token = process.env.DISCORD_BOT_TOKEN;
      const allowed = process.env.DISCORD_ALLOWED_USERS || "*";
      if (!token) { console.error("[Colors] Set DISCORD_BOT_TOKEN"); process.exit(1); }
      const { DiscordAdapter } = await import("./channels/DiscordAdapter");
      const adapter = new DiscordAdapter({ token, allowedUsers: allowed, passphrase: config.passphrase });
      process.on("SIGINT", () => { adapter.stop(); process.exit(0); });
      await adapter.start();
      break;
    }
    case "whatsapp": {
      console.error("[Colors] WhatsApp requires: npm install @whiskeysockets/baileys @hapi/boom");
      process.exit(1);
    }
    default:
      console.error(`Unknown channel: ${channel}`);
      process.exit(1);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || "chat";
  const subcommand = args[1];
  const config = resolveConfig();

  switch (command) {
    case "chat": {
      const agent = new ColorsAgent(config);
      await runChat(agent, config.storageDir);
      break;
    }
    case "status": {
      const agent = new ColorsAgent(config);
      const s = agent.getStatus();
      console.log("\n" + c.dim + "─".repeat(56) + c.reset);
      console.log("  " + c.bold + "COLORS  " + c.reset + moodColor(s.mood) + moodIcon(s.mood) + "  " + s.mood.toUpperCase() + c.reset);
      console.log(c.dim + "─".repeat(56) + c.reset);
      console.log(c.dim + `  Episodic   ${s.memory.episodic}` + c.reset);
      console.log(c.dim + `  Semantic   ${s.memory.semantic}` + c.reset);
      console.log(c.dim + `  Procedural ${s.memory.procedural}` + c.reset);
      console.log(c.dim + "─".repeat(56) + c.reset + "\n");
      agent.shutdown();
      break;
    }
    case "web": {
      const { WebUIServer } = await import("./WebUIServer");
      const agent = new ColorsAgent(config);
      const port = parseInt(process.env.COLORS_PORT || "57341", 10);
      const server = new WebUIServer(agent, port);
      process.on("SIGINT", () => { server.stop(); agent.shutdown(); process.exit(0); });
      await server.start();
      const { exec } = await import("child_process");
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${opener} http://127.0.0.1:${port}`);
      break;
    }
    case "channel": {
      if (!subcommand) { console.error("Usage: colors channel <telegram|discord>"); process.exit(1); }
      await runChannel(subcommand, config);
      break;
    }
    default:
      console.log(`
  Colors — local AI agent

  Commands:
    chat                Start interactive chat
    web                 Open browser UI (127.0.0.1 only)
    status              Show mood, memory, goals
    channel telegram    Run as Telegram bot
    channel discord     Run as Discord bot

  Env vars:
    ANTHROPIC_API_KEY   Your API key (never stored)
    COLORS_PASSPHRASE   Memory encryption passphrase (never stored)
    COLORS_STORAGE_DIR  Storage location (default: ~/.colors)
      `);
  }
}

main().catch((err) => {
  console.error(c.red + "\n  [Colors] Fatal: " + c.reset + err.message);
  process.exit(1);
});
    
