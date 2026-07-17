# ADR 0052: Short-circuit explicit silence in video production

- Status: Accepted
- Date: 2026-07-12

## Context

The real browser-operated cascade explicitly requested no voice, music, or sound effects. The approved brief already represented all three preferences as `none`, but the canonical flow still:

1. invoked Audio Planner;
2. presented CP3 to approve silence again;
3. generated a final config whose only difference from the QA-approved draft was `soundDesign: null` becoming `{ enabled: false, musicBed: null, sfx: [] }`;
4. rendered the same ordered stills;
5. called multimodal Scene QA again; and
6. requested another human QA approval.

This work changed no creative judgment and no pixels. The pipeline completed safely, but it violated the Ponytail rule to stop at the first rung that already satisfies approved intent.

## Decision drivers

- Remove model calls and checkpoints that resolve no uncertainty.
- Reuse current artifacts when their production meaning is unchanged.
- Preserve validation, action-journal atomicity, final review, and publication integrity.
- Avoid a general visual-hash subsystem until more than one concrete case requires it.
- Leave every non-silent audio path unchanged.

## Considered options

### Always run Audio Planner and CP3

Rejected for explicit silence. It asks a model and human to restate a complete user decision.

### Add a general pixel-equivalence lineage layer

Rejected for now. It would add another identity contract and migration surface to solve one observed normalization mismatch.

### Normalize the explicit silent case in the existing action

Chosen. The existing `run_audio_planner` action remains the journaled transition, but its effect becomes deterministic when every approved audio preference is `none`.

## Decision

When approved audio preferences explicitly set voiceover, music, and sound effects to `none`, the parent:

- creates the existing valid silent `AudioChart` without a specialist session;
- persists it already approved in the existing artifact store;
- completes the existing `audio_plan` step atomically with the action;
- presents no audio checkpoint; and
- records `deterministic_silence` in the action outcome/effect metadata.

Coordinator audio matching treats absent/null config sound design as equivalent to an approved disabled chart only when the chart has `enabled: false`, no music bed, and no SFX. The current draft config and QA therefore remain current. Production continues directly through skipped silent assets, final validation, render, final review, and publication.

Optional or required audio still invokes Audio Planner and CP3. No action, table, step, worker, scheduler, lease, dependency, or persisted view is added.

## Consequences

### Positive

- One fewer model call and human checkpoint for explicit silence.
- No semantically redundant final config.
- No duplicate still render, multimodal QA call, or QA approval.
- Existing plan, journal, restart, validation, render, and publication contracts remain intact.
- The implementation is a small branch plus semantic normalization at the shared coordinator comparison.

### Negative

- The 13-step plan still contains `audio_plan`; it completes deterministically rather than disappearing.
- Disabled sound design and absent sound design are equivalent only for the exact empty shape; broader audio equivalence remains intentionally unsupported.
- General QA reuse across other non-visual config changes remains deferred.

## Validation

Parent integration keeps optional audio on the specialist/CP3 path. The Pi-only silent E2E asserts zero Audio Planner calls, one approved silent chart, no audio decision/checkpoint, a completed audio-plan step, no post-audio config or QA version, and successful final publication through the existing authority boundaries.
