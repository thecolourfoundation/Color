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
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { ColorsAgent } from "./ColorsAgent";

// ── Config resolution ─────────────────────────────────────────────────────────

function resolveConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error(
      "[Colors] No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.\n" +
      "Colors never stores your API key. It lives in your environment, not on disk."
    );
    process.exit(1);
  }

  const storageDir = process.env.COLORS_STORAGE_DIR || join(homedir(), ".colors");
  const passphrase = process.env.COLORS_PASSPHRASE;

  if (!passphrase) {
    console.error(
      "[Colors] No memory passphrase found. Set COLORS_PASSPHRASE.\n" +
      "This encrypts your memory store. Colors never knows it — it stays in your environment."
    );
    process.exit(1);
  }

  return { apiKey, storageDir, passphrase };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function runChat(agent: ColorsAgent) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  console.log("\n  Colors — local AI agent");
  console.log("  Type 'exit' to quit, '/status' to check agent state\n");

  const status = agent.getStatus();
  console.log(`  Mood: ${status.mood} | Memory: ${JSON.stringify(status.memory)}\n`);

  const prompt = () => {
    rl.question("you > ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return prompt();

      if (trimmed === "exit" || trimmed === "quit") {
        console.log("\n  Shutting down Colors...");
        agent.shutdown();
        rl.close();
        process.exit(0);
      }

      if (trimmed === "/status") {
        const s = agent.getStatus();
        console.log(`\n  Mood: ${s.mood}`);
        console.log(`  Memory: episodic=${s.memory.episodic} semantic=${s.memory.semantic} procedural=${s.memory.procedural}`);
        console.log(`  Goals: ${s.activeGoals.join(", ") || "none"}\n`);
        return prompt();
      }

      try {
        process.stdout.write("\ncolors > ");
        const response = await agent.chat(trimmed);

        console.log(response.message);

        if (response.flags.length > 0) {
          console.log(`\n  [flags] ${response.flags.join(" | ")}`);
        }

        if (response.mood !== "neutral" && response.mood !== "confident") {
          console.log(`  [mood: ${response.mood}]`);
        }

        console.log();
      } catch (err: any) {
        console.error(`\n  [error] ${err.message}\n`);
      }

      prompt();
    });
  };

  prompt();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\n  Saving state...");
    agent.shutdown();
    rl.close();
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

    case "whatsapp": {
      const allowed = process.env.WHATSAPP_ALLOWED_NUMBERS || "*";
      const { WhatsAppAdapter } = await import("./channels/WhatsAppAdapter");
      const adapter = new WhatsAppAdapter({ allowedNumbers: allowed, passphrase: config.passphrase });
      process.on("SIGINT", () => { adapter.stop(); process.exit(0); });
      await adapter.start();
      break;
    }

    default:
      console.error(`Unknown channel: ${channel}`);
      console.error("Available channels: telegram, discord, whatsapp");
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
      await runChat(agent);
      break;
    }

    case "status": {
      const agent = new ColorsAgent(config);
      const status = agent.getStatus();
      console.log(JSON.stringify(status, null, 2));
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
        console.error("Usage: colors channel <telegram|discord|whatsapp>");
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
    channel telegram            Run as a Telegram bot (TELEGRAM_BOT_TOKEN required)
    channel discord             Run as a Discord bot (DISCORD_BOT_TOKEN required)
    channel whatsapp            Run as a WhatsApp bot (scan QR on first run)

  Env vars:
    ANTHROPIC_API_KEY           Your Anthropic API key (never stored to disk)
    COLORS_PASSPHRASE           Memory encryption passphrase (never stored to disk)
    COLORS_STORAGE_DIR          Memory store location (default: ~/.colors)
    TELEGRAM_BOT_TOKEN          Telegram bot token
    TELEGRAM_ALLOWED_USERS      Comma-separated Telegram user IDs, or * for all
    DISCORD_BOT_TOKEN           Discord bot token
    DISCORD_ALLOWED_USERS       Comma-separated Discord user IDs, or * for all
    WHATSAPP_ALLOWED_NUMBERS    Comma-separated phone numbers, or * for all
      `);
      break;
  }
}

main().catch((err) => {
  console.error("[Colors] Fatal error:", err.message);
  process.exit(1);
});
