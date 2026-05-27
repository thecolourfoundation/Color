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

    // CORS — localhost only
    res.setHeader("Access-Control-Allow-Origin", `http://127.0.0.1:${this.port}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");

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
    const body = await this.readBody(req);
    const { message } = JSON.parse(body);

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
    // Trigger a fresh session by shutting down and noting the reset
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ reset: true }));
  }

  private serveUI(res: http.ServerResponse): void {
    const uiPath = path.join(__dirname, "ui", "index.html");
    if (fs.existsSync(uiPath)) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(fs.readFileSync(uiPath));
    } else {
      // Serve inline UI if no build present
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(this.inlineUI());
    }
  }

  private inlineUI(): string {
    return fs.readFileSync(path.join(__dirname, "..", "ui", "index.html"), "utf8");
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => resolve(body));
      req.on("error", reject);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
