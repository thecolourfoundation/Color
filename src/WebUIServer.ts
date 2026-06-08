/**
 * Colors - WebUI Server
 *
 * Binds to 127.0.0.1 ONLY. Not 0.0.0.0. Not accessible from the network.
 * This is fundamentally different from OpenClaw's exposed gateway.
 *
 * Serves the chat UI and a simple REST + SSE API for the frontend.
 * No WebSocket — SSE (Server-Sent Events) is sufficient and simpler.
 *
 * Routes:
 *   GET  /              → serves the UI
 *   POST /chat          → send a message, returns SSE stream
 *   GET  /status        → agent status JSON
 *   POST /reset         → clear working memory
 *   GET  /memory        → query long-term memory
 */

import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { ColorsAgent } from "./ColorsAgent";

const BIND_HOST = "127.0.0.1"; // NEVER 0.0.0.0

// ─── FIX #4a: Cap incoming request body size ─────────────────────────────────
const MAX_BODY_BYTES = 64 * 1024; // 64 KB — more than enough for a chat message

export class WebUIServer {
  private server: http.Server;
  private agent: ColorsAgent;
  private port: number;

  constructor(agent: ColorsAgent, port = 57341) {
    this.agent = agent;
    this.port = port;
    this.server = http.createServer((req, res) => this.handle(req, res));
  }

  start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.port, BIND_HOST, () => {
        console.log(`\n  Colors UI → http://127.0.0.1:${this.port}\n`);
        resolve();
      });
    });
  }

  stop(): void {
    this.server.close();
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || "/", `http://127.0.0.1`);

    // ─── FIX #4b: Complete CORS headers including preflight support ───────────
    const allowedOrigin = `http://127.0.0.1:${this.port}`;
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400"); // cache preflight 24h
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "default-src 'self'");

    // ─── FIX #4b: Handle OPTIONS preflight explicitly ─────────────────────────
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // ─── FIX #4c: Validate Origin header on state-changing requests ───────────
    // Prevents a page on another localhost port from POSTing to the agent.
    if (req.method === "POST") {
      const origin = req.headers["origin"];
      if (origin && origin !== allowedOrigin) {
        res.writeHead(403);
        res.end(JSON.stringify({ error: "Forbidden: cross-origin POST rejected" }));
        return;
      }
    }

    try {
      if (req.method === "GET" && url.pathname === "/") {
        return this.serveUI(res);
      }

      if (req.method === "POST" && url.pathname === "/chat") {
        return await this.handleChat(req, res);
      }

      if (req.method === "GET" && url.pathname === "/status") {
        return this.handleStatus(res);
      }

      if (req.method === "POST" && url.pathname === "/reset") {
        return this.handleReset(res);
      }

      res.writeHead(404);
      res.end("Not found");
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  private async handleChat(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // ─── FIX #4a: readBody now enforces MAX_BODY_BYTES ───────────────────────
    let body: string;
    try {
      body = await this.readBody(req);
    } catch (err: any) {
      res.writeHead(413);
      res.end(JSON.stringify({ error: err.message }));
      return;
    }

    let message: string;
    try {
      ({ message } = JSON.parse(body));
    } catch {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }

    if (!message?.trim()) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: "message required" }));
      return;
    }

    // SSE stream
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      const response = await this.agent.chat(message);

      // Stream the response word by word for a natural feel
      const words = response.message.split(" ");
      for (let i = 0; i < words.length; i++) {
        const chunk = words[i] + (i < words.length - 1 ? " " : "");
        res.write(`data: ${JSON.stringify({ type: "token", content: chunk })}\n\n`);
        await this.sleep(18);
      }

      // Send metadata at end
      res.write(`data: ${JSON.stringify({
        type: "done",
        mood: response.mood,
        flags: response.flags,
        actionsTaken: response.actionsTaken,
      })}\n\n`);
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: "error", content: err.message })}\n\n`);
    }

    res.end();
  }

  private handleStatus(res: http.ServerResponse): void {
    const status = this.agent.getStatus();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(status));
  }

  private handleReset(res: http.ServerResponse): void {
    // ─── FIX: Actually clear working memory instead of silent no-op ──────────
    try {
      this.agent.resetWorkingMemory();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ reset: true }));
    } catch (err: any) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  private serveUI(res: http.ServerResponse): void {
    // Try built UI first, then fall back to source
    const candidates = [
      path.join(__dirname, "ui", "index.html"),
      path.join(__dirname, "..", "ui", "index.html"),
    ];
    for (const uiPath of candidates) {
      if (fs.existsSync(uiPath)) {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(uiPath));
        return;
      }
    }
    res.writeHead(404);
    res.end("UI not found. Run `npm run build` first.");
  }

  // ─── FIX #4a: Enforce body size limit ────────────────────────────────────
  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      let bytes = 0;

      req.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > MAX_BODY_BYTES) {
          req.destroy(); // stop reading immediately
          reject(new Error(`Request body too large (max ${MAX_BODY_BYTES / 1024}KB)`));
          return;
        }
        body += chunk.toString();
      });

      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
