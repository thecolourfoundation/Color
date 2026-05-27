/**
 * Colors - Telegram Channel Adapter
 *
 * Connects Colors to Telegram via Bot API (long polling).
 * No webhook server — long polling keeps the zero-exposed-port model.
 *
 * Each Telegram user gets their own ColorsAgent instance with
 * isolated memory. One bot can serve multiple authorized users.
 *
 * Setup:
 *   1. Create a bot via @BotFather, get token
 *   2. Set TELEGRAM_BOT_TOKEN in env
 *   3. Set TELEGRAM_ALLOWED_USERS to comma-separated user IDs (or * for all)
 *   4. Run: colors channel telegram
 */

import { ColorsAgent } from "../ColorsAgent";
import { join } from "path";
import { homedir } from "os";

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; username?: string; first_name: string };
    chat: { id: number; type: string };
    text?: string;
    date: number;
  };
}

interface TelegramMessage {
  ok: boolean;
  result?: unknown;
  error_code?: number;
  description?: string;
}

export class TelegramAdapter {
  private token: string;
  private allowedUsers: Set<string>;
  private agents: Map<string, ColorsAgent> = new Map();
  private passphrase: string;
  private storageDir: string;
  private lastUpdateId = 0;
  private running = false;

  constructor(config: {
    token: string;
    allowedUsers: string; // "123456,789012" or "*"
    passphrase: string;
    storageDir?: string;
  }) {
    this.token = config.token;
    this.passphrase = config.passphrase;
    this.storageDir = config.storageDir || join(homedir(), ".colors", "telegram");
    this.allowedUsers = config.allowedUsers === "*"
      ? new Set(["*"])
      : new Set(config.allowedUsers.split(",").map(s => s.trim()));
  }

  async start(): Promise<void> {
    console.log("[Telegram] Starting long poll...");
    this.running = true;

    // Verify bot token on startup
    const me = await this.apiCall("getMe", {});
    if (!me.ok) {
      throw new Error(`Telegram token invalid: ${me.description}`);
    }
    console.log(`[Telegram] Connected as @${(me.result as any).username}`);

    while (this.running) {
      try {
        await this.poll();
      } catch (err: any) {
        console.error(`[Telegram] Poll error: ${err.message}`);
        await this.sleep(5000);
      }
    }
  }

  stop(): void {
    this.running = false;
    // Shutdown all agent instances
    for (const [userId, agent] of this.agents) {
      agent.shutdown();
      console.log(`[Telegram] Shutdown agent for user ${userId}`);
    }
    this.agents.clear();
  }

  private async poll(): Promise<void> {
    const response = await this.apiCall("getUpdates", {
      offset: this.lastUpdateId + 1,
      timeout: 30,
      allowed_updates: ["message"],
    });

    if (!response.ok) return;

    const updates = response.result as TelegramUpdate[];
    for (const update of updates) {
      this.lastUpdateId = update.update_id;
      if (update.message?.text) {
        await this.handleMessage(update.message);
      }
    }
  }

  private async handleMessage(msg: TelegramUpdate["message"]): Promise<void> {
    if (!msg) return;

    const userId = String(msg.from.id);
    const chatId = msg.chat.id;

    // Authorization check
    if (!this.isAllowed(userId)) {
      await this.send(chatId, "Unauthorized.");
      console.warn(`[Telegram] Blocked unauthorized user ${userId}`);
      return;
    }

    const text = msg.text || "";

    // Handle commands
    if (text === "/start") {
      await this.send(chatId,
        "Colors is running.\n\nYour messages are processed locally. " +
        "Nothing is stored on remote servers.\n\nType anything to begin."
      );
      return;
    }

    if (text === "/status") {
      const agent = this.getAgent(userId);
      const status = agent.getStatus();
      await this.send(chatId,
        `Mood: ${status.mood}\n` +
        `Memory: episodic=${status.memory.episodic} semantic=${status.memory.semantic}\n` +
        `Goals: ${status.activeGoals.join(", ") || "none"}`
      );
      return;
    }

    if (text === "/reset") {
      const agent = this.agents.get(userId);
      if (agent) {
        agent.shutdown();
        this.agents.delete(userId);
      }
      await this.send(chatId, "Session reset. Working memory cleared.");
      return;
    }

    // Standard chat
    const agent = this.getAgent(userId);

    // Show typing indicator
    await this.apiCall("sendChatAction", { chat_id: chatId, action: "typing" });

    try {
      const response = await agent.chat(text);

      let reply = response.message;

      // Surface security flags to user
      if (response.flags.some(f => f.includes("INJECTION") || f.includes("PROHIBITION"))) {
        reply += "\n\n⚠️ Security flag triggered — see /status for details.";
      }

      await this.send(chatId, reply);
    } catch (err: any) {
      await this.send(chatId, `Error: ${err.message}`);
    }
  }

  private getAgent(userId: string): ColorsAgent {
    if (!this.agents.has(userId)) {
      const agent = new ColorsAgent({
        apiKey: process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || "",
        storageDir: join(this.storageDir, userId),
        passphrase: this.passphrase + "_" + userId, // per-user passphrase derivation
      });
      this.agents.set(userId, agent);
    }
    return this.agents.get(userId)!;
  }

  private isAllowed(userId: string): boolean {
    return this.allowedUsers.has("*") || this.allowedUsers.has(userId);
  }

  private async send(chatId: number, text: string): Promise<void> {
    // Telegram max message length is 4096 chars
    const chunks = this.chunkText(text, 4000);
    for (const chunk of chunks) {
      await this.apiCall("sendMessage", {
        chat_id: chatId,
        text: chunk,
        parse_mode: "Markdown",
      });
    }
  }

  private chunkText(text: string, maxLen: number): string[] {
    if (text.length <= maxLen) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += maxLen) {
      chunks.push(text.slice(i, i + maxLen));
    }
    return chunks;
  }

  private async apiCall(method: string, params: Record<string, unknown>): Promise<TelegramMessage> {
    const url = `https://api.telegram.org/bot${this.token}/${method}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(35000),
    });
    return response.json() as Promise<TelegramMessage>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
