# Tier 2 parent-owned promotion transaction

## Status

Contract completed; temporary runtime integration is frozen and isolated pending legacy recovery retirement

## Goal

Preserve the verified executable-scene promotion transaction as an exceptional code-evolution and legacy-recovery contract, with exact evidence binding, confined parent-only writes, transactional failure rollback, and explicit post-promotion rollback. Normal `new_video` production must not invoke it.

## Acceptance criteria

- CP4 capability approval cannot authorize source promotion.
- Promotion requires a separate decision bound to one immutable plan digest and one successful quarantine result.
- The plan consumes the authenticated candidate manifest and exact verified source bytes.
- Source and registry/catalog outputs are the only allowed destinations; no undeclared file may be written.
- Every destination is confined beneath the selected project root and rejects symlinks/traversal.
- Existing destination hashes are captured at planning and revalidated immediately before writes.
- All outputs are staged and hash-checked before replacement begins.
- A failed multi-file replacement restores every prior file and removes newly introduced files.
- A successful promotion returns an authenticated rollback handle; rollback refuses drifted promoted files.
- Promotion and rollback publish evidence only through parent-owned APIs. Specialists receive no filesystem capability.
- Normal runtime/session coordination cannot generate or promote executable source. Existing journal rows may only recover, roll back, or fail closed to manual intervention.

## Resolved supervision blockers

- Replaced process-local evidence, plan, checkpoint, approval, and rollback authority with strict versioned SQLite rows.
- Persisted verifier artifact identity, canonical evidence, exact before bytes/absence, hashes, per-file progress, staging path, state, and rollback handle identity.
- Added restart recovery for staging, mixed/all-after commit windows, durable rollback, unknown drift, future/corrupt schemas, and competing SQLite claims.
- Runtime integration was temporarily enabled for the novel-scene experiment, then frozen after free-form TSX generation proved unreliable and unsafe as a normal capability boundary. ADR 0045 supersedes normal-production use while preserving this contract for legacy recovery.

## Test cases

- Reject non-promotable, wrong-candidate, malformed, or modified verifier evidence.
- Reject approval copied from CP4, stale checkpoint IDs, false approval, and changed plan/evidence digests.
- Reject missing/extra registry outputs, traversal, symlinks, undeclared destinations, and stale preimages.
- Promote source plus all registry/catalog outputs and preserve exact bytes.
- Inject a mid-transaction rename failure and prove automatic restoration.
- Roll back a successful promotion and prove exact preimages return.
- Reject rollback after external post-promotion drift or with a forged handle.
