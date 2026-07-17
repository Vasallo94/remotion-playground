# ADR 0053: Emit a terminal event for live thread convergence

- Status: Accepted
- Date: 2026-07-12

## Context

The real browser-operated explicit-silence proof completed render, review, and publication, then persisted the thread as `idle` with a completed 13-step plan. The browser had already received the rendered video but continued to display `Procesando...`.

Canonical chat, resume, and retry HTTP endpoints accept work and continue it asynchronously. The frontend sets its loading state immediately, then relies on persisted SSE events to observe checkpoints, errors, or terminal completion. `PiAgentRuntime.sendMessage()` changed a successfully completed thread from `running` to `idle` without emitting an event. Consequently, no live event could clear the frontend loading state after a terminal path.

A page reload recovered correctly from the thread snapshot, proving that persisted authority and rendering were valid and that the defect was limited to live convergence.

## Decision drivers

- Keep persisted parent state authoritative.
- Ensure live and snapshot clients converge to the same completed view.
- Reuse the current event log, outbox, replay, and frontend terminal handling.
- Avoid polling, a second completion model, or frontend-invented authority.
- Do not emit successful completion while work is paused at a checkpoint or has failed.

## Considered options

### Poll thread snapshots after every accepted action

Rejected. It adds another advancement/reconciliation loop and duplicates the existing persisted SSE channel.

### Derive completion in the frontend from plan progress

Rejected. The frontend must not manufacture terminal authority, and plan completion alone does not replace thread status or side-effect receipts.

### Publish the existing `agent_end` event on terminal parent completion

Chosen. The frontend already handles this event by clearing loading, and the event store/outbox already provide durable ordered replay.

## Decision

When `sendMessage()` returns from canonical advancement and the persisted thread remains `running`, the parent must:

1. change the thread status to `idle`;
2. publish one persisted `agent_end` event with `willRetry: false` and `reason: canonical_complete`.

If advancement stops at a checkpoint, the thread is `waiting`; the checkpoint remains the live stop signal and no terminal `agent_end` is emitted. If advancement fails, the existing `error` event remains authoritative.

No table, scheduler, polling loop, lease, or mutable frontend completion state is added.

## Consequences

### Positive

- Live clients clear `Procesando...` immediately after successful terminal work.
- SSE replay and snapshot hydration converge on the same authority.
- Existing video-result events remain unchanged.
- Chat, checkpoint resume, and retry share the same terminal behavior through `sendMessage()`.

### Negative

- `agent_end` now represents parent-owned canonical completion as well as adapted Pi lifecycle completion; consumers should use its payload when they need to distinguish the source.
- Historical completed threads without this event still require snapshot hydration, which already works.

## Validation

The Pi-only E2E asserts that checkpoint pauses emit no terminal completion event and that the final publication path leaves the thread `idle` with exactly one final `agent_end`. The live completed thread is reloaded from its existing snapshot and displays `Completado` plus the original MP4 without rerendering or republishing.
