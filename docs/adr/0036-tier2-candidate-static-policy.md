# 0036. Gate executable scene candidates with a pure static policy

## Status

Accepted

## Context and problem statement

Declarative composition cannot express every reusable visual capability. CP4 may approve investigating executable scene code, but approval of a capability proposal must not grant write or execution authority. Generated TypeScript/TSX can access runtime APIs, introduce nondeterminism, escape asset boundaries, or bypass Remotion's frame-based animation model.

## Decision drivers

- Keep candidate generation separate from production writes and execution.
- Tie every candidate to one approved CP4 proposal.
- Produce deterministic, source-located findings.
- Reject common syntax and alias-based policy bypasses.
- Preserve valid bounded React/Remotion scenes.

## Decision

Introduce a versioned candidate manifest and a pure TypeScript AST policy. The manifest permits one bounded component source and inert registry/catalog additions derived from the approved capability identity. The evaluator verifies hashes, sizes, destinations, dependencies, and required acceptance evidence, then parses source without importing, evaluating, executing, or writing it.

The policy rejects forbidden runtime/import surfaces, dynamic evaluation, process/environment/network/storage access, mutable globals, nondeterminism, arbitrary HTML/style/URL/CSS motion, unsafe asset paths, and alias/computed/reflection bypasses. Remotion animation primitives require frame state.

## Consequences

- CP4 approval still does not authorize execution or promotion.
- Candidates must pass this policy before disposable verification.
- Static policy is defense in depth, not an OS sandbox; quarantine execution remains separately confined.
- New allowed capabilities require explicit policy and adversarial-test changes.
