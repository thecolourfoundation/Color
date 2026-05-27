import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const ALGORITHM = "aes-256-gcm";
const KEY_LEN = 32;
const IV_LEN = 16;
const TAG_LEN = 16;
const SALT_LEN = 32;

export interface MemoryEntry {
  id: string;
  type: "episodic" | "semantic" | "procedural";
  content: string;
  tags: string[];
  importance: number;
  createdAt: number;
  accessedAt: number;
}

export interface MemoryStore {
  episodic: MemoryEntry[];
  semantic: MemoryEntry[];
  procedural: MemoryEntry[];
  selfModelSnapshot?: Record<string, unknown>;
  version: number;
}

export class SecureMemoryStore {
  private storePath: string;
  private encryptionKey: Buffer;
  private hmacKey: Buffer;
  private store: MemoryStore;

  constructor(storageDir: string, userPassphrase: string) {
    mkdirSync(storageDir, { recursive: true });
    this.storePath = join(storageDir, "colors.mem");
    const salt = this.getOrCreateSalt(join(storageDir, ".salt"));
    this.encryptionKey = scryptSync(userPassphrase, salt, KEY_LEN) as Buffer;
    this.hmacKey = scryptSync(userPassphrase + "_hmac", salt, KEY_LEN) as Buffer;
    this.store = this.load();
  }

  private encrypt(plaintext: string): Buffer {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]);
  }

  private decrypt(ciphertext: Buffer): string {
    const iv = ciphertext.subarray(0, IV_LEN);
    const tag = ciphertext.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const data = ciphertext.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(tag);
    return decipher.update(data) + decipher.final("utf8");
  }

  private sign(data: Buffer): string {
    return createHmac("sha256", this.hmacKey).update(data).digest("hex");
  }

  private load(): MemoryStore {
    if (!existsSync(this.storePath)) {
      return { episodic: [], semantic: [], procedural: [], version: 1 };
    }
    try {
      const raw = readFileSync(this.storePath);
      const hmacHex = raw.subarray(0, 64).toString("ascii");
      const ciphertext = raw.subarray(64);
      const expectedHmac = this.sign(ciphertext);
      if (hmacHex !== expectedHmac) {
        throw new Error("MEMORY_INTEGRITY_FAILURE: Colors memory store has been tampered with.");
      }
      return JSON.parse(this.decrypt(ciphertext)) as MemoryStore;
    } catch (err: any) {
      if (err.message.startsWith("MEMORY_INTEGRITY_FAILURE")) throw err;
      console.error("[SecureMemoryStore] Failed to load, starting fresh:", err.message);
      return { episodic: [], semantic: [], procedural: [], version: 1 };
    }
  }

  persist(): void {
    const ciphertext = this.encrypt(JSON.stringify(this.store));
    const hmac = Buffer.from(this.sign(ciphertext), "ascii");
    writeFileSync(this.storePath, Buffer.concat([hmac, ciphertext]));
  }

  add(entry: Omit<MemoryEntry, "id" | "createdAt" | "accessedAt">): MemoryEntry {
    const full: MemoryEntry = { ...entry, id: randomBytes(8).toString("hex"), createdAt: Date.now(), accessedAt: Date.now() };
    this.store[entry.type].push(full);
    this.prune(entry.type);
    return full;
  }

  query(type: MemoryEntry["type"], tags: string[] = [], limit = 10): MemoryEntry[] {
    let entries = this.store[type];
    if (tags.length > 0) entries = entries.filter(e => tags.some(t => e.tags.includes(t)));
    const now = Date.now();
    entries.forEach(e => (e.accessedAt = now));
    return entries.sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt).slice(0, limit);
  }

  delete(id: string): void {
    for (const type of ["episodic", "semantic", "procedural"] as const) {
      this.store[type] = this.store[type].filter(e => e.id !== id);
    }
  }

  private prune(type: MemoryEntry["type"], maxEntries = 200): void {
    if (this.store[type].length <= maxEntries) return;
    this.store[type] = this.store[type]
      .sort((a, b) => b.importance - a.importance)
      .slice(0, maxEntries);
  }

  saveSelfModelSnapshot(snapshot: Record<string, unknown>): void {
    this.store.selfModelSnapshot = snapshot;
  }

  loadSelfModelSnapshot(): Record<string, unknown> | undefined {
    return this.store.selfModelSnapshot;
  }

  private getOrCreateSalt(saltPath: string): Buffer {
    if (existsSync(saltPath)) return readFileSync(saltPath);
    const salt = randomBytes(SALT_LEN);
    writeFileSync(saltPath, salt, { mode: 0o600 });
    return salt;
  }

  getStats(): { episodic: number; semantic: number; procedural: number } {
    return { episodic: this.store.episodic.length, semantic: this.store.semantic.length, procedural: this.store.procedural.length };
  }
}
