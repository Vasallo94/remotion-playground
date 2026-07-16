# 0040. Reconcile parent actions by effect class

## Status

Accepted

## Context and problem statement

A durable claim before an effect prevents concurrent duplicates, but it cannot make SQLite atomic with an LLM call, provider API, renderer, filesystem publication, or previously separate artifact write. After a crash, blindly retrying or inferring success from the latest artifact can duplicate paid effects or accept unrelated data.

## Decision

Assign every canonical coordinator action one deeply immutable recovery strategy:

- **Atomic artifact commit:** specialist computation returns data; parent inserts all internal artifacts and marks the attempt succeeded in one SQLite transaction.
- **Atomic checkpoint commit:** parent persists checkpoint state and action success together before waiting.
- **Provider idempotency query:** audio/render recovery queries the exact provider/job key before completion or explicit retry.
- **Content-hash verification:** validation/publication recovery verifies exact expected destination or result hashes.
- **No effect / unsupported:** never replayed as an effect.

`AgentPiStore.succeedActionAttemptWithArtifacts` now rolls back every inserted artifact if generation-bound action completion is rejected. Interrupted atomic actions never infer success from an unbound latest artifact: absent an atomic success, the attempt must fail for explicit retry. External actions require a durable receipt query.

## Consequences

- Internal artifact orphan windows are removed for adapters using the atomic API.
- Specialist/API execution before the atomic commit may still be lost on crash, but it is never automatically duplicated; retry remains explicit.
- Existing tools that persist artifacts internally must be refactored into proposal-returning adapters before direct executor wiring.
- Provider and publication actions remain blocked until their receipt/hash reconcilers are implemented and tested.
