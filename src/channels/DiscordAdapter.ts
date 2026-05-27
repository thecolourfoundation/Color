/**
 * Colors - Discord Channel Adapter
 *
 * Connects Colors to Discord via Gateway (WebSocket to Discord's servers,
 * not an exposed local port — the zero-attack-surface model is preserved).
 *
 * Colors only listens to messages in channels it is explicitly added to,
 * or DMs from authorized users.
 *
 * Setup:
 *   1. Create application at discord.com/developers
 *   2. Add bot, get token, enable MESSAGE_CONTENT intent
 *   3. Set DISCORD_BOT_TOKEN in env
 *   4. Set DISCORD_ALLOWED_USERS or DISCORD_ALLOWED_GUILDS
 *   5. Run: colors channel discord
 */

import { ColorsAgent } from "../ColorsAgent";
import { join } from "path";
import { homedir } from "os";

// Discord Gateway opcodes
const OP = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
};

const INTENTS = {
  GUILDS: 1 << 0,
  GUILD_MESSAGES: 1 << 9,
  MESSAGE_CONTENT: 1 << 15,
  DIRECT_MESSAGES: 1 << 12,
};

export class DiscordAdapter {
  private token: string;
  private allowedUsers: Set<string>;
  private agents: Map<string, ColorsAgent> = new Map();
  private passphrase: string;
  private storageDir: string;
  private ws: any = null; // WebSocket
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private sequenceNumber: number | null = null;
  private botUserId: string | null = null;

  constructor(config: {
    token: string;
    allowedUsers: string;
    passphrase: string;
    storageDir?: string;
  }) {
    this.token = config.token;
    this.passphrase = config.passphrase;
    this.storageDir = config.storageDir || join(homedir(), ".colors", "discord");
    this.allowedUsers = config.allowedUsers === "*"
      ? new Set(["*"])
      : new Set(config.allowedUsers.split(",").map(s => s.trim()));
  }

  async start(): Promise<void> {
    console.log("[Discord] Connecting to Gateway...");

    // Get gateway URL
    const gatewayRes = await fetch("https://discord.com/api/v10/gateway", {
      headers: { Authorization: `Bot ${this.token}` },
    });
    const gateway = await gatewayRes.json() as { url: string };

    // Dynamic import of ws (Node.js WebSocket)
    const { default: WebSocket } = await import("ws");
    this.ws = new WebSocket(`${gateway.url}?v=10&encoding=json`);

    this.ws.on("message", (data: Buffer) => {
      const payload = JSON.parse(data.toString());
      this.handlePayload(payload);
    });

    this.ws.on("close", (code: number) => {
      console.log(`[Discord] Gateway closed (${code}). Reconnecting in 5s...`);
      this.cleanup();
      setTimeout(() => this.start(), 5000);
    });

    this.ws.on("error", (err: Error) => {
      console.error("[Discord] WebSocket error:", err.message);
    });

    return new Promise((resolve) => {
      this.ws.on("open", () => {
        console.log("[Discord] Gateway connected");
        resolve();
      });
    });
  }

  stop(): void {
    this.cleanup();
    for (const agent of this.agents.values()) agent.shutdown();
    this.agents.clear();
  }

  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = null;
    }
  }

  private handlePayload(payload: { op: number; d?: any; s?: number; t?: string }): void {
    if (payload.s) this.sequenceNumber = payload.s;

    switch (payload.op) {
      case OP.HELLO:
        this.startHeartbeat(payload.d.heartbeat_interval);
        this.identify();
        break;

      case OP.HEARTBEAT_ACK:
        // Good — connection is alive
        break;

      case OP.DISPATCH:
        this.handleEvent(payload.t!, payload.d);
        break;
    }
  }

  private startHeartbeat(intervalMs: number): void {
    this.heartbeatInterval = setInterval(() => {
      this.send({ op: OP.HEARTBEAT, d: this.sequenceNumber });
    }, intervalMs);
  }

  private identify(): void {
    this.send({
      op: OP.IDENTIFY,
      d: {
        token: this.token,
        intents: INTENTS.GUILDS | INTENTS.GUILD_MESSAGES | INTENTS.MESSAGE_CONTENT | INTENTS.DIRECT_MESSAGES,
        properties: { os: "linux", browser: "colors", device: "colors" },
      },
    });
  }

  private handleEvent(event: string, data: any): void {
    switch (event) {
      case "READY":
        this.botUserId = data.user.id;
        this.sessionId = data.session_id;
        console.log(`[Discord] Ready as ${data.user.username}#${data.user.discriminator}`);
        break;

      case "MESSAGE_CREATE":
        if (data.author.id !== this.botUserId) {
          this.handleMessage(data).catch(err =>
            console.error("[Discord] Message handler error:", err.message)
          );
        }
        break;
    }
  }

  private async handleMessage(msg: {
    id: string;
    channel_id: string;
    author: { id: string; username: string };
    content: string;
    guild_id?: string;
  }): Promise<void> {
    const userId = msg.author.id;

    if (!this.isAllowed(userId)) return;

    const content = msg.content.trim();
    if (!content) return;

    // Show typing indicator
    await this.apiCall(`/channels/${msg.channel_id}/typing`, "POST", {});

    if (content === "!status") {
      const agent = this.getAgent(userId);
      const status = agent.getStatus();
      await this.sendMessage(msg.channel_id,
        `**Mood:** ${status.mood}\n` +
        `**Memory:** episodic=${status.memory.episodic} semantic=${status.memory.semantic}\n` +
        `**Goals:** ${status.activeGoals.join(", ") || "none"}`
      );
      return;
    }

    if (content === "!reset") {
      const agent = this.agents.get(userId);
      if (agent) { agent.shutdown(); this.agents.delete(userId); }
      await this.sendMessage(msg.channel_id, "Session reset.");
      return;
    }

    const agent = this.getAgent(userId);

    try {
      const response = await agent.chat(content);
      let reply = response.message;

      if (response.flags.some(f => f.includes("INJECTION") || f.includes("PROHIBITION"))) {
        reply += "\n\n⚠️ Security flag triggered.";
      }

      // Discord 2000 char limit
      const chunks = this.chunkText(reply, 1990);
      for (const chunk of chunks) {
        await this.sendMessage(msg.channel_id, chunk);
      }
    } catch (err: any) {
      await this.sendMessage(msg.channel_id, `Error: ${err.message}`);
    }
  }

  private getAgent(userId: string): ColorsAgent {
    if (!this.agents.has(userId)) {
      this.agents.set(userId, new ColorsAgent({
        apiKey: process.env.ANTHROPIC_API_KEY || "",
        storageDir: join(this.storageDir, userId),
        passphrase: this.passphrase + "_" + userId,
      }));
    }
    return this.agents.get(userId)!;
  }

  private isAllowed(userId: string): boolean {
    return this.allowedUsers.has("*") || this.allowedUsers.has(userId);
  }

  private async sendMessage(channelId: string, content: string): Promise<void> {
    await this.apiCall(`/channels/${channelId}/messages`, "POST", { content });
  }

  private async apiCall(path: string, method: string, body: unknown): Promise<any> {
    const res = await fetch(`https://discord.com/api/v10${path}`, {
      method,
      headers: {
        Authorization: `Bot ${this.token}`,
        "Content-Type": "application/json",
      },
      body: method !== "GET" ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok && res.status !== 204) {
      const err = await res.text();
      throw new Error(`Discord API ${res.status}: ${err}`);
    }
    return res.status === 204 ? null : res.json();
  }

  private send(payload: unknown): void {
    if (this.ws?.readyState === 1) {
      this.ws.send(JSON.stringify(payload));
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
}
