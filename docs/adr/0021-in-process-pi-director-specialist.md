# 0021. Pilot Pi specialists as isolated in-process SDK sessions

## Status

Accepted

## Context

Claqueta's Pi runtime has recovered the deterministic parts of the former DeepAgents pipeline: curated skills, strict tools, human checkpoints, persistent artifacts, a pipeline plan, SSE telemetry, and frontend recovery. It still runs creative work in one long-lived coordinator session, however, so the web UI has no real specialist executions and role-specific prompts compete inside the coordinator context.

The first specialist should improve a concrete quality failure without adding unrelated infrastructure. The latest optimization tutorial draft requested diagrams, graphs, comparisons, and balances while selecting builtin scenes whose contracts cannot render those visuals. A direction specialist can review an approved script against the actual catalog before CP2 without requiring web search, multimodal input, audio generation, or code-writing permissions.

Pi offers two relevant isolation patterns:

1. Nested `AgentSession` instances created through the SDK in the current Node.js process.
2. The official subagent extension pattern, which spawns `pi --mode json --no-session` subprocesses and parses JSON-line events.

## Decision Drivers

- Keep all filesystem and production effects behind Claqueta-owned tools.
- Use the existing `AuthStorage`, `ModelRegistry`, model routes, EventBus, SQLite plan, and cancellation lifecycle.
- Give the specialist a fresh context window and a role-specific system prompt.
- Return a strict structured artifact instead of free-form text.
- Stream specialist lifecycle events to the existing web UI and preserve replay after reload.
- Avoid granting general coding tools or loading mutable global/project agents.
- Start with a role that proves the architecture before adding research, audio, QA, or code evolution.

## Considered Options

### Option 1 — Role passes in the coordinator session

- Pros: smallest implementation and no nested session lifecycle.
- Cons: no context isolation, no real subagent telemetry, and role instructions still compete with the coordinator prompt.
- Risk: it would not validate the central specialist architecture required for Pi parity.

### Option 2 — Isolated in-process Pi SDK sessions

- Pros: fresh context, direct typed event subscription, shared auth/model routing, straightforward abort/dispose behavior, and direct integration with Claqueta's closed tools and EventBus.
- Cons: shares the Node.js process and requires a small lifecycle/output-capture layer.
- Risk: a badly behaved specialist can consume process resources until aborted, so each run must be scoped and disposed.

### Option 3 — Pi subprocesses based on the official subagent extension

- Pros: strongest process isolation and a proven single/parallel/chain pattern.
- Cons: duplicates CLI invocation and JSON-line parsing inside an SDK host, complicates credential/model propagation, and makes direct store/event integration less precise.
- Risk: process cleanup and environment drift can make the server runtime less deterministic.

### Option 4 — Keep Python DeepAgents behind the Pi coordinator

- Pros: reuses existing specialists immediately.
- Cons: preserves two orchestration runtimes, two event models, and the operational failures the migration is intended to remove.
- Risk: Pi becomes a facade rather than the canonical runtime.

## Decision

Choose Option 2 and pilot it with the `director` specialist.

The coordinator receives a closed `run_direction_specialist` tool. The implementation creates a fresh in-memory Pi `AgentSession` for every invocation, routes it through the existing `direction` model route, provides a curated topic-neutral director prompt plus the approved script and the selected composition's exact scene catalog, and enables only a terminating structured-output tool.

The child session cannot write files, render, approve checkpoints, or call general coding tools. Its structured `DirectionDraft` is returned to the coordinator, which remains responsible for persistence and the CP2 human checkpoint.

Every run emits replayable `subagent_start`, `subagent_update`, `subagent_end`, or `subagent_error` events. Pipeline ownership changes to `director` while the run is active and records the selected model route. The frontend adapts those events to its existing `SubagentStreamInterface` cards.

Subprocess execution remains a fallback if the pilot reveals unacceptable process-level isolation or cancellation behavior. It is not the default architecture.

## Consequences

- Claqueta gains a real Pi specialist with a fresh context while preserving one canonical TypeScript runtime.
- Human approval remains in the coordinator; specialists propose artifacts but do not approve their own work.
- Specialist contracts become explicit, testable modules rather than implicit prompt sections.
- The web UI can display Pi specialists without depending on LangGraph namespaces.
- Additional specialists can reuse the runner pattern, but each role still requires an explicit input/output/tool contract.
- Researcher remains deferred until a grounded search/fetch tool contract exists.
- Scene QA remains deferred until still rendering and multimodal input are available.
- The implementation must cap event payloads, dispose every child session, and avoid publishing hidden reasoning as user-facing content.
