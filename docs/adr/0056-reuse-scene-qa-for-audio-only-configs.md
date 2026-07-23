# ADR 0056: Reuse approved Scene QA for audio-only config changes

- Status: Accepted
- Date: 2026-07-23

## Context

CP3 adds approved voice and sound data to a config whose visuals have already passed Scene QA. Binding QA freshness to the complete config hash caused unchanged long videos to resend every still to Vertex; a live 22-scene production failed twice without structured output.

## Decision

Scene QA freshness may be carried forward only when a parent-owned deterministic visual projection is identical. The projection removes top-level `voiceover` and `soundDesign` and per-scene `voiceover`; every other field remains hash-significant. Reuse copies the approved report into a new artifact and creates fresh lineage to the exact final config.

## Options considered

### Always rerun multimodal QA

Rejected: repeats cost and can fail solely because approved audio was attached.

### Ignore all config version changes

Rejected: could publish visual changes without inspection.

### Compare a narrow visual projection

Chosen: avoids duplicate work without weakening visual-change detection.

## Consequences

Audio-only finalization becomes deterministic and cheap. Adding a new audio field that affects rendering must also update the projection rules and tests; unknown fields remain visual by default.

## Validation

Tests prove audio-only reuse, fresh lineage, and forced QA whenever any retained config field changes.
