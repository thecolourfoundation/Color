/**
 * Colors - WhatsApp Channel Adapter
 *
 * Uses the @whiskeysockets/baileys library (open source WA Web implementation).
 * Connects via QR code scan — no Meta Business API required.
 *
 * This means it works for personal use out of the box.
 * For production deployments, the Meta Cloud API path is also documented below.
 *
 * Setup:
 *   npm install @whiskeysockets/baileys
 *   colors channel whatsapp
 *   (scan QR code with your phone)
 *
 * Security note: WA session credentials are stored encrypted at
 * ~/.colors/whatsapp/session/ using the same SecureMemoryStore key derivation.
 */

import { ColorsAgent } from "../ColorsAgent";
import { join } from "path";
import { homedir } from "os";
import { mkdirSync } from "fs";

export class WhatsAppAdapter {
  private allowedNumbers: Set<string>; // JIDs like "2547XXXXXXXX@s.whatsapp.net"
  private agents: Map<string, ColorsAgent> = new Map();
  private passphrase: string;
  private storageDir: string;
  private sessionDir: string;
  private sock: any = null;

  constructor(config: {
    allowedNumbers: string; // "2547XXXXXXXX,2541XXXXXXXX" or "*"
    passphrase: string;
    storageDir?: string;
  }) {
    this.passphrase = config.passphrase;
    this.storageDir = config.storageDir || join(homedir(), ".colors", "whatsapp");
    this.sessionDir = join(this.storageDir, "session");
    mkdirSync(this.sessionDir, { recursive: true });

    this.allowedNumbers = config.allowedNumbers === "*"
      ? new Set(["*"])
      : new Set(
          config.allowedNumbers
            .split(",")
            .map(n => n.trim().replace(/\D/g, "") + "@s.whatsapp.net")
        );
  }

  async start(): Promise<void> {
    // Dynamic import — baileys is an optional peer dependency
    let baileys: any;
    try {
      baileys = await import("@whiskeysockets/baileys");
    } catch {
      throw new Error(
        "WhatsApp adapter requires @whiskeysockets/baileys.\n" +
        "Install it: npm install @whiskeysockets/baileys"
      );
    }

    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = baileys;
    const { Boom } = await import("@hapi/boom");

    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      browser: ["Colors", "Desktop", "0.1.0"],
      logger: { level: "warn" } as any,
    });

    this.sock.ev.on("creds.update", saveCreds);

    this.sock.ev.on("connection.update", (update: any) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log("[WhatsApp] Scan the QR code above with your phone.");
      }

      if (connection === "close") {
        const shouldReconnect =
          (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;

        console.log("[WhatsApp] Connection closed. Reconnect:", shouldReconnect);

        if (shouldReconnect) {
          setTimeout(() => this.start(), 5000);
        } else {
          console.log("[WhatsApp] Logged out. Delete session dir to re-pair.");
        }
      }

      if (connection === "open") {
        console.log("[WhatsApp] Connected.");
      }
    });

    this.sock.ev.on("messages.upsert", async (m: any) => {
      const msg = m.messages[0];
      if (!msg.key.fromMe && m.type === "notify") {
        await this.handleMessage(msg).catch((err: Error) =>
          console.error("[WhatsApp] Handler error:", err.message)
        );
      }
    });
  }

  stop(): void {
    this.sock?.end();
    for (const agent of this.agents.values()) agent.shutdown();
    this.agents.clear();
  }

  private async handleMessage(msg: any): Promise<void> {
    const jid = msg.key.remoteJid;
    if (!jid) return;

    // Skip group messages unless explicitly configured
    if (jid.endsWith("@g.us")) return;

    if (!this.isAllowed(jid)) return;

    const text = msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text;

    if (!text?.trim()) return;

    // Typing indicator
    await this.sock.sendPresenceUpdate("composing", jid);

    const userId = jid;
    const agent = this.getAgent(userId);

    try {
      const response = await agent.chat(text.trim());

      let reply = response.message;
      if (response.flags.some((f: string) => f.includes("INJECTION"))) {
        reply += "\n\n⚠️ Security flag triggered.";
      }

      await this.sock.sendMessage(jid, { text: reply });
    } catch (err: any) {
      await this.sock.sendMessage(jid, { text: `Error: ${err.message}` });
    } finally {
      await this.sock.sendPresenceUpdate("available", jid);
    }
  }

  private getAgent(userId: string): ColorsAgent {
    if (!this.agents.has(userId)) {
      this.agents.set(userId, new ColorsAgent({
        apiKey: process.env.ANTHROPIC_API_KEY || "",
        storageDir: join(this.storageDir, "agents", userId.replace(/[^a-z0-9]/gi, "_")),
        passphrase: this.passphrase + "_" + userId,
      }));
    }
    return this.agents.get(userId)!;
  }

  private isAllowed(jid: string): boolean {
    return this.allowedUsers.has("*") || this.allowedUsers.has(jid);
  }

  private get allowedUsers(): Set<string> {
    return this.allowedNumbers;
  }
}
