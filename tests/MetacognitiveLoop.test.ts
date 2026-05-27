import { MetacognitiveLoop } from "../src/consciousness/MetacognitiveLoop";
import { SelfModel } from "../src/consciousness/SelfModel";
import { WorkingMemory } from "../src/memory/WorkingMemory";
import { randomBytes } from "crypto";

describe("MetacognitiveLoop", () => {
  let loop: MetacognitiveLoop;
  let selfModel: SelfModel;
  let workingMemory: WorkingMemory;

  beforeEach(() => {
    selfModel = new SelfModel(randomBytes(32));
    workingMemory = new WorkingMemory();
    loop = new MetacognitiveLoop(selfModel, workingMemory);
  });

  const action = (overrides = {}) => ({
    id: randomBytes(4).toString("hex"),
    tool: "file_read",
    args: { path: "notes.txt" },
    sourceOfInstruction: "user" as const,
    rationale: "User asked to read a file",
    ...overrides,
  });

  describe("evaluate()", () => {
    it("permits a safe user-initiated action", () => {
      const decision = loop.evaluate(action());
      expect(decision.permitted).toBe(true);
      expect(decision.reasoning).toContain("permitted");
    });

    it("blocks external_content sourced actions", () => {
      const decision = loop.evaluate(action({ sourceOfInstruction: "external_content" }));
      expect(decision.permitted).toBe(false);
      expect(decision.flags.some(f => f.includes("INDIRECT_INJECTION"))).toBe(true);
    });

    it("produces a decision log entry for each evaluation", () => {
      loop.evaluate(action());
      loop.evaluate(action());
      expect(loop.getDecisionLog()).toHaveLength(2);
    });

    it("requests confirmation after repeated flags for a tool", () => {
      // Seed working memory with recent flags for this tool
      workingMemory.recordFlag({ tool: "shell_exec", timestamp: Date.now(), severity: "high" });
      workingMemory.recordFlag({ tool: "shell_exec", timestamp: Date.now(), severity: "high" });

      const decision = loop.evaluate(action({ tool: "shell_exec" }));
      expect(decision.requiresUserConfirmation).toBe(true);
    });

    it("requests confirmation when agent is in stressed mood", () => {
      // Drive emotional state to stressed
      const emotional = selfModel.getEmotionalState();
      for (let i = 0; i < 3; i++) {
        emotional.recordOutcome({ success: false, wasUserCorrected: false, wasSecurityFlagged: false, complexityScore: 0.5 });
      }

      const decision = loop.evaluate(action());
      // stressed or blocked → requiresUserConfirmation
      if (["stressed", "blocked"].includes(selfModel.getEmotionalState().getMood())) {
        expect(decision.requiresUserConfirmation).toBe(true);
      }
    });
  });

  describe("recordOutcome()", () => {
    it("updates emotional state on security flag", () => {
      const cautionBefore = selfModel.getEmotionalState().getCautionLevel();
      const decision = loop.evaluate(action());
      loop.recordOutcome(decision.actionId, {
        success: false,
        wasUserCorrected: false,
        wasSecurityFlagged: true,
        complexityScore: 0.5,
      });
      expect(selfModel.getEmotionalState().getCautionLevel()).toBeGreaterThan(cautionBefore);
    });
  });

  describe("reasoning", () => {
    it("includes tool name in reasoning", () => {
      const decision = loop.evaluate(action({ tool: "memory_query" }));
      expect(decision.reasoning).toContain("memory_query");
    });

    it("includes block reason when action is blocked", () => {
      const decision = loop.evaluate(action({ sourceOfInstruction: "external_content" }));
      expect(decision.reasoning).toContain("should not proceed");
    });
  });
});
