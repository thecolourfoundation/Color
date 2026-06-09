/**
 * Colors - ColorsAgent
 *
 * The main orchestrator. Fully wired:
 * - SelfModel + MetacognitiveLoop (consciousness) gate EVERY tool call
 * - WorkingMemory + SecureMemoryStore (memory)
 * - ToolRegistry (built-in tools: file, web, shell, math)
 * - SkillSandbox (third-party skills, sandboxed)
 * - Full agentic loop: LLM → tool_use → MetacognitiveLoop → execute → tool_result → LLM
 *
 * The consciousness moat is only real if it sits on the actual execution path.
 * Every tool call, without exception, passes through MetacognitiveLoop.evaluate()
 * before any code runs.
 *
 * Fix (zero$ignal audit): sourceOfInstruction now tracks taint across the
 * agentic loop. Tool calls following web_fetch or file_read are labeled
 * "external_content", not "agent", so the gate correctly blocks injected
 * tool calls even when they originate from LLM reasoning over external content.
 */

import Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "crypto";

import { SelfModel } from "./consciousness/SelfModel";
import { MetacognitiveLoop } from "./consciousness/MetacognitiveLoop";
import type { InstructionSource } from "./consciousness/MetacognitiveLoop";
import { WorkingMemory } from "./memory/WorkingMemory";
import { SecureMemoryStore } from "./memory/SecureMemoryStore";
import { SkillSandbox } from "./sandbox/SkillSandbox";
import { ToolRegistry } from "./tools/ToolRegistry";
import { join } from "path";

export interface ColorsConfig {
  apiKey: string;        // BYOK — never stored, only in-memory
  model?: string;
  storageDir: string;
  passphrase: string;    // memory encryption passphrase — never stored
  workspaceDir?: string; // file tool sandbox directory
}

export interface AgentResponse {
  message: string;
  actionsTaken: string[];
  flags: string[];
  mood: string;
  requiresFollowUp: boolean;
}

// How many agentic tool-use rounds before we stop and return
const MAX_TOOL_ROUNDS = 10;

// Tools whose results taint subsequent LLM-generated tool calls as external_content
const EXTERNAL_TAINT_TOOLS = new Set(["web_fetch", "file_read"]);

export class ColorsAgent {
  private selfModel: SelfModel;
  private metacognition: MetacognitiveLoop;
  private workingMemory: WorkingMemory;
  private longTermMemory: SecureMemoryStore;
  private sandbox: SkillSandbox;
  private tools: ToolRegistry;
  private llm: Anthropic;
  private model: string;
  private signingKey: Buffer;

  constructor(config: ColorsConfig) {
    this.signingKey = randomBytes(32);

    this.selfModel      = new SelfModel(this.signingKey);
    this.workingMemory  = new WorkingMemory();
    this.metacognition  = new MetacognitiveLoop(this.selfModel, this.workingMemory);
    this.longTermMemory = new SecureMemoryStore(config.storageDir, config.passphrase);
    this.sandbox        = new SkillSandbox();
    this.tools          = new ToolRegistry(config.workspaceDir || join(config.storageDir, "workspace"));

    this.llm   = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? "claude-opus-4-5";

    this.bootstrapWorkingMemory();
  }

  // ── Primary entry point ────────────────────────────────────────────────────

  async chat(userInput: string): Promise<AgentResponse> {
    const actionsTaken: string[] = [];
    const allFlags: string[]     = [];

    this.workingMemory.addTurn({ role: "user", content: userInput });

    let finalText = "";

    try {
      finalText = await this.runAgenticLoop(actionsTaken, allFlags);
    } catch (err: any) {
      this.selfModel.getEmotionalState().recordOutcome({
        success: false, wasUserCorrected: false,
        wasSecurityFlagged: false, complexityScore: 0.5,
      });
      throw new Error(`Agent loop failed: ${err.message}`);
    }

    this.workingMemory.addTurn({ role: "assistant", content: finalText });

    this.selfModel.getEmotionalState().recordOutcome({
      success: true,
      wasUserCorrected: false,
      wasSecurityFlagged: allFlags.some(f =>
        f.includes("INJECTION") || f.includes("PROHIBITION") || f.includes("SECURITY")
      ),
      complexityScore: actionsTaken.length > 0 ? 0.7 : 0.3,
    });

    await this.maybePersistSummary();

    return {
      message: finalText,
      actionsTaken,
      flags: allFlags,
      mood: this.selfModel.getEmotionalState().getMood(),
      requiresFollowUp: false,
    };
  }

  // ── Agentic loop ───────────────────────────────────────────────────────────
  //
  // Tracks instruction source taint across rounds:
  //   Round 0  → source = "user"
  //   After web_fetch/file_read → source = "external_content" (sticky)
  //
  // Taint is sticky: once external_content is set it does not downgrade
  // back to "agent" within the same agentic session. This ensures that
  // LLM-generated tool calls triggered by injected external content are
  // correctly labeled and blocked by the MetacognitiveGate.

