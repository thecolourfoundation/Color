import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { join, resolve, relative } from "path";
import { homedir } from "os";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ToolDefinition {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  inputSchema: Record<string, unknown>;
  executor: (args: Record<string, unknown>) => Promise<unknown>;
}

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private workspaceDir: string;

  constructor(workspaceDir?: string) {
    this.workspaceDir = workspaceDir || join(homedir(), ".colors", "workspace");
    mkdirSync(this.workspaceDir, { recursive: true });
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    this.register(this.fileReadTool());
    this.register(this.fileWriteTool());
    this.register(this.fileListTool());
    this.register(this.shellTool());
    this.register(this.webFetchTool());
    this.register(this.mathTool());
  }

  register(tool: ToolDefinition): void { this.tools.set(tool.name, tool); }
  get(name: string): ToolDefinition | undefined { return this.tools.get(name); }
  list(): ToolDefinition[] { return [...this.tools.values()]; }

  private fileReadTool(): ToolDefinition {
    return {
      name: "file_read", description: "Read a file from the workspace.", riskLevel: "low",
      inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      executor: async (args) => {
        const safePath = this.resolveSafe(args.path as string);
        if (!existsSync(safePath)) throw new Error(`File not found: ${args.path}`);
        const stat = statSync(safePath);
        if (stat.size > 1024 * 1024) throw new Error(`File too large. Max 1MB.`);
        return { content: readFileSync(safePath, "utf8"), path: args.path };
      },
    };
  }

  private fileWriteTool(): ToolDefinition {
    return {
      name: "file_write", description: "Write content to a file in the workspace.", riskLevel: "medium",
      inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, append: { type: "boolean" } }, required: ["path", "content"] },
      executor: async (args) => {
        const safePath = this.resolveSafe(args.path as string);
        mkdirSync(safePath.substring(0, safePath.lastIndexOf("/")), { recursive: true });
        if (args.append) {
          const existing = existsSync(safePath) ? readFileSync(safePath, "utf8") : "";
          writeFileSync(safePath, existing + (args.content as string));
        } else {
          writeFileSync(safePath, args.content as string);
        }
        return { written: true, path: args.path, bytes: (args.content as string).length };
      },
    };
  }

  private fileListTool(): ToolDefinition {
    return {
      name: "file_list", description: "List files in the workspace.", riskLevel: "low",
      inputSchema: { type: "object", properties: { path: { type: "string" }, recursive: { type: "boolean" } } },
      executor: async (args) => {
        const safePath = this.resolveSafe((args.path as string) || ".");
        const walk = (dir: string, depth = 0): string[] => {
          if (depth > 3) return [];
          return readdirSync(dir).flatMap(entry => {
            const full = join(dir, entry);
            const rel = relative(this.workspaceDir, full);
            const stat = statSync(full);
            return [
              `${stat.isDirectory() ? "d" : "f"} ${rel}`,
              ...(args.recursive && stat.isDirectory() ? walk(full, depth + 1) : [])
            ];
          });
        };
        return { entries: walk(safePath) };
      },
    };
  }

  private shellTool(): ToolDefinition {
    const ALLOWED = new Set(["ls","cat","echo","pwd","date","whoami","node","npm","npx","python3","git","curl","wget","grep","find","wc","head","tail","sort","uniq","diff"]);
    return {
      name: "shell_exec", description: "Execute an allowlisted shell command.", riskLevel: "high",
      inputSchema: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string" }, timeout: { type: "number" } }, required: ["command"] },
      executor: async (args) => {
        const command = args.command as string;
        const baseCmd = command.trim().split(/\s+/)[0];
        if (!ALLOWED.has(baseCmd)) throw new Error(`Command "${baseCmd}" not in allowlist.`);
        const cwd = args.cwd ? this.resolveSafe(args.cwd as string) : this.workspaceDir;
        try {
          const output = execSync(command, { cwd, timeout: (args.timeout as number) || 10000, encoding: "utf8", maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, HOME: process.env.HOME } });
          return { output, exitCode: 0 };
        } catch (err: any) {
          return { output: err.stdout || "", stderr: err.stderr || "", exitCode: err.status || 1 };
        }
      },
    };
  }

  private webFetchTool(): ToolDefinition {
    return {
      name: "web_fetch", description: "Fetch a public URL. Private IPs blocked.", riskLevel: "medium",
      inputSchema: { type: "object", properties: { url: { type: "string" }, maxBytes: { type: "number" } }, required: ["url"] },
      executor: async (args) => {
        const url = args.url as string;
        if (!url.startsWith("https://") && !url.startsWith("http://")) throw new Error("Only http/https supported");
        const hostname = new URL(url).hostname;
        if (hostname === "localhost" || hostname.startsWith("127.") || hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
          throw new Error(`Refusing to fetch private address: ${hostname}`);
        }
        const response = await fetch(url, { headers: { "User-Agent": "colors-agent/0.1" }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const maxBytes = (args.maxBytes as number) || 50000;
        return { url, status: response.status, content: text.slice(0, maxBytes), truncated: text.length > maxBytes };
      },
    };
  }

  private mathTool(): ToolDefinition {
    return {
      name: "math_eval", description: "Evaluate a math expression safely.", riskLevel: "low",
      inputSchema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
      executor: async (args) => {
        const expr = args.expression as string;
        if (!/^[\d\s+\-*/().,%^]+$/i.test(expr.replace(/Math\.\w+/g, "0"))) throw new Error("Non-mathematical characters detected");
        const result = Function('"use strict"; const Math = globalThis.Math; return (' + expr + ")")();
        return { expression: expr, result };
      },
    };
  }

  private resolveSafe(relativePath: string): string {
    const resolved = resolve(this.workspaceDir, relativePath);
    if (!resolved.startsWith(this.workspaceDir)) throw new Error(`Path traversal blocked: "${relativePath}"`);
    return resolved;
  }

  toAnthropicTools(): Array<{ name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] } }> {
    return this.list().map(tool => ({ name: tool.name, description: `[${tool.riskLevel.toUpperCase()}] ${tool.description}`, input_schema: { type: "object" as const, ...(tool.inputSchema as any) } }));
  }
}
