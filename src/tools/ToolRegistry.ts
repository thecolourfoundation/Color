import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, realpathSync } from "fs";
import { execFileSync } from "child_process"; // FIX #2: execFileSync, NOT execSync
import { join, resolve, relative, dirname } from "path";
import { homedir } from "os";
import { lookup } from "dns/promises";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface ToolDefinition {
  name: string;
  description: string;
  riskLevel: RiskLevel;
  inputSchema: Record<string, unknown>;
  executor: (args: Record<string, unknown>) => Promise<unknown>;
}

// ─── FIX #3: Comprehensive private/reserved IP ranges ────────────────────────
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,                          // loopback
  /^0\./,                            // 0.0.0.0/8
  /^10\./,                           // RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./,     // RFC1918 172.16–172.31
  /^192\.168\./,                     // RFC1918
  /^169\.254\./,                     // link-local
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // CGNAT RFC6598
  /^198\.51\.100\./,                 // TEST-NET-2
  /^203\.0\.113\./,                  // TEST-NET-3
  /^192\.0\.2\./,                    // TEST-NET-1
  /^::1$/,                           // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,                // IPv6 ULA fc00::/7
  /^fd[0-9a-f]{2}:/i,                // IPv6 ULA
  /^fe80:/i,                         // IPv6 link-local
  /^::ffff:127\./,                   // IPv4-mapped loopback
  /^::ffff:10\./,                    // IPv4-mapped RFC1918
  /^::ffff:192\.168\./,              // IPv4-mapped RFC1918
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((re) => re.test(ip));
}

// ─── FIX #3: DNS rebinding protection — resolve hostname and check resolved IP ─
async function assertPublicUrl(rawUrl: string): Promise<void> {
  if (!rawUrl.startsWith("https://") && !rawUrl.startsWith("http://")) {
    throw new Error("Only http/https supported");
  }
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname;

  // Block bare IP literals first
  if (isPrivateIp(hostname)) {
    throw new Error(`Refusing to fetch private address: ${hostname}`);
  }

  // Resolve DNS and re-check every resolved address
  try {
    const results = await lookup(hostname, { all: true });
    for (const { address } of results) {
      if (isPrivateIp(address)) {
        throw new Error(
          `DNS rebinding blocked: "${hostname}" resolves to private IP ${address}`
        );
      }
    }
  } catch (err: any) {
    if (err.message.startsWith("DNS rebinding") || err.message.startsWith("Refusing")) {
      throw err;
    }
    // DNS lookup failed (NXDOMAIN etc.) — also block
    throw new Error(`Could not resolve hostname: ${hostname}`);
  }
}

// ─── FIX #2: Map allowlisted command names to absolute binary paths ───────────
// This prevents both "curl;evil" and "/bin/curl" bypasses.
// execFileSync does NOT invoke a shell, so metacharacters are inert.
const ALLOWED_COMMANDS: Map<string, string> = new Map([
  ["ls",      "/bin/ls"],
  ["cat",     "/bin/cat"],
  ["echo",    "/bin/echo"],
  ["pwd",     "/bin/pwd"],
  ["date",    "/bin/date"],
  ["whoami",  "/usr/bin/whoami"],
  ["node",    "/usr/bin/node"],
  ["npm",     "/usr/bin/npm"],
  ["npx",     "/usr/bin/npx"],
  ["python3", "/usr/bin/python3"],
  ["git",     "/usr/bin/git"],
  ["grep",    "/bin/grep"],
  ["find",    "/usr/bin/find"],
  ["wc",      "/usr/bin/wc"],
  ["head",    "/usr/bin/head"],
  ["tail",    "/usr/bin/tail"],
  ["sort",    "/usr/bin/sort"],
  ["uniq",    "/usr/bin/uniq"],
  ["diff",    "/usr/bin/diff"],
  // curl/wget intentionally removed — use web_fetch tool instead
]);

