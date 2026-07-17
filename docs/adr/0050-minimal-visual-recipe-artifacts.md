# ADR 0050: Store Visual Recipe adoption as immutable artifacts

- Status: Accepted
- Date: 2026-07-17

## Context

ADR 0047 requires immutable target-scoped Visual Recipe adoption. Earlier designs risked introducing recipe tables, activation journals, and another workflow subsystem even though Claqueta already has versioned immutable artifacts, deterministic compilation, and a trusted renderer.

## Decision drivers

- Keep normal production data-only.
- Reuse the existing artifact store.
- Preserve exact historical rendering.
- Make activation deterministic and target-scoped.
- Avoid another registry or scheduler.

## Considered options

### Dedicated recipe and activation tables

Rejected. They duplicate artifact versioning and add migration and transaction surface.

### Mutable recipe registry

Rejected. Updating a recipe could change historical configs.

### Immutable recipe, evidence, and active-set artifacts

Chosen. The existing store versions each kind and preserves prior data.

## Decision

A Visual Recipe is compiled and content-addressed before persistence. A separate evidence artifact records the deterministic state digest at frame zero, every event boundary, and terminal duration. An active-recipe-set artifact selects exact recipe and evidence digests for one target and scene index.

Config projection consumes only the latest approved active set plus approved, verified recipe/evidence artifacts. It copies the config and replaces only activated scene indexes with the statically registered `visual-program` renderer and deeply cloned compiled props. Projected configs embed the active-set digest, remain self-contained, and do not resolve mutable recipe IDs at render time.

Parent-owned config lineage pins the active-set artifact ID, version, content hash, target, and digest. The same reference is carried through QA lineage, final validation, render job, render review, and publication. A later active-set version therefore makes older production evidence stale before another side effect can run.

The parent runtime places activation behind `visual_recipe_adoption_checkpoint`, distinct from CP4. The existing Scene Composer may make exactly one post-CP4 bounded template proposal with one schema-repair turn, but it cannot persist, activate, or project it. The parent compiles and persists recipe/evidence artifacts; approval verifies both, writes a target-scoped active-set artifact, and clears the resolved script capability. Rejection activates nothing and derives a new proposal generation from the persisted decision epoch.

## Consequences

### Positive

- No new database tables or source writes.
- Existing artifact versions provide append-only history.
- Published configs remain reproducible after later activation changes.
- Downstream QA, validation, render, review, and publication prove which exact set produced the config.
- The compiler and renderer versions participate directly in identity.

### Negative

- Active-set lookup is an artifact query rather than a relational join.
- Deactivation requires writing a new active-set artifact.
- Browser-operated lifecycle evidence remains a follow-up gate; mocked parent integration already proves one activation across restart and concurrent duplicate decisions.

## Validation

Pure tests cover deterministic construction, tamper rejection, target scope, idempotent activation, replacement, projection isolation, and store reload. Parent integration covers CP4, rejection/reproposal, runtime restart, concurrent duplicate adoption, and return to CP1. The mocked Pi-only lifecycle covers projected config, QA rejection/revision, validation, render, review, and publication with exact active-set lineage. Scene QA renders and validates every compiled timeline boundary in order before multimodal review.
