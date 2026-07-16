# ADR 0048: Thread revision, event sequence, and transactional outbox kernel

- Status: Accepted
- Date: 2026-07-16

## Context and problem statement

The Pi store currently uses a global SQLite event identity as its replay cursor, has no durable per-thread revision, and emits live events while the write path is still completing. A failed or restarted publisher can therefore lose the live handoff, deliver out of order, or expose a mutation that later rolls back. Schema migration also couples the global store marker to the action-journal row format.

Gate 1 Slice 1 needs the smallest durable foundation for revisioned state and ordered notifications without changing `session.ts` or claiming to implement the future `ThreadView` and checkpoint command model.

## Decision drivers

- SQLite remains the workflow authority.
- A thread mutation may allocate at most one safe integer revision.
- Durable events require contiguous per-thread sequences.
- Event, sequence counter, and outbox state must commit atomically.
- Delivery must be commit-only and at-least-once, with restart recovery.
- Existing action-journal outcomes and public runtime behavior must remain compatible.

## Considered options

### Keep the global event sequence and emit synchronously

Rejected. It cannot provide a per-thread replay authority or prevent pre-commit publication.

### Put delivery state only in process memory

Rejected. Restart would lose pending notifications and require reconstructing delivery state from memory.

### Add a focused kernel with SQLite triggers and a durable outbox

Chosen. The kernel owns revision allocation, event sequencing, migration validation, post-commit callbacks, and pending delivery. Store methods delegate to it; event bus delivery remains synchronous from the caller's perspective while its publisher runs only after commit.

## Decision outcome

`STORE_SCHEMA_VERSION` is `2`, independent from `ACTION_JOURNAL_SCHEMA_VERSION` `1`. Version 1 databases are migrated in one immediate transaction. Events retain `event_id` as a physical identity but expose `thread_seq` as `PiSseEvent.seq`; SSE IDs are versioned per-thread cursors.

`ThreadStateKernel.withThreadMutation()` establishes one root transaction context. Same-thread nested calls reuse it; cross-thread nesting, asynchronous callbacks, and helpers inside unmanaged transactions fail closed. The root allocates a revision lazily with a guarded unit increment. Event insertion increments `last_event_seq` once, uses the root revision, and relies on an `AFTER INSERT` trigger to create the sole outbox row.

The event bus registers a post-commit drain. Drain pages are ordered by physical event identity, stop on the first publisher failure, retain pending rows, and mark delivery only with an outbox/event compare-and-set. Drains are serialized to preserve reentrant order and can be retried after construction, subscription, or explicit invocation.

## Consequences

### Positive

- Revision and local replay cursors are durable and monotonic.
- Rollback cannot leave an event, sequence increment, or outbox row behind.
- Publisher failure is recoverable without rolling back the already committed mutation.
- Restart and replay no longer depend on process memory or global IDs.
- Action-journal transactions can share one root revision when composed by existing store methods.

### Negative

- At-least-once delivery permits duplicates around a mark-after-delivery failure.
- Every thread-scoped store mutation now participates in a kernel context.
- Migration validation is stricter and rejects unsupported or partially upgraded databases.
- The current HTTP thread snapshot is still not a `ThreadView` authority.

## Risks and mitigations

- A publisher can fail after performing an external action: retain the row and require consumer deduplication by `(threadId, seq)`.
- A callback can re-enter the event bus: serialize drains and process pending rows in event order.
- Corrupt legacy schemas can make backfill ambiguous: validate before mutation and fail closed inside the immediate migration.

## Validation

Production-path tests cover rollback, publisher failure, mark-after-delivery failure, restart, reentrant delivery, interleaved threads, nested mutations, unmanaged transactions, CAS no-op, migration corruption, and 1,203 events. Full project quality gates are recorded in `agent-report.md`.
