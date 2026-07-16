# 0032. Resolve technical video targets in the parent runtime

## Status

Accepted

## Context

The current catalog exposes source-oriented groups and the runtime has technical defaults distributed across tools, schemas, and composition registration. That makes it easy for a role or specialist input to inherit a production identity instead of receiving a deliberate target choice. It also prevents the parent from reporting whether an approved brief is incomplete, ambiguous, or requests unsupported capabilities.

The first migration step must not rename existing Remotion components or wire a new coordinator path while parallel recovery-sensitive work is underway.

## Decision Drivers

- Keep composition, dimensions, theme, format, schema, and publication choices explicit data.
- Resolve a target deterministically without subject keywords or recipes.
- Preserve the existing runtime schemas and component identifiers as technical adapters.
- Make the contract portable between the parent, specialists, configurator, and render validation.
- Reject incompatible persisted contract versions before use.

## Considered Options

### Option 1 — Keep catalog groups and infer a target from the brief

- Pros: minimal migration effort.
- Cons: inference is editorially biased, cannot report ambiguity reliably, and repeats target knowledge in role logic.

### Option 2 — Put target choices into every specialist prompt

- Pros: no parent registry needed.
- Cons: prompts become target-specific authorities and cannot safely validate persisted or unsupported selections.

### Option 3 — Use a shared versioned contract and a parent-owned registry/resolver

- Pros: deterministic selection, structured errors, exact schema/prop references, neutral catalog boundary, and isolated tests.
- Cons: integration must migrate existing defaults deliberately rather than silently changing their behavior.

## Decision

Choose Option 3.

`@claqueta/scene-contracts` owns a versioned neutral `TargetContract` type, structural validator, immutable registry constructor, and deterministic resolver. A resolver accepts only explicit target selectors on an approved-brief-like value. It returns one registered contract or structured `unresolved`/`unsupported` data. It never inspects subject, language, platform keywords, or narrative content.

`agent-pi` owns the initial registry adapter. It maps current composition, schema, scene, and publication implementation identifiers into neutral target ids. Registry listing remains parent-only clarification data; no tool or specialist receives the registry before a future parent-owned selection flow resolves one contract.

## Consequences

- Specialists cannot receive target capability data until the parent resolves an explicit target selection; the next integration slice may pass only that one selected contract.
- Existing production component names and Zod schemas remain unchanged.
- The next integration slice must persist a target selector with the production brief, resolve it before specialists run, persist the selected target id/schema version with artifacts, and pass only that one contract to configurator and render validation.
- Legacy tool defaults and source-oriented internal validation remain migration points; they are intentionally not rewired by this foundation.
- Adding a target requires a data-only registry entry plus resolver/schema tests, not a prompt recipe.