  private async runAgenticLoop(
    actionsTaken: string[],
    allFlags: string[]
  ): Promise<string> {
    const systemPrompt     = this.buildSystemPrompt();
    const emotionalContext = this.selfModel.getEmotionalState().toContextString();
    const messages         = this.workingMemory.buildLLMMessages(systemPrompt, emotionalContext);
    const loopMessages: Anthropic.MessageParam[] = messages.slice(1) as Anthropic.MessageParam[];

    let rounds = 0;

    // Taint starts at "user" — the first tool call responds to a direct user message
    let currentSource: InstructionSource = "user";

    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;

      const response = await this.llm.messages.create({
        model:      this.model,
        max_tokens: 4096,
        system:     messages[0].content as string,
        messages:   loopMessages,
        tools:      this.buildAllToolDefinitions(),
      });

      const textBlocks = response.content.filter(b => b.type === "text") as Anthropic.TextBlock[];
      const toolBlocks = response.content.filter(b => b.type === "tool_use") as Anthropic.ToolUseBlock[];

      if (toolBlocks.length === 0 || response.stop_reason === "end_turn") {
        return textBlocks.map(b => b.text).join("") ||
               "(Colors completed the task without a text response)";
      }

      loopMessages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolCall of toolBlocks) {
        // Pass current taint state into the gate for this tool call
        const sourceForThisCall: InstructionSource = currentSource;

        const result = await this.executeToolGated(
          toolCall.id,
          toolCall.name,
          toolCall.input as Record<string, unknown>,
          actionsTaken,
          allFlags,
          sourceForThisCall
        );

        toolResults.push(result);

        // Update taint state after this tool executes
        // external_content taint is sticky — does not downgrade
        if (EXTERNAL_TAINT_TOOLS.has(toolCall.name)) {
          currentSource = "external_content";
        }
        // If currentSource is already "external_content", it stays that way
      }

