# Live novel-scene frontend E2E

## Status

Blocked pending the Visual Program harness readiness gates. The free-form TSX experiment is closed; no source candidate was promoted and no production write occurred.

## Goal

Prove that a user can request a visually demanding silent video through the web UI, let the Pi pipeline identify an honest catalog capability gap, compile and verify a reusable bounded Visual Recipe, review and explicitly adopt it, then complete fresh visual QA, rendering, final review, and publication without manual artifact or JSON edits.

## Approved production brief

- Subject: containing cascading failures in connected systems.
- Audience: general professional LinkedIn audience.
- Language: Spanish.
- Format: educational landscape video.
- Composition: the explicitly selected registered landscape tutorial target.
- Dimensions and rate: 1280x720 at 30 fps.
- Theme: Betelgeuse.
- Audio: no narration, music, or sound effects.
- Research: skip; the script uses a conceptual demonstration and makes no time-sensitive quantitative claims.
- Core visual acceptance criterion: show a branching network whose nodes change state over time as a failure propagates, then show an intervention isolating a bridge and stopping that propagation. Static lists, a linear flow diagram, or a textual before/after do not satisfy this criterion.

## Approved escaleta

1. **Hook — 4 seconds**
   - Copy: “Un fallo casi nunca destruye un sistema por sí solo.”
   - Purpose: introduce propagation rather than isolated failure.
2. **La primera caída — 10 seconds**
   - A stable branching network receives one initial failure and propagation starts through multiple branches.
3. **El efecto dominó — 9 seconds**
   - Propagation accelerates; nodes visibly transition through healthy, compromised, and failed states according to deterministic timing.
4. **Introduce un cortafuegos — 11 seconds**
   - The simulation repeats, but a bridge node is isolated immediately before impact and propagation stops at that boundary.
5. **Mismo fallo, distinto diseño — 10 seconds**
   - Two synchronized simulations compare an uncontained network with a resilient network. This must be a behavioral comparison, not a static list.
6. **Closing — 6 seconds**
   - Copy: “No diseñes para evitar todos los fallos. Diseña para contenerlos.”

## Authority and safety boundaries

- The browser is the operator surface. The run starts with a normal web chat request and every human decision is submitted through the web UI.
- SQLite/API inspection may diagnose exact hashes, lineage, journal generations, and restart state, but may not create or approve production artifacts directly.
- The copywriter and director may propose; the parent validates and persists.
- The scene composer must first analyze the exact catalog. It may reuse an existing component only if that component satisfies every behavioral acceptance criterion.
- CP4 approves only the capability proposal. It does not authorize executable source generation or promotion.
- Normal `new_video` does not generate, execute, promote, or write TSX. Existing executable Tier 2 modules remain isolated for legacy recovery only.
- A typed Visual Recipe specialist may propose inert bounded data after CP4. The deterministic parent compiler validates budgets, references, timing, synchronization, bindings, and behavioral assertions.
- A separate adoption checkpoint must expose the exact recipe/compiler/renderer/target digests and ordered multi-frame behavioral evidence.
- Adoption requires a distinct explicit human decision bound to exact checkpoint, thread revision, recipe version, plan, and evidence digests.
- Only the parent may append target-scoped recipe activation. Adoption is one SQLite transaction and performs no source or registry write.
- After adoption, the pipeline must regenerate the target capability snapshot before configuration and must not reuse stale config, stills, QA, validation, render, or review evidence.
- No voice or paid API generation is allowed in this run.

## Functional acceptance criteria

- [ ] The run is initiated through the current Pi web frontend.
- [ ] CP1 presents the full six-scene script and is approved through the frontend.
- [ ] CP2 presents direction bound to the approved script and is approved through the frontend.
- [ ] At least one core scene is classified as a real capability gap against the exact current catalog.
- [ ] CP4 presents the generic capability proposal and is approved through the frontend.
- [ ] Visual Recipe generation emits only strict inert data and cannot write to production paths.
- [ ] Deterministic schema, budget, canonical compilation, assertion, and multi-frame behavioral verification pass against one authenticated recipe version.
- [ ] A separate recipe adoption checkpoint is visible and actionable in the frontend.
- [ ] Rejecting adoption leaves activation state and production source unchanged.
- [ ] Approving adoption performs one durable parent-owned SQLite transaction and records immutable target-scoped activation.
- [ ] The adopted recipe appears exactly once in the regenerated target capability snapshot.
- [ ] Config generation embeds exact compiled Visual Program props and approved script/direction/audio contracts.
- [ ] Parent-rendered stills and multimodal Scene QA evaluate the new visual behavior.
- [ ] Any QA rejection follows the existing direction-revision cycle instead of manual edits.
- [ ] The final H.264 MP4 passes deterministic review and explicit final approval.
- [ ] Publication writes an exact SHA-256-verified artifact set.
- [ ] Restarting at the adoption or post-adoption boundary resumes from durable state without duplicate activation or stale evidence reuse.

## Test cases

1. Existing catalog cannot silently downgrade the branching timed-state requirement to a generic callout, list, or static flow.
2. CP4 approval cannot be replayed as recipe adoption approval.
3. Recipe, compiler, renderer, target capability, verifier evidence, and adoption-plan digest mismatches are rejected.
4. Visual Program data with executable fields, unknown keys, dangling references, invalid timing, excessive budgets, or unsupported operations is rejected before rendering.
5. Concurrent adoption requests create at most one target-scoped activation.
6. Restart after behavioral verification re-presents or preserves the exact adoption checkpoint.
7. Restart after adoption recognizes exact immutable activation and does not activate again.
8. Config and QA lineage created before adoption cannot satisfy post-adoption prerequisites.
9. The frontend error/retry path cannot bypass CP4 or adoption approval.
10. Final published evidence identifies the recipe/program/compiler/renderer digests and exact render review.

## Completion evidence

- Browser-visible checkpoint sequence and decisions.
- Thread id and completed canonical plan snapshot.
- Recipe, compiled program, compiler, renderer, behavioral evidence, target capability, and adoption-plan digests without secret values.
- Before/after source integrity manifests proving adoption caused no source deletion or mutation.
- Scene stills, QA report, final MP4 metadata, render review, and publication hashes.
- Passing agent-pi, scene-contract, render-service, root lint/typecheck, and web production-build gates.
