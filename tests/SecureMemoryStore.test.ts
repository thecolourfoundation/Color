import { SecureMemoryStore } from "../src/memory/SecureMemoryStore";
import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("SecureMemoryStore", () => {
  let testDir: string;
  let store: SecureMemoryStore;

  beforeEach(() => {
    testDir = join(tmpdir(), `colors-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    store = new SecureMemoryStore(testDir, "test-passphrase-123");
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("basic operations", () => {
    it("stores and retrieves an episodic entry", () => {
      store.add({
        type: "episodic",
        content: "User asked about the weather",
        tags: ["weather", "casual"],
        importance: 0.5,
      });

      const results = store.query("episodic");
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("User asked about the weather");
    });

    it("stores and retrieves semantic entries by tag", () => {
      store.add({ type: "semantic", content: "User prefers dark mode", tags: ["preferences", "ui"], importance: 0.7 });
      store.add({ type: "semantic", content: "User is a software engineer", tags: ["profession"], importance: 0.8 });
      store.add({ type: "semantic", content: "User likes coffee", tags: ["preferences", "food"], importance: 0.4 });

      const prefResults = store.query("semantic", ["preferences"]);
      expect(prefResults).toHaveLength(2);
      expect(prefResults.map(r => r.content)).toContain("User prefers dark mode");
    });

    it("deletes entries by id", () => {
      const entry = store.add({ type: "episodic", content: "temp memory", tags: [], importance: 0.1 });
      expect(store.query("episodic")).toHaveLength(1);

      store.delete(entry.id);
      expect(store.query("episodic")).toHaveLength(0);
    });

    it("returns stats correctly", () => {
      store.add({ type: "episodic", content: "ep1", tags: [], importance: 0.5 });
      store.add({ type: "episodic", content: "ep2", tags: [], importance: 0.5 });
      store.add({ type: "semantic", content: "sem1", tags: [], importance: 0.5 });

      const stats = store.getStats();
      expect(stats.episodic).toBe(2);
      expect(stats.semantic).toBe(1);
      expect(stats.procedural).toBe(0);
    });
  });

  describe("encryption and persistence", () => {
    it("persists to disk and reloads correctly", () => {
      store.add({ type: "semantic", content: "persistent fact", tags: ["test"], importance: 0.9 });
      store.persist();

      // Load a new instance from the same directory
      const store2 = new SecureMemoryStore(testDir, "test-passphrase-123");
      const results = store2.query("semantic", ["test"]);
      expect(results).toHaveLength(1);
      expect(results[0].content).toBe("persistent fact");
    });

    it("rejects load with wrong passphrase", () => {
      store.add({ type: "semantic", content: "secret", tags: [], importance: 0.9 });
      store.persist();

      // Wrong passphrase — should fail to decrypt (GCM auth tag mismatch)
      expect(() => {
        new SecureMemoryStore(testDir, "wrong-passphrase");
      }).not.toThrow(); // Starts fresh rather than crashing, but data is inaccessible

      const store2 = new SecureMemoryStore(testDir, "wrong-passphrase");
      // Data should not be readable
      expect(store2.query("semantic")).toHaveLength(0);
    });

    it("detects and rejects tampered memory file", () => {
      store.add({ type: "semantic", content: "important", tags: [], importance: 0.9 });
      store.persist();

      // Tamper with the file: flip some bytes in the ciphertext region
      const fs = require("fs");
      const memFile = join(testDir, "colors.mem");
      const raw = fs.readFileSync(memFile);
      // Tamper with byte 100 (well into ciphertext, past the 64-byte HMAC)
      raw[100] = raw[100] ^ 0xFF;
      fs.writeFileSync(memFile, raw);

      expect(() => {
        new SecureMemoryStore(testDir, "test-passphrase-123");
      }).toThrow(/MEMORY_INTEGRITY_FAILURE/);
    });
  });

  describe("self-model snapshot", () => {
    it("saves and loads self-model snapshot", () => {
      const snapshot = { identity: "I am Colors", version: 1, values: { harmAvoidance: 0.9 } };
      store.saveSelfModelSnapshot(snapshot);
      store.persist();

      const store2 = new SecureMemoryStore(testDir, "test-passphrase-123");
      const loaded = store2.loadSelfModelSnapshot();
      expect(loaded).toEqual(snapshot);
    });
  });
});
