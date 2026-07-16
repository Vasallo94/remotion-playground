# 0037. Use one authenticated manifest for quarantine verification

## Status

Accepted — 2026-07-12

## Context and problem statement

The initial quarantine verifier defined a second candidate manifest describing files, entrypoints, and harness paths. That contract could drift from the Tier 2 manifest authenticated by `candidatePolicy.ts`, causing verification to inspect a different candidate identity from the one accepted by static policy.

## Considered options

1. **Keep both contracts with conversion code.** Rejected because conversion creates a second trust boundary and can silently alter identity.
2. **Make the verifier manifest authoritative and treat policy as advisory.** Rejected because executable candidate identity must remain owned by the static policy boundary.
3. **Consume the policy manifest directly and separate parent-owned harness inputs.** Selected.

## Decision

`candidatePolicy.ts` is the sole candidate-manifest authority. `createQuarantineJob` accepts that exact `CandidateManifest` plus an explicit parent-owned `QuarantineVerificationHarness`.

The verifier seals manifest, source, and harness identities inside an owned non-symlink workspace. It calls `evaluateCandidatePolicy` against exact sealed source bytes before any process and before and after every format, typecheck, lint, bundle, and still stage. Manifest/source/harness substitution, hash or size drift, forbidden source, stale outputs, timeout, capped output, malformed still evidence, or a failed stage blocks every subsequent stage.

Commands use argument-vector spawning without a shell and receive a minimal environment. Results are evidence-only and expose no promotion or production-write API.

## Consequences

- Policy and verification cannot disagree through parallel candidate schemas.
- Harness inputs remain separate from candidate content but are confined and sealed by path, size, digest, and symlink checks.
- Verification is deterministic and fail-closed, but it is not a complete OS sandbox; a narrow filesystem race remains possible around child-process access.
- Parent-owned promotion approval, atomic writes, and rollback remain separate future work.
