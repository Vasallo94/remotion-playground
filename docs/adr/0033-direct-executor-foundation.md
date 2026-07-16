# 0033. Establish a pure direct-executor foundation before side-effect wiring

## Status

Accepted

## Context

The Pi coordinator currently derives a useful `new_video` action, but `session.ts` still asks the conversational session to perform the next tool call and to repair sequencing. That leaves transition selection probabilistic and makes side-effect ownership difficult to test. The intake and target contracts required by the completion plan (`ProductionBrief` and `TargetContract`) are not implemented yet.

A direct executor must therefore be introduced without coupling it to unfinished contracts or starting production side effects prematurely.

## Decision Drivers

- Keep mode, step, and transition order parent-owned and immutable.
- Reject invented steps, stale artifacts, unapproved artifacts, invalid plans, and out-of-order actions before execution.
- Make restart and duplicate-action decisions reproducible from a serialized snapshot.
- Keep the conversational model outside transition selection and mutation authority.
- Avoid pretending that unsupported modes are implemented.

## Considered Options

### Option 1 — Wire direct handlers into `session.ts` immediately

- Pros: removes the current repair prompt quickly.
- Cons: would bind side effects to incomplete intake and target contracts, making the first integration boundary unstable and potentially target-specific.

### Option 2 — Keep prompt sequencing and add more instructions

- Pros: no structural change.
- Cons: retains the probabilistic failure mode documented in ADR 0029 and cannot provide deterministic idempotency or artifact guards.

### Option 3 — Add pure canonical definitions and action evaluation first

- Pros: provides a model-independent contract, complete mode coverage, and focused tests without invoking filesystem, network, render, publication, or specialist side effects.
- Cons: the existing session remains a temporary adapter until the missing contracts and persistence journal are available.

## Decision

Choose Option 3.

`coordinator.ts` now owns immutable, runtime-frozen canonical mode steps and transition definitions. `new_video` has a deterministic transition table; every other declared mode has canonical steps plus an explicit unsupported result. `DirectActionHandler` declarations describe prerequisites, accepted artifact kinds and approval state, deterministic idempotency keys, success/failure outcomes, and next-state effects.

`evaluateDirectAction()` is pure. It validates the current snapshot, checkpoint boundary, canonical next action, artifact freshness/approval, requested artifact ids, and idempotency key. It returns `ready`, `idempotent`, or a typed rejection; it does not execute or persist side effects. The conversational session is not granted access to this evaluator as a mutation tool in this slice.

## Consequences

- Transition decisions can be replayed after serializing and restoring a snapshot.
- Duplicate action requests can be recognized without invoking a side effect twice when the action key is persisted by a future executor.
- Non-`new_video` modes are visible as deliberate integration blockers rather than silently receiving invented behavior.
- Direct integration remains blocked until `ProductionBrief`, `TargetContract`, durable action-attempt records, and parent-owned specialist/service adapters exist.
- `session.ts` still contains the old repair-prompt loop; replacing it is a subsequent integration step, not part of this contract-independent foundation.