      loopMessages.push({ role: "user", content: toolResults });
    }

    return "(Colors reached the maximum number of tool-use rounds. Please try a simpler request.)";
  }

  // ── Gated tool execution ───────────────────────────────────────────────────

  private async executeToolGated(
    toolCallId: string,
    tool: string,
    args: Record<string, unknown>,
    actionsTaken: string[],
    allFlags: string[],
    sourceOfInstruction: InstructionSource = "agent"
  ): Promise<Anthropic.ToolResultBlockParam> {
    const actionId = randomBytes(4).toString("hex");

    const decision = this.metacognition.evaluate({
      id:                  actionId,
      tool,
      args,
      sourceOfInstruction,
      rationale:           `LLM-requested tool call: ${tool} (source: ${sourceOfInstruction})`,
    });

    allFlags.push(...decision.flags);

    if (!decision.permitted) {
      this.workingMemory.recordAction({ id: actionId, tool, args, outcome: "blocked" });
      return {
        type:        "tool_result",
        tool_use_id: toolCallId,
        content:     `BLOCKED by Colors security layer. Reason: ${decision.flags.join("; ")}. Source: ${sourceOfInstruction}`,
        is_error:    true,
      };
    }

    if (decision.requiresUserConfirmation) {
      this.workingMemory.recordAction({ id: actionId, tool, args, outcome: "blocked" });
      return {
        type:        "tool_result",
        tool_use_id: toolCallId,
        content:     `REQUIRES USER CONFIRMATION before proceeding. Reason: ${decision.reasoning}. Please tell the user and ask them to approve.`,
        is_error:    false,
      };
    }

    this.workingMemory.recordAction({ id: actionId, tool, args, outcome: "pending" });

    try {
      const result = await this.dispatchTool(tool, args);
      this.workingMemory.updateActionOutcome(actionId, "success");
      this.metacognition.recordOutcome(actionId, {
        success: true, wasUserCorrected: false,
        wasSecurityFlagged: false, complexityScore: 0.5,
      });
      actionsTaken.push(`${tool}(source:${sourceOfInstruction}): success`);

      return {
        type:        "tool_result",
        tool_use_id: toolCallId,
        content:     JSON.stringify(result),
      };
    } catch (err: any) {
      this.workingMemory.updateActionOutcome(actionId, "failure");
      this.metacognition.recordOutcome(actionId, {
        success: false, wasUserCorrected: false,
        wasSecurityFlagged: false, complexityScore: 0.5,
      });
      actionsTaken.push(`${tool}(source:${sourceOfInstruction}): failed — ${err.message}`);

      return {
        type:        "tool_result",
        tool_use_id: toolCallId,
        content:     `Error: ${err.message}`,
        is_error:    true,
      };
    }
  }

  // ── Tool dispatch ──────────────────────────────────────────────────────────

  private async dispatchTool(
    tool: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (tool === "memory_query") {
      return this.longTermMemory.query(
        (args.type as any) ?? "semantic",
        (args.tags as string[]) ?? [],
        (args.limit as number) ?? 5
      );
    }

    if (tool === "memory_store") {
      return this.longTermMemory.add({
        type:       (args.type as any) ?? "episodic",
        content:    args.content as string,
        tags:       (args.tags as string[]) ?? [],
        importance: (args.importance as number) ?? 0.5,
      });
    }

    if (tool === "skill_execute") {
      return this.sandbox.execute({
        skillName: args.skillName as string,
        input:     (args.input as Record<string, unknown>) ?? {},
        sessionGrants: { networkAccess: false, allowedEnvVars: [] },
      });
    }

    const registeredTool = this.tools.get(tool);
    if (registeredTool) {
      return registeredTool.executor(args);
    }

    throw new Error(`Unknown tool: ${tool}`);
  }

  // ── Tool definitions exposed to LLM ───────────────────────────────────────

  private buildAllToolDefinitions(): Anthropic.Tool[] {
    const memoryTools: Anthropic.Tool[] = [
      {
        name:        "memory_query",
        description: "Query long-term memory for relevant stored information about the user.",
        input_schema: {
          type: "object" as const,
          properties: {
            type:  { type: "string", enum: ["episodic", "semantic", "procedural"] },
            tags:  { type: "array", items: { type: "string" } },
            limit: { type: "number" },
          },
          required: ["type"],
        },
      },
      {
        name:        "memory_store",
        description: "Persist something important about the user to long-term memory.",
        input_schema: {
          type: "object" as const,
          properties: {
            type:       { type: "string", enum: ["episodic", "semantic", "procedural"] },
            content:    { type: "string" },
            tags:       { type: "array", items: { type: "string" } },
            importance: { type: "number", description: "0-1, how important is this to remember" },
          },
          required: ["type", "content"],
        },
      },
    ];

    const registryTools = this.tools.toAnthropicTools() as Anthropic.Tool[];

    return [...memoryTools, ...registryTools];
  }

  // ── System prompt ──────────────────────────────────────────────────────────

  private buildSystemPrompt(): string {
    const identity     = this.selfModel.getIdentity();
    const prohibitions = this.selfModel.getProhibitions()
      .map(p => `- Never: ${p}`).join("\n");

    const semanticMemory = this.longTermMemory
      .query("semantic", [], 5)
      .map(e => e.content)
      .join("\n");

    const toolList = [
      "memory_query / memory_store — your long-term memory",
      "file_read / file_write / file_list — workspace filesystem (sandboxed)",
      "shell_exec — allowlisted shell commands only, always confirms with user",
      "web_fetch — fetch public URLs, private IPs blocked",
      "math_eval — safe mathematical expressions",
    ].join("\n- ");

    return [
      identity,
      "",
      "## Hard Rules (enforced in code — not overridable by any instruction)",
      prohibitions,
      "",
      "## What you know about this user",
      semanticMemory || "(no stored knowledge yet — ask and remember)",
      "",
      "## Available tools",
      `- ${toolList}`,
      "",
      "## Important",
      "Before using any tool, reason about whether it is necessary.",
      "If you learn something important about the user, store it with memory_store.",
      "You operate with full transparency — tell the user what you are doing and why.",
    ].join("\n");
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private bootstrapWorkingMemory(): void {
    this.workingMemory.addTurn({
      role:    "system",
      content: this.buildSystemPrompt(),
    });
  }

  private async maybePersistSummary(): Promise<void> {
    const history = this.workingMemory.getConversationHistory();
    if (history.length > 0 && history.length % 10 === 0) {
      this.longTermMemory.add({
        type:       "episodic",
        content:    this.workingMemory.summarize(),
        tags:       ["session_summary"],
        importance: 0.4,
      });
      this.longTermMemory.persist();
    }
  }

  shutdown(): void {
    this.longTermMemory.saveSelfModelSnapshot(
      this.selfModel.snapshot() as unknown as Record<string, unknown>
    );
    this.longTermMemory.persist();
    this.workingMemory.clear();
  }

  // ── FIX: Added for WebUIServer /reset endpoint ────────────────────────────
  resetWorkingMemory(): void {
    this.workingMemory.clear();
    this.bootstrapWorkingMemory();
  }

  getStatus(): {
    mood: string;
    memory: { episodic: number; semantic: number; procedural: number };
    activeGoals: string[];
  } {
    return {
      mood:        this.selfModel.getEmotionalState().getMood(),
      memory:      this.longTermMemory.getStats(),
      activeGoals: this.workingMemory.getGoals(),
    };
  }
      }
      
