# Thread Revision, Event Sequence, and Transactional Outbox Kernel

## Status

Implemented for Gate 1 Slice 1.

## Scope

Introduce a focused SQLite kernel that owns monotonic per-thread revisions, contiguous per-thread event sequences, atomic event/outbox persistence, and commit-only at-least-once delivery. Preserve the existing `session.ts` behavior and public store/event APIs.

This slice does not implement an authoritative `ThreadView` DTO, checkpoint commands, advancement workers, frontend changes, Visual Recipes, external effects, or Gate 2/3 work.

## Acceptance criteria

- Store schema versioning is independent from the action-journal row schema version.
- Fresh databases finish at global schema markers `{1, 2}`; only no marker, `{1}`, and `{1, 2}` are accepted.
- Version 1 events are backfilled to contiguous per-thread sequences and historical outbox rows are delivered.
- A thread mutation increments its revision at most once, lazily, and nested same-thread mutations reuse it.
- Cross-thread nested mutations, async transaction callbacks, unmanaged SQLite transactions, invalid CAS expectations, and unsafe counter overflow fail closed.
- Event insertion atomically advances `last_event_seq` and creates exactly one outbox row through a trigger.
- Publishing happens only after commit, preserves pending rows on publisher failure, stops at the first failed event, drains all pages, and is restart-safe.
- SSE IDs use the versioned per-thread cursor format and replay is paginated by local sequence.
- Existing action-journal atomicity and session behavior remain unchanged.

## Test cases

- Kernel revision allocation, nested mutations, CAS no-op, rollback, async callbacks, cross-thread nesting, unmanaged transactions, and overflow.
- Event/outbox rollback, publisher failure, mark-after-delivery failure, reentrant delivery, restart, interleaved threads, and 1,203-event draining.
- Fresh, version 1, malformed, corrupt, incomplete, and version 2 migration fixtures.
- Existing store, event, action-journal, parent-action, recovery, specialist, typecheck, lint, web build, render-service, and root quality gates.

## Known limits

At-least-once delivery can duplicate an event if delivery succeeds and marking the row delivered fails. Consumers must deduplicate by `(threadId, seq)`. The slice intentionally does not provide a `ThreadView` authority, checkpoint command protocol, workers, or external-effect fencing.
