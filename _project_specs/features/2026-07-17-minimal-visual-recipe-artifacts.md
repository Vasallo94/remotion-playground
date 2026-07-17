# Feature: Minimal Visual Recipe artifacts

## Status

In progress.

## Problem

Normal video production needs reusable Visual Program behavior without generating TSX or introducing another workflow store. The existing artifact store, Visual Program compiler, and static `visual-program` renderer already provide the required primitives.

## Scope

Add pure builders for three immutable data artifacts:

1. a compiled, content-addressed Visual Recipe;
2. deterministic behavioral evidence at every event boundary;
3. a target-scoped active recipe set for future config projection.

Activation is a separate human checkpoint in the parent runtime. The existing Scene Composer makes one post-CP4 bounded proposal; the parent compiles and persists it before presenting exact adoption authority.

The parent config action consumes only the latest approved active set with approved recipe/evidence artifacts. It embeds exact compiled props and the active-set digest, then carries an artifact/version/hash/digest reference through QA, validation, render, review, and publication.

## Acceptance criteria

- [x] Invalid templates, bindings, target IDs, scene indexes, or compiler output fail before persistence.
- [x] Identical inputs produce byte-equivalent recipe and evidence artifacts.
- [x] Recipe identity pins schema, compiler, renderer, target adapter, target ID, scene index, template, bindings, compiled props, and evidence digest.
- [x] Evidence covers frame zero, every source event boundary, and the terminal duration.
- [x] Active recipe sets are target-scoped, append-only through artifact versions, and deterministic.
- [x] Re-activating the same recipe is idempotent; replacing one scene changes the set digest.
- [x] Config projection replaces only the activated scene indexes with `visual-program` custom scenes and exact compiled props.
- [x] Later activation cannot mutate a previously projected config.
- [x] No source, registry, catalog, or TSX write occurs.
- [x] Parent config generation rejects invalid, unapproved, stale, or cross-target active recipe data.
- [x] Config embeds the active-set digest and exact compiled props after specialist validation.
- [x] Config lineage pins the active-set artifact ID, version, content hash, target, and digest.
- [x] QA, validation, render job, render review, and publication retain the same exact lineage.
- [x] Changing the approved active set makes older config and downstream evidence stale.
- [x] CP4 approval derives one inert recipe proposal and cannot activate it.
- [x] Recipe rejection requires feedback, activates nothing, and derives a new proposal artifact version.
- [x] Recipe approval verifies exact evidence and target scope before writing the active set.
- [x] Adoption clears only the resolved script capability and returns to script approval.

## Tests

1. Build the cascade recipe twice and compare canonical artifacts and digests.
2. Tamper with compiled props or evidence and reject verification.
3. Activate, duplicate-activate, replace, and cross-target reject.
4. Project into a multi-scene config and prove untouched scenes remain byte-equivalent.
5. Persist recipe, evidence, and active set through `AgentPiStore` and reload them unchanged.
6. Run the Pi-only mocked lifecycle with an approved recipe through projected config, two QA passes, validation, render, review, and publication.
7. Assert every downstream artifact and the published lineage file retain the exact active-set digest.
8. Approve CP4, reject the first recipe, approve the reproposal, and verify one active set plus a new unresolved-script version routed to CP1.
