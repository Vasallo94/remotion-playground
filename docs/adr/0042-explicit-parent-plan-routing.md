# 0042. Require explicit parent-owned pipeline mode and plan creation

## Status

Accepted

## Context and problem statement

The Pi runtime had deterministic handlers for every `new_video` transition, but a general main-model session still received the first user message and was expected to choose a mode and call `create_pipeline_plan`. This left one model-selected orchestration step and made plan identity dependent on tool compliance.

## Decision

New threads require an explicit typed `PipelineMode` at the HTTP boundary. The web new-video surface sends `new_video`; unknown and unimplemented modes fail closed. The parent creates the canonical immutable plan directly before intake, persists it, and emits `plan_updated` without creating or prompting a main-model session.

Thread mode is immutable. Resume requests use the persisted plan and cannot silently switch modes. The deterministic parent loop invokes only known adapters and throws for any unwired action instead of asking a model to choose a tool.

## Consequences

- Supported `new_video` execution no longer depends on a main orchestration model or tool-order prompt.
- Mode intent is explicit, inspectable, and restart-safe.
- Declared but unimplemented modes remain rejected rather than routed heuristically.
- The legacy main-session construction code can now be removed as dead compatibility surface after final regression review.
