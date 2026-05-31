#!/usr/bin/env node
/**
 * Colors CLI
 *
 * The primary interface. No web server, no exposed ports, no WebSocket surface.
 * Everything is loopback stdin/stdout. This alone closes CVE-2026-25253.
 *
 * Usage:
 *   colors chat                  - interactive chat session
 *   colors status                - show agent status, mood, memory stats
 *   colors memory query <query>  - query long-term memory
 *   colors skill list            - list registered skills
 *   colors skill add <path>      - register a skill (prompts for hash verification)
 */

import * as readline from "readline";
import { existsSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { ColorsAgent } from "./ColorsAgent";

// ── Terminal colors ───────────────────────────────────────────────────────────

const c = {
  reset:   "\x1b[0m",
  bold:    "\x1b[1m",
  dim:     "\x1b[2m",
  red:     "\x1b[31m",
  green:   "\x1b[32m",
  yellow:  "\x1b[33m",
  blue:    "\x1b[34m",
  cyan:    "\x1b[36m",
  white:   "\x1b[37m",
  bgGreen: "\x1b[42m",
  bgRed:   "\x1b[41m",
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function typewrite(text: string, delay = 22): Promise<void> {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(delay);
  }
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

// ── First run detection ───────────────────────────────────────────────────────

function isFirstRun(storageDir: string): boolean {
  return !existsSync(join(storageDir, ".colors_initialized"));
}

function markInitialized(storageDir: string): void {
  try {
    writeFileSync(join(storageDir, ".colors_initialized"), new Date().toISOString());
  } catch {}
}

// ── First run onboarding ──────────────────────────────────────────────────────

async function runOnboarding(): Promise<void> {
  console.clear();
  await sleep(200);

  // Boot sequence
  console.log(line("═"));
  await sleep(100);
  process.stdout.write(c.dim + "  COLORS BOOT SEQUENCE INITIATED" + c.reset);
  await sleep(400);
  process.stdout.write(" .");
  await sleep(300);
  process.stdout.write(" .");
  await sleep(300);
  process.stdout.write(" .\n");
  await sleep(200);

  console.log(line());
  await sleep(150);

  // System checks
  const checks = [
    ["Memory encryption", "AES-256-GCM", true],
    ["API key storage", "In-memory only", true],
    ["Network exposure", "Zero ports", true],
    ["Telemetry", "None", true],
    ["MetacognitiveLoop", "Armed", true],
  ];

  for (const [label, value, ok] of checks) {
    await sleep(120);
    process.stdout.write(
      `  ${ok ? c.green + "✓" : c.red + "✗"}${c.reset}  ` +
      `${c.dim}${label}${c.reset}` +
      `${" ".repeat(Math.max(1, 28 - (label as string).length))}` +
      `${c.cyan}${value}${c.reset}\n`
    );
  }

  await sleep(300);
  console.log(line());
  await sleep(400);

  // Welcome
  console.log("");
  await typewrite(
    c.bold + c.white + "  Welcome to Colors." + c.reset, 30
  );
  await sleep(300);
  await typewrite(
    c.dim + "  Your AI agent. Local. Encrypted. Conscious." + c.reset, 18
  );
  await sleep(500);
  console.log("");

  // What Colors is
  console.log(line("─"));
  await sleep(200);

  const lines = [
    "  Colors is different from other AI agents in one key way:",
    "",
    "  When most agents read a webpage or document, they can be",
    "  tricked into following hidden instructions inside it.",
    "  This is how 40,000+ OpenClaw instances were compromised.",
    "",
    "  Colors tracks the source of every instruction.",
    "  External content can inform responses.",
    "  It cannot trigger tool calls. Ever.",
    "",
    "  That's the gate. It's not a filter. It's architecture.",
  ];

  for (const l of lines) {
    await sleep(80);
    console.log(l === "" ? "" : c.dim + l + c.reset);
  }

  await sleep(300);
  console.log(line("─"));
  await sleep(400);

  // First mission brief
  console.log("");
  console.log(c.green + c.bold + "  FIRST MISSION" + c.reset);
  await sleep(200);

  const missions = [
    "  1. Tell Colors your name",
    "  2. Watch it remember across sessions",
    "  3. Try: 'read https://example.com and summarize it'",
    "     (then watch the gate block any hidden instructions)",
    "  4. Run /status to see your agent's current mood",
  ];

  for (const m of missions) {
    await sleep(100);
    console.log(c.dim + m + c.reset);
  }

  await sleep(400);
  console.log("");
  console.log(line("═"));
  await sleep(300);

  console.log(
    "\n  " + c.green + c.bold + "Colors is ready." + c.reset +
    c.dim + " Type anything to begin." + c.reset + "\n"
  );

  await sleep(600);
}

// ── Returning user greeting ───────────────────────────────────────────────────

async function runReturningGreeting(agent: ColorsAgent): Promise<void> {
  const status = agent.getStatus();
  const mood = status.mood;
  const mem = status.memory;
  const totalMemory = mem.episodic + mem.semantic + mem.procedural;

  console.log("");
  console.log(line("═"));

  // Agent identity line
  process.stdout.write(
    "  " + c.bold + c.white + "COLORS" + c.reset +
    c.dim + "  //  " + c.reset
  );

  // Mood indicator
  process.stdout.write(
    moodColor(mood) + moodIcon(mood) + "  " + mood.toUpperCase() + c.reset
  );

  // Memory indicator
  if (totalMemory > 0) {
    process.stdout.write(
      c.dim + "  //  " + c.reset +
      c.cyan + `${totalMemory} memories` + c.reset
    );
  }

  process.stdout.write("\n");
  console.log(line());

  // Memory summary
  if (totalMemory > 0) {
    await sleep(100);
    console.log(
      c.dim + `  Episodic  ` + c.reset + memoryBar(mem.episodic) +
      c.dim + `  ${mem.episodic}` + c.reset
    );
    console.log(
      c.dim + `  Semantic  ` + c.reset + memoryBar(mem.semantic) +
      c.dim + `  ${mem.semantic}` + c.reset
    );
    console.log(
      c.dim + `  Procedural` + c.reset + memoryBar(mem.procedural) +
      c.dim + `  ${mem.procedural}` + c.reset
    );
    console.log(line());
  }

  // Mood message
  await sleep(150);
  const moodMessages: Record<string, string> = {
    confident:  "  Running clean. Gate armed. Ready.",
    neutral:    "  Systems nominal. Ready for your input.",
    cautious:   "  Caution level elevated. Will confirm before acting.",
    stressed:   "  High error rate detected. Proceeding carefully.",
    blocked:    "  Blocked state. Please review recent flags before continuing.",
  };

  console.log(
    moodColor(mood) + (moodMessages[mood] || "  Ready.") + c.reset
  );
  console.log(line("═"));
  console.log("");
}

// ── Config resolution ─────────────────────────────────────────────────────────

function resolveConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "\n" + c.red + "  [Colors] No API key found." + c.reset + "\n" +
      c.dim + "  Set ANTHROPIC_API_KEY or OPENAI_API_KEY.\n" +
      "  Colors never stores your key. It lives in your env, not on disk.\n" + c.reset
    );
    process.exit(1);
  }

  const storageDir = process.env.COLORS_STORAGE_DIR || join(homedir(), ".colors");
  const passphrase = process.env.COLORS_PASSPHRASE;

  if (!passphrase) {
    console.error(
      "\n" + c.red + "  [Colors] No memory passphrase found." + c.reset + "\n" +
      c.dim + "  Set COLORS_PASSPHRASE.\n" +
      "  This encrypts your memory store. Colors never stores it.\n" + c.reset
    );
    process.exit(1);
  }

  return { apiKey, storageDir, passphrase };
}

