# ADR 0051: Harden strict specialist contracts and trusted renderer output

- Status: Accepted
- Date: 2026-07-17

## Context

The first real browser-operated Visual Recipe cascade run failed closed at boundaries that mocked lifecycle tests did not exercise:

- Scene Composer copied a scene wrapper into the exact composed-spec field.
- Visual Recipe Composer saw only a high-level contract summary and copied aliases from the conceptual CP4 proposal instead of the strict recipe schema.
- A detached checkpoint continuation could leave the thread in `running` after an action failure.
- Direction revision changed the script adapter when human feedback described the parent-projected renderer.
- Valid normalized node positions produced overlapping cards, hidden direction cues, foreground boundary decoration, and visible theme/signature text despite a no-watermark brief.

The action journal, thread revision kernel, immutable recipes, checkpoints, and parent projection all behaved correctly: invalid output produced no partial adoption, stale evidence was rejected, and exact retry resumed the same action. The observed failures therefore do not justify another scheduler, lease system, workflow table, or mutable renderer registry.

## Decision drivers

- Preserve fail-closed strict validation.
- Make model-facing tool schemas match parent validators exactly.
- Keep repair bounded to one turn.
- Treat the trusted renderer as conventional reviewed code, never model-authored production source.
- Make `watermark: false` consistently mean no decorative label, signature, or overlay watermark.
- Reuse existing retry, revision, checkpoint, and artifact primitives.

## Considered options

### Relax parent validation

Rejected. Accepting wrapper aliases or generic CP4 fields would weaken canonical recipe identity and could silently adopt behavior different from the approved contract.

### Add a general retry or advancement subsystem

Rejected. Existing exact failed-action retry and persisted state recovered every observed failure. The only missing behavior was reporting an asynchronous continuation failure to the existing thread state.

### Align schemas, add bounded repair, and harden the trusted renderer

Chosen. The specialist receives an exact closed tool schema and compact authoring guide, while deterministic renderer code owns collision avoidance, edge direction, layer ordering, and branding suppression.

## Decision

1. Scene Composer explicitly distinguishes an exact `{ version: 1, root }` composed spec from a capability gap requiring timed state changes.
2. Visual Recipe submission uses a duration-bound TypeBox schema that names every allowed field, state, operation, and limit. The prompt marks CP4 `propsShape` as conceptual only. Parent validation still performs the canonical semantic checks and permits one concise full-template repair.
3. Detached checkpoint failures update the existing thread status to `error` and publish one recoverable error event. Exact retry remains the only authority to rerun a failed action.
4. Direction validation permits one repair turn and requires exact preservation of scene IDs, types, component IDs, duration, and order even when feedback describes a parent-projected renderer.
5. The trusted Visual Program renderer derives a bounded card width from neighboring normalized positions, trims edges to card boundaries, renders arrowheads, suppresses edge labels that cannot fit, and layers boundaries behind cards.
6. At composition scope, `watermark: false` suppresses theme labels and signature overlays in addition to the existing logo watermark. Lineage remains in immutable artifacts and publication receipts rather than visible pixels.

## Consequences

### Positive

- Invalid model output remains mutation-free and recoverable.
- The exact recipe contract is visible through both prompt and terminating tool schema.
- No new workflow subsystem or persistence surface is introduced.
- Valid programs remain deterministic while producing legible 1280×720 evidence.
- No-branding briefs have one consistent renderer control.
- The real run can preserve the same adopted recipe digest through revised rendering and fresh QA.

### Negative

- The TypeBox authoring schema duplicates part of the runtime contract shape and must evolve with a future recipe version.
- Adaptive card sizing can wrap long node labels; multimodal QA remains required.
- `watermark: false` now suppresses all decorative composition labels, which is broader than the previous logo-only interpretation.
- Editorial script metadata may still name the pre-projection adapter; direction repair must preserve that immutable adapter while describing the adopted renderer accurately.

## Validation

The live thread recovered through browser retry, adopted one immutable recipe, survived a parent restart, rejected two real QA passes, approved fresh direction and QA, rendered an H.264 1280×720/30 fps MP4, passed final review, and published hash-verified artifacts. The same active-set digest appears in config, QA lineage, validation, render, review, and publication.

Automated validation covers 260 Agent Pi tests, 28 scene-contract tests, 12 render-service tests, 3 web authority tests, the Visual Program renderer tests, Agent Pi and root typechecks, root lint, and the web production build.
