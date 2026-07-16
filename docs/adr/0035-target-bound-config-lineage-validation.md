# 0035. Validate target-bound configuration lineage outside production config data

## Status

Accepted

## Context

The initial configurator accepted raw script, direction, catalog, audio, and previous-config data. Its parent validation only required a non-empty scene array plus an optional render-service response. That boundary could not prove artifact approval, exact target selection, scene/copy lineage, approved-audio preservation, or previous-config freshness. Adding lineage fields directly to generated production configs would also couple persistence metadata to render schemas that may reject or strip unknown fields.

## Decision Drivers

- Reject unapproved, unresolved, unsupported, stale, or creatively divergent input before persistence.
- Keep the specialist target-neutral and side-effect-free.
- Validate against the actual parent render schemas and the exact selected registry contract.
- Permit one repair turn without allowing repeated model-driven correction loops.
- Preserve lineage for restart/persistence without modifying production config schemas.

## Considered Options

### Option 1 — Embed target and lineage metadata in every production config

- Pros: lineage travels with the config in one object.
- Cons: changes public render contracts, may be stripped or rejected by schema adapters, and mixes orchestration metadata with render input.

### Option 2 — Trust render-schema validation alone

- Pros: minimal implementation.
- Cons: render validity does not prove artifact approval, target selection, scene order, approved copy, audio identity, or previous-config freshness.

### Option 3 — Return config and parent-owned lineage as separate typed values

- Pros: preserves render-schema compatibility, supports deterministic persistence, and allows strict pre/post-specialist validation.
- Cons: future persistence wiring must store both values atomically and attach the resulting config artifact identity.

## Decision

Choose Option 3.

The configurator now requires approved artifact envelopes for a ready `ProductionBrief`, script, and direction; optional audio must also be approved. The previous-config input is explicit: `null` for first generation or a latest-version artifact with a matching content hash and compatible approved-input lineage. A resolved target summary is accepted only when it exactly matches one immutable parent registry entry.

Parent validation applies the selected render schema, composition/dimension/theme/FPS capabilities, exact target scene adapters, ordered script/direction coverage, approved durations, direction timing/beats, approved prop/copy projections, and exact approved voice/sound structures. The model receives immutable serialized inputs and only one terminating config tool. Any missing or invalid first output receives one repair prompt containing the exact parent error; a second failure terminates.

`ConfigSpecialistResult` returns production config data, its canonical SHA-256 hash, and separate versioned lineage metadata. Persistence, rendering, publication, checkpoint decisions, and session/coordinator integration remain outside this foundation.

## Consequences

- A schema-valid but wrong-target or creatively divergent config cannot pass parent validation.
- Stale or modified previous configs are rejected before a specialist session starts.
- Render configs remain unchanged and free of orchestration-only metadata.
- Parent persistence must atomically associate the returned hash and lineage with the future config artifact.
- TypeScript prop-contract references remain registry-owned; runtime render schemas and approved `propsPlan` projections are the executable validation boundary until every custom adapter exposes a machine-readable runtime prop schema.
