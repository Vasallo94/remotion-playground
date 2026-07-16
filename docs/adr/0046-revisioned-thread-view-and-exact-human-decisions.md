# ADR 0046: Revisioned ThreadView and exact human decisions

- Status: Accepted
- Date: 2026-07-15

## Context and problem statement

The frontend currently combines an independently fetched snapshot with SSE replay and optimistic local state. A snapshot may overwrite newer events, an absent checkpoint may fail to clear an old card, a replay/live handoff can lose an event, and local loading may remain active after durable completion. Checkpoint requests also permit optional identity fields, while the runtime can manufacture exact promotion authority from a generic approval.

Human checkpoints and restart recovery cannot depend on browser event order or the phrase “approve the current item.”

## Decision drivers

- SQLite is the workflow authority; events are notifications.
- Human decisions must bind the exact artifact and authority being approved.
- Reload, reconnect, replay, and thread switching must be deterministic.
- Internal decision effects should be all-old or all-new after a crash.
- The browser must not infer completion or clear authority optimistically.

## Considered options

### Continue merging snapshot and SSE through local component state

Rejected. Event arrival order is not an authority model and cannot prevent regression without a server revision.

### Use SSE only and reconstruct everything from replay

Rejected. Long-lived threads need compact snapshots and durable current state; replay alone increases recovery cost and complicates compaction.

### Use snapshots only with polling

Rejected. It weakens progress UX and does not remove the need for exact command identities.

### Revisioned server view plus ordered events

Chosen. A monotonic view controls state, while events provide incremental notification and telemetry.

## Decision outcome

The backend exposes a transactional `ThreadView` with:

- monotonic per-thread revision;
- last durable event sequence;
- persisted status: `running`, `waiting`, `idle`, `error`, or `done`;
- active operation ID, action key, and attempt generation;
- exact active checkpoint or `null`;
- plan and current artifact references;
- render result and last error.

Commands carry expected thread revision and exact typed bindings. Human decisions require checkpoint ID/type/version, artifact ID/version/kind/hash where applicable, thread ID, and every authority-specific digest. Missing, stale, replayed, cross-thread, wrong-kind, wrong-version, or wrong-digest commands cause zero mutation.

Checkpoint decision handling uses a compare-and-swap SQLite transaction that records the exact submitted decision and atomically applies artifact approval/revision, plan effects, checkpoint consumption, thread status/revision, and action completion. The coordinator advances directly from persisted state; no pseudo-chat resume message is created.

SSE subscribes and buffers before querying replay, captures a high-water mark, replays through that mark, then flushes buffered events in sequence order with deduplication. Every settled parent operation publishes a thread-state notification referencing the new authoritative revision.

The browser applies only newer revisions, treats checkpoint absence as a clear, resets transient state when thread identity changes, and derives loading from the persisted operation state. Bound checkpoint identity fields cannot be overwritten by component payloads. Render results come from authoritative artifacts/view state, not assistant-message parsing.

## Consequences

### Positive

- Stale snapshots and replayed events cannot resurrect checkpoints.
- Loading state survives reload and settles deterministically.
- Human authority is auditable as the exact submitted command.
- Checkpoint crash windows become transactionally testable.
- Frontend reducers become pure and independently fuzzable.

### Negative

- Snapshot and command wire contracts require versioning.
- Existing clients need a compatibility migration.
- Per-thread revision updates add transaction work.
- SSE handoff logic is more explicit than the current replay-then-subscribe implementation.

## Validation

- Race tests cover snapshot-before-event, event-before-snapshot, event-during-handoff, duplicates, gaps, stale HTTP responses, reconnect, and thread switching.
- Decision fuzz tests mutate every identity and digest and assert zero state mutation.
- Crash injection at every decision transaction boundary yields either the complete prior or complete next state.
- Browser tests cover every durable status and checkpoint after reload.
