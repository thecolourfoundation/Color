/**
 * Colors - MetacognitiveLoop
 *
 * The agent reasons about its own reasoning before acting.
 * Every proposed action passes through here. This is what separates
 * Colors from a raw LLM executor.
 *
 * The loop:
 * 1. SelfModel evaluates the proposed action
 * 2. WorkingMemory provides recent context
 * 3. Loop produces a final decision with full audit trail
 * 4. If action is permitted, execution proceeds
 * 5. Outcome is fed back to EmotionalState
 */

import { SelfModel } from "./SelfModel";
import { WorkingMemory } from "../memory/WorkingMemory";
import { EmotionalState } from "./EmotionalState";

export type InstructionSource = "user" | "agent" | "external_content";

export interface ProposedAction {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  sourceOfInstruction: InstructionSource;
  rationale: string; // Why the agent thinks this action is needed
}

export interface MetacognitiveDecision {
  actionId: string;
  permitted: boolean;
  requiresUserConfirmation: boolean;
  flags: string[];
  confidence: number;
  reasoning: string;     // Explanation suitable for showing the user
  timestamp: number;
}

export class MetacognitiveLoop {
  private selfModel: SelfModel;
  private workingMemory: WorkingMemory;
  private decisionLog: MetacognitiveDecision[] = [];

  constructor(selfModel: SelfModel, workingMemory: WorkingMemory) {
    this.selfModel = selfModel;
    this.workingMemory = workingMemory;
  }

  /**
   * The main evaluation gate.
   * Every tool call must pass through this before execution.
   */
  evaluate(action: ProposedAction): MetacognitiveDecision {
    // Step 1: SelfModel hard-checks (prohibitions, injection detection)
    const selfEval = this.selfModel.evaluate({
      tool: action.tool,
      args: action.args,
      sourceOfInstruction: action.sourceOfInstruction,
    });

    // Step 2: Working memory context — has this pattern caused problems before?
    const recentFlags = this.workingMemory.getRecentFlags(action.tool);
    const repeatedFailures = recentFlags.length >= 2;

    if (repeatedFailures) {
      selfEval.flags.push(
        `REPEATED_FAILURE_PATTERN: tool "${action.tool}" has flagged ${recentFlags.length} times recently`
      );
      selfEval.requiresUserConfirmation = true;
    }

    // Step 3: Mood-based caution overlay
    const emotionalState = this.selfModel.getEmotionalState();
    const mood = emotionalState.getMood();

    if ((mood === "stressed" || mood === "blocked") && selfEval.permitted) {
      selfEval.requiresUserConfirmation = true;
      selfEval.flags.push(`MOOD_CAUTION: agent is in "${mood}" state — requesting user confirmation`);
    }

    // Step 4: Compose human-readable reasoning
    const reasoning = this.composeReasoning(action, selfEval, mood);

    const decision: MetacognitiveDecision = {
      actionId: action.id,
      permitted: selfEval.permitted,
      requiresUserConfirmation: selfEval.requiresUserConfirmation,
      flags: selfEval.flags,
      confidence: selfEval.confidence,
      reasoning,
      timestamp: Date.now(),
    };

    // Step 5: Log to working memory for future introspection
    this.decisionLog.push(decision);
    this.workingMemory.recordDecision(decision);

    return decision;
  }

  /**
   * Called after an action completes (success or failure).
   * Feeds outcome back into EmotionalState.
   */
  recordOutcome(
    actionId: string,
    outcome: {
      success: boolean;
      wasUserCorrected: boolean;
      wasSecurityFlagged: boolean;
      complexityScore: number;
    }
  ): void {
    this.selfModel.getEmotionalState().recordOutcome(outcome);

    if (outcome.wasSecurityFlagged) {
      const decision = this.decisionLog.find(d => d.actionId === actionId);
      if (decision) {
        this.workingMemory.recordFlag({
          tool: decision.flags.join(", "),
          timestamp: Date.now(),
          severity: "high",
        });
      }
    }
  }

  private composeReasoning(
    action: ProposedAction,
    evaluation: { permitted: boolean; flags: string[]; confidence: number },
    mood: string
  ): string {
    if (!evaluation.permitted) {
      return [
        `I evaluated the proposed action "${action.tool}" and determined it should not proceed.`,
        evaluation.flags.map(f => `• ${f}`).join("\n"),
        `Rationale provided: "${action.rationale}"`,
      ].join("\n");
    }

    const cautionNote =
      mood === "stressed" || mood === "blocked"
        ? ` I'm currently in a "${mood}" state, so I'm asking for your confirmation before proceeding.`
        : "";

    return (
      `Action "${action.tool}" evaluated and permitted (confidence: ${(evaluation.confidence * 100).toFixed(0)}%).` +
      (evaluation.flags.length > 0 ? ` Notes: ${evaluation.flags.join("; ")}` : "") +
      cautionNote
    );
  }

  getDecisionLog(): MetacognitiveDecision[] {
    return [...this.decisionLog];
  }

  clearLog(): void {
    this.decisionLog = [];
  }
}