// ─── FIX #2: Reject any shell metacharacters before even parsing ──────────────
const SHELL_METACHAR_RE = /[;&|`$(){}<>!#*?[\]\\'"]/;

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
        if (stat.size > 1024 * 1024) throw new Error("File too large. Max 1MB.");
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
        mkdirSync(dirname(safePath), { recursive: true }); // FIX: use dirname(), not substring hack
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
    return {
      name: "shell_exec",
      description: "Execute an allowlisted shell command.",
      riskLevel: "high",
      inputSchema: {
        type: "object",
        properties: {
          command: { type: "string" },
          args: { type: "array", items: { type: "string" } }, // FIX #2: args passed separately
          cwd: { type: "string" },
          timeout: { type: "number" },
        },
        required: ["command"],
      },
      executor: async (args) => {
        const command = (args.command as string).trim();

        // ─── FIX #2a: Reject shell metacharacters immediately ──────────────
        if (SHELL_METACHAR_RE.test(command)) {
          throw new Error(`Shell metacharacters not allowed in command: "${command}"`);
        }

        // ─── FIX #2b: Only accept bare command names, not paths ───────────
        if (command.includes("/") || command.includes("\\")) {
          throw new Error(`Absolute/relative paths not allowed as command: "${command}"`);
        }

        // ─── FIX #2c: Look up the resolved binary path from the allowlist ──
        const binaryPath = ALLOWED_COMMANDS.get(command);
        if (!binaryPath) {
          throw new Error(`Command "${command}" not in allowlist.`);
        }

        // ─── FIX #2d: Validate each argument — no metacharacters ──────────
        const cmdArgs = (args.args as string[] | undefined) || [];
        for (const arg of cmdArgs) {
          if (SHELL_METACHAR_RE.test(arg)) {
            throw new Error(`Shell metacharacters not allowed in argument: "${arg}"`);
          }
        }

        const cwd = args.cwd
          ? this.resolveSafe(args.cwd as string)
          : this.workspaceDir;

        try {
          // ─── FIX #2e: execFileSync does NOT spawn a shell ─────────────
          // Arguments are passed as an array, never interpreted by /bin/sh.
          const output = execFileSync(binaryPath, cmdArgs, {
            cwd,
            timeout: (args.timeout as number) || 10000,
            encoding: "utf8",
            maxBuffer: 1024 * 1024,
            env: {
              PATH: "/usr/local/bin:/usr/bin:/bin",
              // HOME intentionally omitted to prevent ~/.ssh etc. access
            },
          });
          return { output, exitCode: 0 };
        } catch (err: any) {
          return { output: err.stdout || "", stderr: err.stderr || "", exitCode: err.status || 1 };
        }
      },
    };
  }

  private webFetchTool(): ToolDefinition {
    return {
      name: "web_fetch",
      description: "Fetch a public URL. Private IPs and DNS rebinding blocked.",
      riskLevel: "medium",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string" }, maxBytes: { type: "number" } },
        required: ["url"],
      },
      executor: async (args) => {
        const url = args.url as string;

        // ─── FIX #3: Full SSRF protection including DNS rebinding ─────────
        await assertPublicUrl(url);

        const response = await fetch(url, {
          headers: { "User-Agent": "colors-agent/0.1" },
          signal: AbortSignal.timeout(10000),
          redirect: "manual", // FIX: don't auto-follow redirects to private IPs
        });

        // ─── FIX #3: Re-check after redirect ─────────────────────────────
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (location) await assertPublicUrl(location);
        }

        if (!response.ok && response.status < 300) {
          throw new Error(`HTTP ${response.status}`);
        }

        const text = await response.text();
        const maxBytes = (args.maxBytes as number) || 50000;
        return {
          url,
          status: response.status,
          content: text.slice(0, maxBytes),
          truncated: text.length > maxBytes,
        };
      },
    };
  }

  private mathTool(): ToolDefinition {
    return {
      name: "math_eval", description: "Evaluate a math expression safely.", riskLevel: "low",
      inputSchema: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
      executor: async (args) => {
        const expr = args.expression as string;
        if (!/^[\d\s+\-*/().,%^]+$/i.test(expr.replace(/Math\.\w+/g, "0"))) {
          throw new Error("Non-mathematical characters detected");
        }
        const result = Function('"use strict"; const Math = globalThis.Math; return (' + expr + ")")();
        return { expression: expr, result };
      },
    };
  }

  // ─── FIX #1 (mirror): Use realpathSync to resolve symlinks before prefix check ─
  private resolveSafe(relativePath: string): string {
    const candidate = resolve(this.workspaceDir, relativePath);
    // Ensure the candidate is inside workspaceDir before calling realpathSync
    // (realpathSync throws if the path doesn't exist yet, e.g. for writes)
    const existingBase = existsSync(candidate) ? realpathSync(candidate) : candidate;
    const workspaceReal = realpathSync(this.workspaceDir);
    if (!existingBase.startsWith(workspaceReal + "/") && existingBase !== workspaceReal) {
      throw new Error(`Path traversal blocked: "${relativePath}"`);
    }
    return candidate;
  }

  toAnthropicTools(): Array<{
    name: string;
    description: string;
    input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  }> {
    return this.list().map((tool) => ({
      name: tool.name,
      description: `[${tool.riskLevel.toUpperCase()}] ${tool.description}`,
      input_schema: { type: "object" as const, ...(tool.inputSchema as any) },
    }));
  }
}
