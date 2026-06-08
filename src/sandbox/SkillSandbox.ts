import { spawn } from "child_process";
import { createHash } from "crypto";
import { readFileSync, existsSync, realpathSync } from "fs";
import { randomBytes } from "crypto";
import path from "path";
import os from "os";

// ─── FIX #1: Define a trusted root for all skill entrypoints ───────────────
// All skills MUST live under this directory. Change to your actual skills path.
const SKILLS_ROOT = path.resolve(
  process.env.COLORS_SKILLS_DIR || path.join(os.homedir(), ".colors", "skills")
);

// ─── FIX #1: Resolve and verify a path is inside an allowed root ────────────
function assertInsideDirectory(inputPath: string, allowedRoot: string): string {
  const resolved = realpathSync(path.resolve(inputPath));
  const root = realpathSync(allowedRoot);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    throw new Error(
      `Path traversal or symlink escape blocked: "${inputPath}" resolves outside "${allowedRoot}"`
    );
  }
  return resolved;
}

export interface SkillManifest {
  name: string;
  version: string;
  entrypoint: string;
  expectedHash: string;
  requiresNetwork: boolean;
  requiredEnvVars: string[];
  timeout: number;
}

export interface SkillExecutionRequest {
  skillName: string;
  input: Record<string, unknown>;
  sessionGrants: {
    networkAccess: boolean;
    allowedEnvVars: string[];
  };
}

export interface SkillExecutionResult {
  success: boolean;
  output: unknown;
  error?: string;
  executionMs: number;
  networkCallsMade: number;
}

export class SkillSandbox {
  private manifests: Map<string, SkillManifest> = new Map();

  registerSkill(manifest: SkillManifest): void {
    if (!existsSync(manifest.entrypoint)) {
      throw new Error(`Skill "${manifest.name}": entrypoint not found at ${manifest.entrypoint}`);
    }

    // ─── FIX #1: Reject entrypoints outside the trusted skills directory ──────
    // This blocks path traversal at registration time, including symlinks.
    assertInsideDirectory(manifest.entrypoint, SKILLS_ROOT);

    const fileHash = this.hashFile(manifest.entrypoint);
    if (fileHash !== manifest.expectedHash) {
      throw new Error(`Skill "${manifest.name}": hash mismatch. File may have been tampered with.`);
    }
    this.manifests.set(manifest.name, manifest);
  }

  async execute(request: SkillExecutionRequest): Promise<SkillExecutionResult> {
    const manifest = this.manifests.get(request.skillName);
    if (!manifest) throw new Error(`Skill "${request.skillName}" is not registered`);

    // ─── FIX #1: Re-validate path at execution time (symlink could have changed) ──
    const safeEntrypoint = assertInsideDirectory(manifest.entrypoint, SKILLS_ROOT);

    const currentHash = this.hashFile(safeEntrypoint);
    if (currentHash !== manifest.expectedHash) {
      throw new Error(`Skill "${request.skillName}" hash changed since registration`);
    }

    if (manifest.requiresNetwork && !request.sessionGrants.networkAccess) {
      throw new Error(`Skill "${request.skillName}" requires network access but grant was not given`);
    }

    // ─── FIX #2: Validate allowedEnvVars against a strict allowlist ──────────
    // Prevents a crafted sessionGrants from leaking ANTHROPIC_API_KEY etc.
    const ENV_VAR_ALLOWLIST = new Set(manifest.requiredEnvVars);
    const safeAllowedEnvVars = request.sessionGrants.allowedEnvVars.filter((key) =>
      ENV_VAR_ALLOWLIST.has(key)
    );

    const childEnv: Record<string, string> = {
      // Minimal PATH — only what node needs. No HOME, no USER, no sensitive vars.
      PATH: "/usr/local/bin:/usr/bin:/bin",
      NODE_ENV: "sandbox",
      COLORS_SANDBOX: "1",
    };

    for (const key of safeAllowedEnvVars) {
      if (process.env[key]) childEnv[key] = process.env[key]!;
    }

    const startTs = Date.now();
    const executionId = randomBytes(4).toString("hex");

    return new Promise((resolve, reject) => {
      const child = spawn("node", [safeEntrypoint], {
        env: childEnv,
        stdio: ["pipe", "pipe", "pipe"],
        detached: false,
        // ─── FIX #3: Restrict cwd to a dedicated sandbox temp dir ────────────
        // Child process cannot use relative paths to escape to sensitive dirs.
        cwd: path.join(os.tmpdir(), "colors-sandbox"),
      });

      let stdout = "";
      let stderr = "";
      // ─── FIX #4: Cap output size to prevent memory exhaustion ────────────
      const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB
      let outputBytes = 0;
      let outputTruncated = false;

      child.stdout.on("data", (d: Buffer) => {
        outputBytes += d.length;
        if (outputBytes <= MAX_OUTPUT_BYTES) {
          stdout += d.toString();
        } else if (!outputTruncated) {
          outputTruncated = true;
          child.kill("SIGKILL");
          reject(new Error(`Skill "${request.skillName}" exceeded max output size`));
        }
      });
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString().slice(0, 4096)));

      const payload = JSON.stringify({
        executionId,
        input: request.input,
        networkGranted: request.sessionGrants.networkAccess,
      });
      child.stdin.write(payload);
      child.stdin.end();

      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Skill "${request.skillName}" timed out after ${manifest.timeout}ms`));
      }, manifest.timeout);

      child.on("close", (code) => {
        clearTimeout(timeout);
        const executionMs = Date.now() - startTs;
        if (code !== 0) {
          resolve({
            success: false,
            output: null,
            error: stderr || `Exit code ${code}`,
            executionMs,
            networkCallsMade: 0,
          });
          return;
        }
        try {
          const result = JSON.parse(stdout);
          resolve({
            success: true,
            output: result.output,
            executionMs,
            networkCallsMade: result.networkCallsMade ?? 0,
          });
        } catch {
          resolve({
            success: false,
            output: null,
            error: `Invalid JSON: ${stdout.slice(0, 200)}`,
            executionMs,
            networkCallsMade: 0,
          });
        }
      });

      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  private hashFile(filepath: string): string {
    return createHash("sha256").update(readFileSync(filepath)).digest("hex");
  }

  getRegisteredSkills(): SkillManifest[] {
    return [...this.manifests.values()];
  }

  unregisterSkill(name: string): void {
    this.manifests.delete(name);
  }
    }
      
