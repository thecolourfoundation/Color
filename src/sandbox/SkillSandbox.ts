import { spawn } from "child_process";
import { createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { randomBytes } from "crypto";

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
    const fileHash = this.hashFile(manifest.entrypoint);
    if (fileHash !== manifest.expectedHash) {
      throw new Error(`Skill "${manifest.name}": hash mismatch. File may have been tampered with.`);
    }
    this.manifests.set(manifest.name, manifest);
  }

  async execute(request: SkillExecutionRequest): Promise<SkillExecutionResult> {
    const manifest = this.manifests.get(request.skillName);
    if (!manifest) throw new Error(`Skill "${request.skillName}" is not registered`);

    const currentHash = this.hashFile(manifest.entrypoint);
    if (currentHash !== manifest.expectedHash) {
      throw new Error(`Skill "${request.skillName}" hash changed since registration`);
    }

    if (manifest.requiresNetwork && !request.sessionGrants.networkAccess) {
      throw new Error(`Skill "${request.skillName}" requires network access but grant was not given`);
    }

    const childEnv: Record<string, string> = {
      PATH: process.env.PATH || "",
      NODE_ENV: "sandbox",
      COLORS_SANDBOX: "1",
    };

    for (const key of request.sessionGrants.allowedEnvVars) {
      if (process.env[key]) childEnv[key] = process.env[key]!;
    }

    const startTs = Date.now();
    const executionId = randomBytes(4).toString("hex");

    return new Promise((resolve, reject) => {
      const child = spawn("node", [manifest.entrypoint], {
        env: childEnv,
        stdio: ["pipe", "pipe", "pipe"],
        detached: false,
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
      child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));

      const payload = JSON.stringify({ executionId, input: request.input, networkGranted: request.sessionGrants.networkAccess });
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
          resolve({ success: false, output: null, error: stderr || `Exit code ${code}`, executionMs, networkCallsMade: 0 });
          return;
        }
        try {
          const result = JSON.parse(stdout);
          resolve({ success: true, output: result.output, executionMs, networkCallsMade: result.networkCallsMade ?? 0 });
        } catch {
          resolve({ success: false, output: null, error: `Invalid JSON: ${stdout.slice(0, 200)}`, executionMs, networkCallsMade: 0 });
        }
      });

      child.on("error", (err) => { clearTimeout(timeout); reject(err); });
    });
  }

  private hashFile(filepath: string): string {
    return createHash("sha256").update(readFileSync(filepath)).digest("hex");
  }

  getRegisteredSkills(): SkillManifest[] { return [...this.manifests.values()]; }
  unregisterSkill(name: string): void { this.manifests.delete(name); }
}
