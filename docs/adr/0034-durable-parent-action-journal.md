# 0034. Journal parent-owned actions before side effects

## Status

Accepted

## Context and problem statement

The direct coordinator needs exactly-once boundaries for specialist execution, rendering, publication, and other effects. A deterministic idempotency key alone cannot distinguish a completed action, an interrupted in-progress action, a failed retry generation, or a conflicting reuse after process restart.

## Decision drivers

- Persist action claims across restart.
- Reject conflicting identities and fingerprints.
- Prevent stale callbacks from completing later retries.
- Keep the journal independent from models and effect implementations.
- Migrate existing SQLite databases without destructive rewrites.

## Considered options

### Infer completion from artifacts and plan steps

- Lower storage complexity.
- Cannot represent crash windows reliably and can confuse stale artifacts with completed effects.

### Keep an in-memory idempotency set

- Simple implementation.
- Loses state on restart and cannot coordinate multiple store instances.

### Add a durable transactional action journal

- Explicit started/succeeded/failed lifecycle and retry generations.
- Adds schema and recovery complexity, but creates the required exactly-once boundary.

## Decision

Add a versioned SQLite `action_attempts` journal. The parent claims keys through immediate transactions before invoking an effect, then records success or typed failure with the same thread, fingerprint, and attempt generation. Duplicate successes return the stored result; in-progress attempts remain distinguishable; failed retries require explicit opt-in; identity/fingerprint conflicts and stale callbacks are rejected.

The journal stores only structured metadata and outcomes. It never invokes specialists, renderers, publication, or other effects.

## Consequences

- Restart recovery can determine whether an action is unclaimed, active, failed, or complete.
- Future direct handlers must journal before side effects and finish the same attempt generation.
- Truly abandoned `started` rows require an explicit recovery policy; they are never retried implicitly.
- Schema validation and future-version rejection become startup safety requirements.
