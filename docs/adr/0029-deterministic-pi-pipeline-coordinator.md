# 0029. Move canonical pipeline sequencing out of the main LLM

## Status

Accepted

## Context

Live Pi testing proved that isolated specialists can produce and repair structured artifacts, but the free-form main session is not a reliable workflow engine. It omitted checkpoint arguments, attempted to bypass scene composition, created a non-canonical plan with invented step ids, and sometimes stopped with prose instead of invoking the required checkpoint tool.

Prompts can reduce these failures but cannot make transition order, checkpoint ownership, retries, or recovery deterministic. LangGraph previously supplied graph control, but retaining LangGraph only for sequencing would defeat the Pi-native migration.

## Decision Drivers

- Preserve Pi SDK sessions and specialist isolation.
- Make workflow transitions replayable and testable without model calls.
- Keep LLMs responsible for interpretation and creative artifacts, not control flow.
- Reject invented plan steps and out-of-order tools.
- Recover from process restart using SQLite artifacts, decisions, and checkpoints.
- Support all declared modes before removing LangGraph.

## Considered Options

### Option 1 — Strengthen the main system prompt

- Pros: minimal code.
- Cons: live evidence shows prompt-only sequencing remains probabilistic.

### Option 2 — Keep LangGraph as the outer coordinator

- Pros: existing graph semantics.
- Cons: two runtimes, duplicated state/checkpoints, deployment complexity, and no completed migration.

### Option 3 — Add a deterministic Pi-native coordinator around isolated specialists

- Pros: one runtime, canonical transitions, direct recovery, explicit guards, and model-independent tests.
- Cons: requires extracting intake/config generation into structured specialists and implementing mode transition tables.

## Decision

Choose Option 3.

The coordinator is a deterministic state machine persisted through the existing SQLite plan, artifacts, decisions, and checkpoint records. For each mode it owns a fixed ordered transition table. It invokes isolated specialists and deterministic services directly, persists their outputs, and creates checkpoints itself.

The main conversational model is reduced to structured intent classification/intake and interpretation of human feedback. It does not create plans, select the next tool, update arbitrary step ids, or decide whether a checkpoint is required.

Known modes use immutable canonical step definitions. Tool-level guards reject unknown steps and out-of-order artifact/checkpoint operations. After restart, the coordinator derives the next transition from persisted state and resumes idempotently.

As amended by ADR 0045, normal `new_video` coordination cannot derive executable scene candidate generation or source promotion. An approved capability gap blocks at `scene_creation` until the bounded Visual Program/recipe workflow is available. Existing Tier 2 source modules remain isolated for legacy recovery and are not normal coordinator extension points.

LangGraph removal is gated on:

1. deterministic transition coverage for every supported mode;
2. restart/checkpoint recovery tests;
3. one complete new-video E2E through final acceptance;
4. Docker/web defaulting to Pi;
5. no remaining web/runtime imports required solely by LangGraph.

## Consequences

- Sol/Luna no longer need to remember a thirty-step procedure.
- Luna can safely handle bounded specialists; Sol-low can focus on intake, narrative, direction, and multimodal judgment.
- Pipeline behavior becomes cheaper and more reliable.
- LangGraph remains temporarily frozen, not enhanced, until the removal gate passes.
