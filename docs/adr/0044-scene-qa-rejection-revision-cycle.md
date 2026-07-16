# ADR 0044: Scene QA Rejection Revision Cycle

- Status: Accepted
- Date: 2026-07-13

## Context and problem statement

The live Pi-only E2E proved that Scene QA findings and human rejection were persisted, but the deterministic coordinator then became idle. It could only re-present the consumed QA artifact; it had no durable revision input, no journaled revision action, and no way to distinguish QA for an old config from QA for a regenerated config.

How should a visual rejection re-enter the creative pipeline without restoring a general orchestration model or allowing Scene QA to mutate production artifacts?

## Decision drivers

- Human feedback must remain the authority for requesting a revision.
- Scene QA remains evidence-only and cannot apply edits.
- Every model call remains a proposal from an isolated specialist.
- Revised direction must pass CP2 again.
- Config and QA freshness must be exact, hash-bound, and restart-safe.
- Duplicate callbacks and consumed checkpoint presentations must not repeat side effects.

## Considered options

### Re-run Scene QA against the unchanged config

Rejected. This cannot remediate the finding and caused consumed checkpoint idempotency to leave the plan idle.

### Allow Scene QA to patch config directly

Rejected. It combines reviewer and editor authority, bypasses direction approval, and makes changes difficult to bound.

### Send rejection prose to a main orchestration model

Rejected. The Pi-only architecture intentionally has no general sequencing session, and prose-driven action selection is not deterministic.

### Persist a revision request and re-enter through the director

Chosen. The parent binds human feedback to the exact checkpoint, QA report, config, and previous direction. A distinct journaled action invokes the isolated director in revision mode. Its replacement direction is unapproved and must pass CP2. Config and QA lineage then force regeneration and re-review.

## Decision outcome

The parent persists an approved `direction_revision_request` for rejected Scene QA or rejected revised CP2. It includes content-hash references to the exact base direction, optional base config, and QA report. The coordinator derives `revise_direction` only when the request still targets the latest direction.

After the revision action:

1. A new unapproved direction artifact is committed atomically with action success.
2. The parent presents CP2.
3. Approval makes the previous config stale because config lineage no longer matches the latest direction.
4. The config specialist regenerates from approved inputs; an incompatible prior config is not supplied as a fresh previous config.
5. Scene QA runs again because `qa_lineage` does not match the regenerated config.
6. Only fresh QA can be presented or allow progression.

A CP2 rejection creates another versioned direction revision request and repeats the bounded cycle.

## Consequences

### Positive

- Rejection no longer stalls or silently reuses a consumed checkpoint.
- Human feedback, specialist proposal, CP2, config, and pixels form an auditable chain.
- Restart derivation is identical at every boundary.
- Old config and QA artifacts remain immutable evidence but cannot satisfy current prerequisites.

### Negative

- One rejection may require another director model call, CP2, config call, still render, and QA call.
- Feedback that cannot be represented by the selected scene contract may cycle until the human accepts the limitation or changes approved upstream intent.
- The revision request is persisted before checkpoint consumption; retry logic must deduplicate it by checkpoint id.

## Validation

- Pure coordinator tests cover revision derivation after serialization, CP2, stale config, and stale QA.
- Mocked Pi-only E2E covers missing feedback, QA rejection, CP2 rejection, repeated direction revision, config regeneration, fresh QA, and eventual publication.
- Action reconciliation declares direction revision and QA lineage as atomic internal effects.
