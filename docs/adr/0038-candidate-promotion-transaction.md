# ADR 0038: Parent-owned candidate promotion as a transactional fail-rollback

- Status: Accepted for exceptional code evolution and legacy recovery; superseded for normal production by ADR 0045
- Date: 2026-07-12

## Context

Tier 2 scene candidates are executable source and registry/catalog changes. A CP4 capability approval is intentionally not a promotion decision. Promotion therefore needs an independent human checkpoint, binding to successful quarantine evidence, confined parent-owned writes, and a recovery path when a multi-file replacement fails.

The filesystem cannot provide true cross-file atomicity through this TypeScript API. The implementation must instead provide transactional fail-rollback: stage and hash every replacement, verify destination preimages immediately before commit, replace files in a deterministic order, and restore exact bytes when a replacement fails.

## Decision

`candidatePromotion.ts` is a parent-only API. It accepts the policy-authenticated `CandidateManifest`, an authenticated successful `QuarantineResult`, exact candidate source strings, and exactly one whole-file output for each declared registry destination. It produces an immutable canonical plan whose digest binds the project root, manifest, evidence digest, source/output bytes, and destination preimage hashes.

A distinct `candidate_promotion_checkpoint` carries the plan and evidence digests. Only an explicit `candidate_promotion_approval` with matching checkpoint ID/version and both digests can authorize promotion; CP4-shaped approvals are rejected. Every path is relative to a non-symbolic project root and is checked for traversal and symbolic-link components.

Replacement uses an injected synchronous filesystem adapter and a versioned SQLite journal on the parent's database connection. The journal persists verifier artifact identity, canonical evidence, plan/checkpoint/approval bindings, exact preimages, after hashes, staging paths, per-file progress, transaction state, and rollback handle identity. `BEGIN IMMEDIATE` serializes competing parent claims.

Staged files are hash-checked before writes, preimages are revalidated immediately before replacement, and module-owned transaction directories are cleaned by exact paths only. Recovery classifies exact before/after/unknown bytes after restart: all-after commits become committed, known mixed commits restore preimages, and unknown drift enters `manual_intervention` without deleting data. Rollback authority and preimages survive restart and rollback refuses post-promotion drift.

## Options considered

### Direct writes

Rejected. A failure after the first write would leave source and registry/catalog files inconsistent, and it would make adversarial testing of recovery difficult.

### A broad project backup or recursive cleanup

Rejected. It expands the write and deletion authority beyond the declared destinations and risks deleting unrelated user files.

### Operating-system cross-file transactions

Unavailable for arbitrary project files. SQLite is used for durable intent, evidence, progress, claim serialization, and recovery state, but the contract explicitly makes no true cross-file OS atomicity claim.

## Consequences

Normal `new_video` no longer invokes this transaction. The contract remains available only to recover or roll back existing durable promotion rows and as retained evidence for any future conventional code-evolution subsystem.

- Promotion authority remains outside specialist sessions, process runners, and model integrations.
- A plan and approval lineage are immutable, canonical, and rehydratable from strict durable rows.
- Known crash windows recover deterministically from exact bytes and hashes; unknown drift fails closed to manual intervention.
- Rollback is explicit, survives restart, and refuses external drift, so operators must resolve drift before retrying.
- Promotion remains disconnected from session/tools until the parent coordinator wires this contract; specialists never receive filesystem authority.
