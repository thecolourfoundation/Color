/**
 * Colors - WorkingMemory
 *
 * Short-term in-process memory. Cleared on shutdown.
 * Holds: active goals, recent actions, recent flags, current conversation context.
 *
 * NOT persisted to disk — that's SecureMemoryStore's job.
 * This is the agent's RAM, not its hard drive.
 */

import { MetacognitiveDecision } from "../consciousness/MetacognitiveLoop";

export interface RecentAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  outcome: "success" | "failure" | "pending" | "blocked";
  timestamp: number;
}

export interface FlagRecord {
  tool: string;
  timestamp: number;
  severity: "low" | "medium" | "high";
}

export interface ConversationTurn {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export class WorkingMemory {
  private maxActions = 50;
  private maxFlags = 100;
  private maxConversationTurns = 20;

  private recentActions: RecentAction[] = [];
  private flags: FlagRecord[] = [];
  private conversationHistory: ConversationTurn[] = [];
  private activeGoals: Set<string> = new Set();
  private decisions: MetacognitiveDecision[] = [];

  // ── Actions ──────────────────────────────────────────────────────────────

  recordAction(action: Omit<RecentAction, "timestamp">): void {
    this.recentActions.push({ ...action, timestamp: Date.now() });
    if (this.recentActions.length > this.maxActions) {
      this.recentActions.shift();
    }
  }

  updateActionOutcome(id: string, outcome: RecentAction["outcome"]): void {
    const action = this.recentActions.find(a => a.id === id);
    if (action) action.outcome = outcome;
  }

  getRecentActions(limit = 10): RecentAction[] {
    return this.recentActions.slice(-limit);
  }

  // ── Flags ─────────────────────────────────────────────────────────────────

  recordFlag(flag: FlagRecord): void {
    this.flags.push(flag);
    if (this.flags.length > this.maxFlags) {
      this.flags.shift();
    }
  }

  /**
   * Returns recent flags associated with a tool — used by MetacognitiveLoop
   * to detect repeated failure patterns.
   */
  getRecentFlags(tool: string, windowMs = 10 * 60 * 1000): FlagRecord[] {
    const cutoff = Date.now() - windowMs;
    return this.flags.filter(
      f => f.timestamp > cutoff && f.tool.toLowerCase().includes(tool.toLowerCase())
    );
  }

  // ── Conversation ──────────────────────────────────────────────────────────

  addTurn(turn: Omit<ConversationTurn, "timestamp">): void {
    this.conversationHistory.push({ ...turn, timestamp: Date.now() });
    if (this.conversationHistory.length > this.maxConversationTurns) {
      // Keep the system prompt (index 0) + trim old turns
      const systemPrompts = this.conversationHistory.filter(t => t.role === "system");
      const rest = this.conversationHistory.filter(t => t.role !== "system");
      rest.shift();
      this.conversationHistory = [...systemPrompts, ...rest];
    }
  }

  getConversationHistory(): ConversationTurn[] {
    return [...this.conversationHistory];
  }

  /**
   * Builds the messages array for the LLM API call.
   * Injects self-model identity and emotional state at the top.
   */
  buildLLMMessages(
    systemPrompt: string,
    emotionalContext: string
  ): Array<{ role: string; content: string }> {
    const fullSystem = [systemPrompt, "", "--- Current State ---", emotionalContext].join("\n");

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: fullSystem },
    ];

    for (const turn of this.conversationHistory) {
      if (turn.role !== "system") {
        messages.push({ role: turn.role, content: turn.content });
      }
    }

    return messages;
  }

  // ── Goals ─────────────────────────────────────────────────────────────────

  setGoal(goal: string): void {
    this.activeGoals.add(goal);
  }

  clearGoal(goal: string): void {
    this.activeGoals.delete(goal);
  }

  getGoals(): string[] {
    return [...this.activeGoals];
  }

  // ── Decisions ─────────────────────────────────────────────────────────────

  recordDecision(decision: MetacognitiveDecision): void {
    this.decisions.push(decision);
  }

  // ── Serialization (for handoff to SecureMemoryStore) ─────────────────────

  summarize(): string {
    const actions = this.recentActions.slice(-5);
    const goals = [...this.activeGoals];
    const recentFlags = this.flags.slice(-3);

    return JSON.stringify({
      activeGoals: goals,
      recentActions: actions.map(a => `${a.tool}: ${a.outcome}`),
      recentFlags: recentFlags.map(f => `${f.tool} [${f.severity}]`),
    });
  }

  clear(): void {
    this.recentActions = [];
    this.flags = [];
    this.conversationHistory = [];
    this.activeGoals.clear();
    this.decisions = [];
  }
}
