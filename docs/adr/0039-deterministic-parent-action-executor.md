# 0039. Claim deterministic parent actions before effects

## Status

Accepted

## Context and problem statement

Canonical coordinator handlers and the durable action journal existed independently. The parent still lacked one reusable boundary that evaluates the exact requested action, claims its idempotency key, executes an injected effect only for a fresh claim, and binds completion or failure to the same attempt generation.

Calling tools or specialists directly before journaling leaves duplicate-effect windows. Letting the executor choose an action would reintroduce model-like orchestration authority.

## Decision

Add `ParentActionExecutor` as a topic-neutral parent-only boundary:

1. Evaluate a caller-supplied request with the pure canonical coordinator.
2. Reject non-canonical, stale, or prerequisite-invalid requests before journal mutation.
3. Fingerprint the exact persisted plan, checkpoint, artifacts, action, and selected artifact IDs.
4. Claim the canonical idempotency key in the durable action journal.
5. Invoke one injected effect only for a newly started attempt.
6. Persist success metadata or normalized failure against the exact attempt generation.
7. Return durable duplicate, in-progress, conflict, or explicit-retry states without executing the effect.

The executor has no specialist, render, publication, promotion, tool, or filesystem APIs and never derives or chooses the next action.

## Consequences

- Parent action effects gain one reusable exactly-once claim boundary.
- Failures require explicit retry and increment the durable attempt generation.
- Restarted duplicate requests return the persisted success without rerunning effects.
- Session integration remains blocked until each effect adapter defines crash-window reconciliation between external/persisted artifacts and an in-progress attempt; the executor alone cannot make an external API and SQLite commit atomic.