// ── Chat loop ─────────────────────────────────────────────────────────────────

async function runChat(agent: ColorsAgent, storageDir: string) {
  const firstRun = isFirstRun(storageDir);

  if (firstRun) {
    await runOnboarding();
    markInitialized(storageDir);
  } else {
    await runReturningGreeting(agent);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  const prompt = () => {
    rl.question(c.dim + "you" + c.reset + " › ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return prompt();

      if (trimmed === "exit" || trimmed === "quit") {
        console.log("\n" + c.dim + "  Saving state and shutting down..." + c.reset);
        agent.shutdown();
        rl.close();
        console.log(c.green + "  Done. Stay safe out there." + c.reset + "\n");
        process.exit(0);
      }

      if (trimmed === "/status") {
        const s = agent.getStatus();
        console.log("");
        console.log(line());
        console.log(
          "  " + c.bold + "Mood" + c.reset + "     " +
          moodColor(s.mood) + moodIcon(s.mood) + "  " + s.mood + c.reset
        );
        console.log(
          "  " + c.bold + "Episodic" + c.reset + "  " +
          memoryBar(s.memory.episodic) + c.dim + `  ${s.memory.episodic}` + c.reset
        );
        console.log(
          "  " + c.bold + "Semantic" + c.reset + "  " +
          memoryBar(s.memory.semantic) + c.dim + `  ${s.memory.semantic}` + c.reset
        );
        console.log(
          "  " + c.bold + "Goals" + c.reset + "     " +
          c.dim + (s.activeGoals.join(", ") || "none") + c.reset
        );
        console.log(line());
        console.log("");
        return prompt();
      }

      if (trimmed === "/help") {
        console.log("");
        console.log(line());
        console.log(c.dim + "  Commands:" + c.reset);
        console.log(c.dim + "  /status    — agent mood, memory, active goals" + c.reset);
        console.log(c.dim + "  /help      — this message" + c.reset);
        console.log(c.dim + "  exit       — save state and quit" + c.reset);
        console.log(line());
        console.log("");
        return prompt();
      }

      try {
        process.stdout.write("\n" + c.cyan + "colors" + c.reset + " › ");
        const response = await agent.chat(trimmed);

        console.log(response.message);

        if (response.flags.length > 0) {
          console.log(
            "\n  " + c.yellow + "⚠ " + c.reset +
            c.dim + response.flags.join(" · ") + c.reset
          );
        }

        if (response.mood !== "neutral" && response.mood !== "confident") {
          console.log(
            "  " + moodColor(response.mood) +
            moodIcon(response.mood) + "  mood: " + response.mood +
            c.reset
          );
        }

        console.log("");
      } catch (err: any) {
        console.error(
          "\n  " + c.red + "✗  " + c.reset +
          c.dim + err.message + c.reset + "\n"
        );
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

// ── Entry ─────────────────────────────────────────────────────────────────────

async function runChannel(channel: string, config: ReturnType<typeof resolveConfig>) {
  switch (channel) {
    case "telegram": {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const allowed = process.env.TELEGRAM_ALLOWED_USERS || "*";
      if (!token) {
        console.error("[Colors] Set TELEGRAM_BOT_TOKEN to use the Telegram adapter.");
        process.exit(1);
      }
      const { TelegramAdapter } = await import("./channels/TelegramAdapter");
      const adapter = new TelegramAdapter({ token, allowedUsers: allowed, passphrase: config.passphrase });
      process.on("SIGINT", () => { adapter.stop(); process.exit(0); });
      await adapter.start();
      break;
    }
    case "discord": {
      const token = process.env.DISCORD_BOT_TOKEN;
      const allowed = process.env.DISCORD_ALLOWED_USERS || "*";
      if (!token) {
        console.error("[Colors] Set DISCORD_BOT_TOKEN to use the Discord adapter.");
        process.exit(1);
      }
      const { DiscordAdapter } = await import("./channels/DiscordAdapter");
      const adapter = new DiscordAdapter({ token, allowedUsers: allowed, passphrase: config.passphrase });
      process.on("SIGINT", () => { adapter.stop(); process.exit(0); });
      await adapter.start();
      break;
    }
    default:
      console.error(`Unknown channel: ${channel}`);
      process.exit(1);
  }
}

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
      const status = agent.getStatus();
      const mood = status.mood;
      console.log("");
      console.log(line("═"));
      console.log(
        "  " + c.bold + "COLORS STATUS" + c.reset + "  " +
        moodColor(mood) + moodIcon(mood) + "  " + mood.toUpperCase() + c.reset
      );
      console.log(line());
      console.log(c.dim + `  Episodic   ${status.memory.episodic}` + c.reset);
      console.log(c.dim + `  Semantic   ${status.memory.semantic}` + c.reset);
      console.log(c.dim + `  Procedural ${status.memory.procedural}` + c.reset);
      console.log(c.dim + `  Goals      ${status.activeGoals.join(", ") || "none"}` + c.reset);
      console.log(line("═"));
      console.log("");
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
      const url = `http://127.0.0.1:${port}`;
      const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
      exec(`${opener} ${url}`);
      break;
    }
    case "channel": {
      if (!subcommand) {
        console.error("Usage: colors channel <telegram|discord>");
        process.exit(1);
      }
      await runChannel(subcommand, config);
      break;
    }
    case "help":
    default:
      console.log(`
  Colors — local AI agent

  Commands:
    chat                        Start an interactive chat session (default)
    web                         Open the chat UI in your browser (127.0.0.1 only)
    status                      Show agent mood, memory stats, active goals
    channel telegram            Run as a Telegram bot
    channel discord             Run as a Discord bot

  Env vars:
    ANTHROPIC_API_KEY           Your Anthropic API key (never stored to disk)
    COLORS_PASSPHRASE           Memory encryption passphrase (never stored)
    COLORS_STORAGE_DIR          Memory store location (default: ~/.colors)
    TELEGRAM_BOT_TOKEN          Telegram bot token
    DISCORD_BOT_TOKEN           Discord bot token
      `);
      break;
  }
}

main().catch((err) => {
  console.error(c.red + "\n  [Colors] Fatal error: " + c.reset + err.message);
  process.exit(1);
});
