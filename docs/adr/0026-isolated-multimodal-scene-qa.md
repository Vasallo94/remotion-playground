# 0026. Run visual Scene QA as an isolated multimodal Pi specialist

## Status

Accepted

## Context

Claqueta can render a representative still for every scene before final rendering. Visual QA requires contextual judgment over pixels, approved narrative intent, direction, narration, and neighboring scenes. The legacy implementation invokes a separate multimodal model once per scene and may route minor findings into automatic config fixes. That approach is expensive, loses whole-video consistency, and lets a reviewer indirectly trigger unapproved creative changes.

## Decision Drivers

- Ground every visual finding in an actual rendered image.
- Keep evaluation independent from generation context.
- Preserve whole-video narrative and visual consistency.
- Make prompts topic-neutral and avoid assumptions tied to scene or subject categories.
- Treat render-service paths as untrusted input.
- Keep all artifact mutation and human checkpoints in the parent.
- Never auto-apply creative QA suggestions.

## Considered Options

### Option 1 — Port one external model call per scene

- Pros: simple scene-local prompts.
- Cons: repeated setup/cost, inconsistent standards, no holistic comparison, and provider-specific code.

### Option 2 — Let the parent coordinator inspect images

- Pros: fewer runtime components.
- Cons: pollutes coordinator context and weakens role isolation.

### Option 3 — One isolated multimodal Pi session with ordered stills and complete context

- Pros: fresh context, whole-video consistency, Pi-native lifecycle/telemetry, one structured report, and narrow authority.
- Cons: model/image limits constrain very large videos; batching may be needed later.

## Decision

Choose Option 3 for the current video sizes.

The parent requests scene stills from the render service, validates complete unique indexes, resolves every PNG beneath the local render-service jobs root, enforces per-image and aggregate byte limits, and attaches ordered images to a fresh Pi session. The specialist receives the approved artifacts and exact config, and terminates through `submit_scene_qa_report`.

The specialist evaluates legibility, clipping, hierarchy, visual evidence, narration complementarity, continuity, accessibility, and misleading or unsupported presentation. It cannot read files, render, mutate config, or approve outcomes.

The parent validates exact scene coverage, persists the report, and owns QA decisions. Any `MINOR_FIX` or `MAJOR_ISSUE` is presented to the human. Accepted changes start a separate direction/config revision; no QA suggestion is auto-applied.

## Consequences

- Visual findings are image-grounded and replayable as artifacts/events.
- The coordinator remains small and topic-neutral.
- Minor fixes require human judgment instead of silent mutation.
- Render-service path validation becomes a security boundary.
- Videos exceeding model image limits will require deterministic batching in a later slice.
