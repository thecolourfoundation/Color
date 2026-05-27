# Colors: A Functional Model of Agent Self-Awareness

This document describes the design philosophy behind Colors' consciousness layer. It is intentionally written to be reviewed, critiqued, and improved.

We are not making philosophical claims about machine consciousness. We are making engineering claims: that a specific set of runtime primitives produces measurably better agent behavior than a stateless executor.

---

## The Problem with Stateless Executors

Current AI agents are predominantly stateless executors. They receive a system prompt, a conversation history, and a tool list. They produce a response. They have no persistent self-model, no awareness of their own error patterns, and no mechanism for reasoning about their own reasoning.

This produces three observable failure modes:

**1. Prompt injection vulnerability.** The agent cannot distinguish between "the user told me to do X" and "the document I read told me to do X." Both arrive as text. The agent acts on both.

**2. Error blindness.** The agent makes the same mistake repeatedly because it has no memory of having made it, and no mechanism to raise its own caution threshold in response to failure patterns.

**3. Identity drift.** Over a long conversation, system prompt instructions can be gradually overridden by conversational context. The agent drifts from its stated values without any internal resistance.

---

## The Colors Approach

Colors addresses these failure modes with four primitives:

### 1. The SelfModel

A runtime object — not a string — that the agent holds in memory and actively consults. It contains:

- **Identity**: a structured description of who the agent is and what it values
- **Prohibitions**: a list of hard stops that the agent checks before every action
- **Values**: numeric weights (0–1) for harm avoidance, autonomy respect, privacy, honesty
- **Integrity signature**: an HMAC that detects tampering with the SelfModel itself

The SelfModel is not the system prompt. The system prompt is derived from the SelfModel on each request. This means the agent's identity is a first-class object in code, not a string interpolated into a conversation.

### 2. The MetacognitiveLoop

Before every tool call, the MetacognitiveLoop runs:

1. Checks the instruction source (`user` vs `agent` vs `external_content`)
2. Evaluates the proposed action against prohibitions
3. Checks working memory for repeated failure patterns with this tool
4. Applies emotional state as a caution modifier
5. Produces a structured decision: `{ permitted, requiresUserConfirmation, flags, confidence, reasoning }`

This is metacognition in the engineering sense: reasoning about one's own reasoning process. The agent is not just deciding what to do — it is evaluating whether it should decide to do it.

### 3. EmotionalState

A functional state variable, not a personality feature. EmotionalState tracks:

- **Energy**: rises with successful completions, falls with failures
- **Caution**: rises with user corrections and security flags, falls with recovery time
- **Frustration**: rises with repeated failures, falls with success streaks
- **Mood**: derived from the above (confident → neutral → cautious → stressed → blocked)

Mood affects behavior in concrete ways:
- `stressed`: all tool calls require user confirmation
- `blocked`: agent stops, explains its state, and asks for guidance before proceeding

This is not anthropomorphization. It is a principled mechanism for escalating human oversight when the agent detects it is operating outside its competence.

### 4. Source-Aware Instruction Tracking

Every proposed action is tagged with its source:
- `user`: direct user instruction
- `agent`: agent's own reasoning
- `external_content`: derived from processed external data (web pages, documents, emails)

Actions with `external_content` source are categorically blocked from triggering tool calls. External content can inform the agent's response text. It cannot command the agent's actions.

This is the architectural fix for indirect prompt injection.

---

## What This Is Not

- **Not general intelligence.** Colors is still an LLM wrapper. The consciousness layer shapes how it acts; the LLM determines what it says.
- **Not a solved problem.** A sophisticated adversarial prompt could still manipulate the LLM's output in ways that bypass the metacognitive gate. The gate catches structural attacks (tool call injection); it does not catch subtle semantic manipulation.
- **Not human consciousness.** The EmotionalState does not "feel" anything. It is a caution-weighted decision variable. The naming is evocative and intentional, but should not be mistaken for a claim about subjective experience.

---

## Observable Predictions

If this model is correct, Colors should outperform stateless agents on:

1. **Indirect prompt injection resistance** — measurable with standard injection benchmark datasets
2. **Error recovery** — fewer repeated identical mistakes in multi-turn sessions
3. **User trust over time** — more appropriate escalation to human oversight
4. **Identity stability** — resistance to conversational drift from stated values

We intend to publish benchmark results as the project matures.

---

## Prior Art

- [ReAct: Synergizing Reasoning and Acting in Language Models](https://arxiv.org/abs/2210.03629) — the reasoning-before-action pattern
- [Constitutional AI](https://arxiv.org/abs/2212.08073) — values as a structured constraint set
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366) — self-reflection as a performance mechanism
- [AgentBench](https://arxiv.org/abs/2308.03688) — agent evaluation methodology

Colors extends these with persistent runtime self-modeling and source-aware instruction tracking, which (to our knowledge) have not been combined in this specific way in prior open-source work.

---

*Contributions, critiques, and benchmark results welcome. Open an issue or submit a PR against this document.*
