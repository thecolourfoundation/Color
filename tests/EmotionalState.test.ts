import { EmotionalState } from "../src/consciousness/EmotionalState";

describe("EmotionalState", () => {
  let state: EmotionalState;

  beforeEach(() => {
    state = new EmotionalState();
  });

  describe("initial state", () => {
    it("starts in neutral mood", () => {
      expect(state.getMood()).toBe("neutral");
    });

    it("starts with reasonable energy and caution", () => {
      expect(state.getEnergy()).toBeGreaterThan(0.5);
      expect(state.getCautionLevel()).toBeLessThan(0.5);
    });
  });

  describe("recordOutcome()", () => {
    it("raises caution after user correction", () => {
      const before = state.getCautionLevel();
      state.recordOutcome({
        success: true,
        wasUserCorrected: true,
        wasSecurityFlagged: false,
        complexityScore: 0.5,
      });
      expect(state.getCautionLevel()).toBeGreaterThan(before);
    });

    it("transitions to stressed after multiple failures", () => {
      for (let i = 0; i < 3; i++) {
        state.recordOutcome({
          success: false,
          wasUserCorrected: false,
          wasSecurityFlagged: false,
          complexityScore: 0.5,
        });
      }
      expect(["stressed", "blocked"]).toContain(state.getMood());
    });

    it("transitions to blocked after many failures", () => {
      for (let i = 0; i < 5; i++) {
        state.recordOutcome({
          success: false,
          wasUserCorrected: false,
          wasSecurityFlagged: false,
          complexityScore: 0.5,
        });
      }
      expect(state.getMood()).toBe("blocked");
    });

    it("raises caution significantly after security flag", () => {
      const before = state.getCautionLevel();
      state.recordOutcome({
        success: false,
        wasUserCorrected: false,
        wasSecurityFlagged: true,
        complexityScore: 0.5,
      });
      expect(state.getCautionLevel()).toBeGreaterThan(before + 0.2);
    });

    it("recovers toward confident with sustained success", () => {
      // First stress it
      for (let i = 0; i < 2; i++) {
        state.recordOutcome({ success: false, wasUserCorrected: false, wasSecurityFlagged: false, complexityScore: 0.5 });
      }
      const stressedMood = state.getMood();

      // Then recover
      for (let i = 0; i < 5; i++) {
        state.recordOutcome({ success: true, wasUserCorrected: false, wasSecurityFlagged: false, complexityScore: 0.3 });
      }

      expect(["neutral", "confident"]).toContain(state.getMood());
    });
  });

  describe("serialization", () => {
    it("round-trips through serialize/deserialize", () => {
      state.recordOutcome({ success: false, wasUserCorrected: true, wasSecurityFlagged: false, complexityScore: 0.8 });
      const serialized = state.serialize();
      const restored = EmotionalState.deserialize(serialized);
      expect(restored.getMood()).toBe(state.getMood());
      expect(restored.getCautionLevel()).toBeCloseTo(state.getCautionLevel());
    });
  });

  describe("toContextString()", () => {
    it("returns a non-empty string for all mood states", () => {
      const moods = ["confident", "neutral", "cautious", "stressed", "blocked"] as const;
      for (const mood of moods) {
        const s = EmotionalState.deserialize({
          mood,
          energy: 0.5,
          caution: 0.5,
          frustration: 0.5,
          lastUpdated: Date.now(),
        });
        expect(s.toContextString().length).toBeGreaterThan(10);
      }
    });
  });
});
