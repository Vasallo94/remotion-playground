# 0031. Isolate typed production intake from pipeline orchestration

## Status

Accepted

## Context

The deterministic Pi coordinator needs an explicit production brief before it can select downstream work. The existing `CreativeBrief` type contains a small set of optional strings and cannot distinguish a value supplied by the requester from an intentionally absent value or an unresolved question. A free-form intake turn could also silently introduce language, format, target, or research defaults.

This slice must establish the contract and specialist boundary without coupling the coordinator or main session to the new intake flow.

## Decision drivers

- Preserve explicit user intent and unresolved information through persistence and restart.
- Make required and optional inputs distinguishable without role-level defaults.
- Keep research decisions grounded in explicit research inputs and reject conflicting evidence declarations.
- Give the specialist one terminating structured-output tool and no production capabilities.
- Allow the parent one deterministic repair turn while retaining unresolved fields for human questions.
- Avoid integrating orchestration work from the later coordinator phases.

## Considered options

### Option 1 — Extend `CreativeBrief` with nullable fields

- Pros: small type diff and easy compatibility with existing tools.
- Cons: `null` cannot distinguish an explicit absence from a missing or ambiguous value, and it does not provide focused questions or a strict artifact boundary.

### Option 2 — Let the main session extract a brief through existing tools

- Pros: no child session or new runner.
- Cons: grants the main model workflow authority, makes repair and validation non-deterministic, and mixes intake with production tools.

### Option 3 — Add a standalone typed intake contract and isolated runner

- Pros: explicit state transitions, strict parent validation, bounded model authority, persistence-compatible artifacts, and focused integration points.
- Cons: introduces a parallel contract until the coordinator adopts it, and requires a later adapter from the new brief to legacy inputs.

## Decision

Choose Option 3.

`ProductionBrief` uses discriminated input states: `provided`, `explicitly_absent`, and `unresolved`. Required fields exclude explicit absence at the TypeScript boundary and are checked again by runtime validation. The terminating tool accepts only a `ProductionBriefCandidate`; the parent uses `buildProductionBriefArtifact` to add schema metadata, the research decision, and the exact unresolved-field list.

`ProductionBriefIntakeRunner` creates an in-memory Pi session with only `submit_production_brief`. The parent validates the returned candidate, performs at most one repair prompt containing the exact validation errors, and returns unresolved required fields as structured questions instead of filling them. Research is derived deterministically from `researchRequirement` and `researchRationale`; `evidence.externalVerification` is used only as a consistency check.

The runner is exported for a future coordinator integration, but neither `session.ts` nor `coordinator.ts` invokes it in this slice.

## Consequences

- Downstream integration can persist and recover a versioned `production_brief` artifact through `AgentPiStore` without changing the store schema.
- Human-facing intake can ask precise questions from `ProductionBriefValidation.questions`.
- Missing input remains visible and cannot be mistaken for a role default.
- The existing `CreativeBrief` and coordinator flow remain unchanged until a separate integration slice supplies an adapter and transition tests.
- The detailed candidate TypeBox schema is exposed by the intake module, while the parent validator and builder remain the authoritative strictness boundary.
