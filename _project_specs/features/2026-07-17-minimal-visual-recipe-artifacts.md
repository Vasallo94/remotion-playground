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

Activation remains a separate human checkpoint in the parent runtime. This slice does not implement the checkpoint UI or specialist proposal turn.

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

## Tests

1. Build the cascade recipe twice and compare canonical artifacts and digests.
2. Tamper with compiled props or evidence and reject verification.
3. Activate, duplicate-activate, replace, and cross-target reject.
4. Project into a multi-scene config and prove untouched scenes remain byte-equivalent.
5. Persist recipe, evidence, and active set through `AgentPiStore` and reload them unchanged.
