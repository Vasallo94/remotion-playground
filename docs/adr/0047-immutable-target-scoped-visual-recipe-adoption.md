# ADR 0047: Immutable target-scoped Visual Recipe adoption

- Status: Accepted
- Date: 2026-07-15

## Context and problem statement

CP4 authorizes a generic capability proposal, not a concrete implementation. Even after executable source is removed from normal production, adopting a reusable visual recipe changes the capability set available to future configuration and rendering. That authority must remain distinct, exact, restart-safe, reversible, and freshness-aware.

The previous executable path used a filesystem promotion journal. Data-only recipes should not inherit source replacement, registry patching, or mutable global component identities.

## Decision drivers

- CP4 and adoption must remain separate human authorities.
- Recipes must be reusable without changing production source.
- Activation must not silently change previously published videos.
- Downstream config and QA must not reuse pre-adoption evidence.
- Duplicate approval and restart must activate at most once.
- Rollback must preserve audit history.

## Considered options

### Treat CP4 as recipe approval

Rejected. It would conflate approval of a generic capability need with approval of one concrete recipe and its evidence.

### Store the latest recipe under a mutable global ID

Rejected. Existing configs would change behavior when the recipe is replaced or rolled back.

### Write each adopted recipe into source/catalog files

Rejected. Data adoption does not require filesystem code promotion and would retain unnecessary multi-file transaction risk.

### Immutable recipe versions with append-only target activation

Chosen. Programs are embedded and pinned; activation changes only the target capability view for future work.

## Decision outcome

A Visual Recipe is an immutable, content-addressed record containing:

- schema version and recipe identity/version;
- topic-neutral contract and closed bindings;
- canonical Visual Program template;
- compiler, renderer, and target-adapter versions;
- behavioral assertions and evidence digest;
- target scope and content digest.

The parent creates a separate adoption checkpoint only after deterministic compilation and independent multi-frame evidence. The human command binds the exact checkpoint, recipe, versions, digests, target capability digest, adoption-plan digest, actor, and expected thread revision.

Approval performs one SQLite transaction that:

1. records the exact human decision;
2. appends the target-scoped activation record;
3. revises the current script to reference the stable `visual-program` renderer and exact recipe/program bindings;
4. creates a fresh selected-target capability snapshot and active-recipe-set digest;
5. consumes the checkpoint;
6. applies plan effects and completes the action.

Rejection activates nothing. Deactivation appends a new record selecting the prior capability view; it never deletes or overwrites recipe history. Published configs embed normalized program data and pin all relevant digests, so later deactivation cannot change their behavior.

The active-recipe-set digest participates in selected-target, config, still, QA, validation, render, review, and publication lineage. Any activation or deactivation makes prior downstream evidence stale for new production.

## Consequences

### Positive

- Reusable capability growth remains human-controlled without source writes.
- Duplicate requests and restart can be exactly idempotent.
- Historical and published behavior remains reproducible.
- Deactivation is safe and auditable.
- Freshness propagates deterministically through the pipeline.

### Negative

- The store needs recipe and activation history contracts.
- Target summaries become snapshot/version dependent.
- Publication manifests contain additional lineage.
- Recipe curation and naming remain product responsibilities.

## Validation

- CP4-shaped and generic boolean approvals are rejected.
- Concurrent duplicate approvals create one activation.
- Crash injection proves all-old/all-new adoption state.
- Rejection creates no activation or source mutation.
- Restart before/after approval derives the same next action.
- Deactivation restores the prior active capability view without deleting records.
- Pre-adoption config, QA, validation, render, and review artifacts cannot satisfy post-adoption prerequisites.
- Published configs continue rendering identically after later activation changes.
