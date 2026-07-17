---
name: ponytail-video-production
description: Apply Ponytail's stop-at-first-rung philosophy when planning, generating, revising, QAing, rendering, or publishing Claqueta videos. Use for any video-production workflow decision, especially when deciding whether a specialist, checkpoint, artifact regeneration, QA pass, asset, or renderer change is necessary.
---

# Ponytail video production

Trace the approved intent and current artifacts before proposing work. Then stop at the first rung that holds:

1. Does this video, scene, asset, checkpoint, render, or revision need to exist?
2. Does an approved current artifact already satisfy it?
3. Does a registered scene, active recipe, local asset, or deterministic parent rule cover it?
4. Is creative judgment genuinely unresolved? Invoke only its owner.
5. What is the smallest evidence that can detect the relevant failure?
6. Has the human-approved quality bar passed? Stop.
7. Only then evolve a renderer/capability through normal engineering review.

## Procedure

- Derive the shortest route from approved state; do not execute every canonical branch by habit.
- Reuse exact artifacts when the relevant content hash is unchanged.
- Skip model calls for explicit deterministic choices such as no research or no audio.
- Ask humans only about creative or irreversible authority, not deterministic normalization.
- Render one representative still for ordinary scenes and event boundaries only for temporal behavior.
- Rerun visual QA only after a pixel-relevant input changes.
- On failure, classify it once: creative revision, invalid specialist output, trusted renderer bug, or external side effect. Repair the shared root cause; do not restart the entire pipeline.
- One bounded model repair is enough. A second contract failure becomes human or engineering work.
- Do not chase a higher score after the approved acceptance bar passes without a new request.

Never simplify away validation at trust boundaries, security, accessibility, data-loss prevention, exact external-effect reconciliation, CP4 versus reusable-recipe adoption authority, final human review, or publication integrity.

For implementation changes, add no workflow table, scheduler, lease, action, dependency, or abstraction unless a concrete production failure cannot be represented by existing plans, artifacts, journal, checkpoints, and revisions.

Report the route as: `reuse/skip → deterministic work → required specialist judgment → minimum evidence → human authority → side effect`.
