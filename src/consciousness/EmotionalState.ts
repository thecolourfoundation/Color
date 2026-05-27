/**
 * Colors - EmotionalState
 *
 * Not a gimmick. Emotional valence is a real decision-affecting variable.
 * High stress → higher caution thresholds → more confirmation requests.
 * High confidence → agent acts more autonomously within permitted bounds.
 *
 * State is derived from: recent error rate, user correction frequency,
 * task complexity, and time since last successful completion.
 */

export type Mood = "confident" | "neutral" | "cautious" | "stressed" | "blocked";

export interface EmotionalStateData {
  mood: Mood;
  energy: number;       // 0-1, affects verbosity and effort on complex tasks
  caution: number;      // 0-1, affects confirmation request threshold
  frustration: number;  // 0-1, rises with repeated failures or corrections
  lastUpdated: number;
}

export class EmotionalState {
  private mood: Mood = "neutral";
  private energy: number = 0.8;
  private caution: number = 0.3;
  private frustration: number = 0.0;
  private recentErrors: number = 0;
  private recentCorrections: number = 0;
  private lastSuccessTs: number = Date.now();

  /**
   * Called after each action outcome.
   * Updates internal state based on what just happened.
   */
  recordOutcome(outcome: {
    success: boolean;
    wasUserCorrected: boolean;
    wasSecurityFlagged: boolean;
    complexityScore: number; // 0-1
  }): void {
    if (outcome.success) {
      this.recentErrors = Math.max(0, this.recentErrors - 1);
      this.frustration = Math.max(0, this.frustration - 0.1);
      this.energy = Math.min(1, this.energy + 0.05);
      this.lastSuccessTs = Date.now();
    } else {
      this.recentErrors++;
      this.frustration = Math.min(1, this.frustration + 0.15);
      this.energy = Math.max(0.1, this.energy - 0.1);
    }

    if (outcome.wasUserCorrected) {
      this.recentCorrections++;
      this.caution = Math.min(1, this.caution + 0.1);
    }

    if (outcome.wasSecurityFlagged) {
      this.caution = Math.min(1, this.caution + 0.25);
    }

    this.mood = this.deriveMood();
  }

  /**
   * Decays frustration and caution over time (idle recovery).
   * Call this periodically when the agent is not actively working.
   */
  decay(): void {
    const idleMs = Date.now() - this.lastSuccessTs;
    const idleMinutes = idleMs / 60000;

    if (idleMinutes > 5) {
      this.frustration = Math.max(0, this.frustration - 0.05 * idleMinutes);
      this.caution = Math.max(0.2, this.caution - 0.02 * idleMinutes);
      this.recentErrors = Math.max(0, this.recentErrors - 1);
      this.recentCorrections = Math.max(0, this.recentCorrections - 1);
    }

    this.mood = this.deriveMood();
  }

  private deriveMood(): Mood {
    if (this.recentErrors >= 4 || this.frustration > 0.8) return "blocked";
    if (this.recentErrors >= 2 || this.caution > 0.7) return "stressed";
    if (this.caution > 0.5 || this.recentCorrections >= 2) return "cautious";
    if (this.energy > 0.7 && this.frustration < 0.2) return "confident";
    return "neutral";
  }

  getCautionLevel(): number {
    return this.caution;
  }

  getMood(): Mood {
    return this.mood;
  }

  getEnergy(): number {
    return this.energy;
  }

  /**
   * Returns a natural-language summary for injection into the agent's
   * working context — so the LLM knows how "Colors" is feeling right now.
   */
  toContextString(): string {
    const moodDescriptions: Record<Mood, string> = {
      confident: "You are operating confidently. Recent tasks have gone well. Act with appropriate autonomy.",
      neutral: "You are in a neutral state. Proceed normally with standard caution.",
      cautious: "You have been cautious recently — either corrections or flags occurred. Request confirmation more readily.",
      stressed: "You have encountered multiple errors or flags recently. Slow down. Prefer doing less over doing wrong.",
      blocked: "You are blocked. Something has gone wrong repeatedly. Stop, explain your state to the user, and ask for guidance before proceeding.",
    };
    return moodDescriptions[this.mood];
  }

  serialize(): EmotionalStateData {
    return {
      mood: this.mood,
      energy: this.energy,
      caution: this.caution,
      frustration: this.frustration,
      lastUpdated: Date.now(),
    };
  }

  static deserialize(data: EmotionalStateData): EmotionalState {
    const state = new EmotionalState();
    state.mood = data.mood;
    state.energy = data.energy;
    state.caution = data.caution;
    state.frustration = data.frustration;
    return state;
  }
}
