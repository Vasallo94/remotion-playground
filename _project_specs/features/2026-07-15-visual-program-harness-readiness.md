# Visual Program harness readiness

## Status

Approved architecture; implementation pending

## Goal

Replace model-authored executable scene generation in normal `new_video` production with a bounded, deterministic Visual Program contract, while making human decisions and frontend recovery authoritative enough to rerun the live novel-scene E2E safely.

## Scope

This feature delivers four independently shippable slices:

1. Freeze normal TSX generation/promotion and require exact checkpoint decisions.
2. Introduce a revisioned server-authoritative thread view and lossless SSE/frontend reconciliation.
3. Add Visual Program v1 contracts, compiler, trusted renderer, and behavioral evidence fixtures.
4. Add immutable target-scoped Visual Recipe proposal, verification, adoption, freshness, and publication lineage.

The first implementation increment may complete only the Visual Program foundation, but no live E2E may resume until every readiness gate below passes.

## Architecture contract

### Normal scene paths

- `ComposedScene` remains the static semantic layout DSL.
- `VisualProgramScene` is one trusted, statically registered renderer for bounded temporal and relational behavior.
- A one-video Visual Program instance requires no capability-adoption checkpoint.
- A reusable Visual Recipe is immutable data over the same IR with a closed binding schema.
- CP4 approves the generic reusable capability contract only.
- Recipe adoption is a distinct human decision bound to exact compiled evidence.

### Exceptional code evolution

- Normal `new_video` must not generate, execute, promote, or write TSX.
- New IR opcodes, renderer primitives, target adapters, dependencies, or executable components use conventional repository development and review.
- Existing Tier 2 source policy, quarantine, promotion journal, and rollback remain frozen for legacy recovery and exceptional evidence only.
- No ordinary coordinator action may construct `ExecutableSceneCandidateRunner` or invoke source promotion.

### Visual Program v1 ceiling

- Versioned strict JSON-like data with no executable fields, expressions, callbacks, imports, URLs, arbitrary styles, or dynamic property access.
- At most two synchronized panels.
- Bounded nodes, edges, events, labels, text, duration, and normalized coordinates.
- Semantic node/edge states and timestamped precomputed state changes, pulses, isolation, and boundaries.
- No graph traversal or simulation at render time.
- Deterministic layout fallback and target-owned semantic theme tokens.
- Behavioral assertions at initial, event-boundary, intervention, and terminal times.

## Human authority

- CP1 approves the exact script.
- CP2 approves direction bound to the CP1 script.
- Scene resolution then determines reuse, composed data, direct Visual Program, or reusable recipe gap.
- CP4 approves only the reusable capability contract.
- Recipe adoption separately approves the exact recipe/version/digest, compiler/renderer versions, evidence digest, adoption-plan digest, checkpoint identity, and expected thread revision.
- Missing, stale, replayed, cross-thread, wrong-kind, wrong-version, or wrong-digest decisions cause zero mutation.
- The parent may not manufacture a digest-bound approval from a generic boolean.

## Frontend authority

The backend exposes a revisioned `ThreadView` containing:

- monotonic per-thread revision;
- last event sequence;
- persisted status (`running`, `waiting`, `idle`, `error`, `done`);
- active operation/action identity;
- exact active checkpoint or `null`;
- plan and current artifact references;
- render result and last error.

The browser:

- applies only newer revisions;
- clears checkpoints when authoritative state contains none;
- derives loading from persisted operation status;
- resets transient state on thread change;
- never lets caller payload overwrite bound checkpoint identity;
- does not infer render jobs from assistant prose.

SSE must subscribe and buffer before replay, replay to a captured high-water mark, then flush buffered events in order without loss or duplication.

## Lineage and adoption

- Visual Program compilation is canonical for the tuple of program, bindings, target adapter, schema version, compiler version, and renderer version.
- Recipes and activation records are append-only and content-addressed.
- Adoption is target-scoped.
- Activation atomically records the decision, activates one immutable recipe version, revises the script, regenerates the target capability snapshot, consumes the checkpoint, and completes the action.
- Deactivation creates a new record; it never deletes historical recipes.
- The active-recipe-set digest participates in target, config, QA, validation, render, review, and publication lineage.
- Pre-adoption evidence cannot satisfy post-adoption prerequisites.

## Acceptance criteria

### Slice 1 — authority freeze

- [x] No normal coordinator snapshot derives `generate_scene_candidate` or `promote_scene_candidate`.
- [x] CP4 cannot instantiate executable candidate generation.
- [x] Existing candidate promotion recovery tests remain passing while normal derivation is frozen.
- [ ] Checkpoint decisions are exact, CAS-bound, and atomic with checkpoint consumption and plan effects.
- [ ] Checkpoint resume advances deterministically without a pseudo-chat message.

### Slice 2 — transport and frontend

Minimal race gate implemented before the full ThreadView projection: snapshots carry the existing thread revision, authoritative `checkpoint: null` clears the card, stale snapshot/SSE authority cannot regress state, thread and local-action generations fence delayed callbacks, and checkpoint identity fields override component payloads. The remaining criteria below stay open until browser lifecycle evidence covers complete projection/reload behavior.

- [ ] Thread snapshots include revision, cursor, durable status, operation identity, and exact checkpoint state.
- [ ] Replay/live handoff cannot lose events.
- [ ] Duplicate, stale, and out-of-order events cannot regress browser state.
- [ ] Reload and reconnect reconstruct checkpoints, messages, progress, and render result.
- [ ] Stale `Processing` state and phantom checkpoints are impossible under the tested race matrix.
- [ ] Render results come from authoritative artifacts/state, not UUID regex extraction.

### Slice 3 — Visual Program foundation

- [x] Strict contracts reject unknown keys, dangling references, invalid timing, excessive budgets, unsafe values, target leakage, and unsupported operations.
- [x] Canonical compilation produces identical props and digest for identical inputs and versions.
- [x] One trusted renderer is statically registered but reserved from model-authored catalog reuse.
- [x] A hand-authored topic-neutral cascade fixture demonstrates propagation, bridge isolation, stopped propagation, and synchronized contained/uncontained comparison.
- [x] Real rendered evidence frames cover initial state and meaningful event/intervention boundaries.
- [x] Existing `ComposedScene` behavior and configs remain unchanged.

### Slice 4 — recipe workflow

The immutable data foundation now reuses existing artifacts for compiled recipes, deterministic boundary evidence, and target-scoped active sets. Specialist proposal and human adoption remain open below.

- [ ] The specialist emits exactly one typed recipe proposal, with at most one schema-repair turn.
- [ ] CP4 and adoption approvals cannot substitute for one another.
- [ ] Rejection activates nothing and changes no production source.
- [ ] Approval activates exactly once across duplicate requests and restart.
- [ ] Parent config projection injects exact compiled props that the configurator cannot rewrite.
- [ ] Fresh QA evaluates ordered multi-frame evidence.
- [ ] Publication stages and hash-verifies an exact manifest containing visual capability lineage.
- [ ] Normal production performs no TSX or registry source write.

## Test cases

1. Fuzz checkpoint identity, artifact identity/version, thread, revision, kind, approval, and digests; every mismatch is mutation-free.
2. Inject a failure at each checkpoint transaction statement and observe either the complete prior or complete next state.
3. Insert an event between replay query and live subscription; the client receives it exactly once.
4. Hydrate an older snapshot after a newer SSE event; state does not regress.
5. Reload threads in every durable status; loading and checkpoint state match the snapshot.
6. Switch threads with requests in flight; no state crosses thread identity.
7. Reject malformed programs, duplicate IDs, dangling edges, unordered events, impossible assertions, excessive text/counts, and non-finite coordinates.
8. Compile semantically equivalent canonical inputs repeatedly and compare digests.
9. Render event-boundary frames for the cascade fixture and verify expected semantic states.
10. Reject CP4-shaped recipe adoption and generic boolean approval.
11. Submit concurrent duplicate adoption decisions and observe one activation.
12. Restart before and after activation; derive the same next action without reactivation.
13. Prove pre-adoption config, QA, validation, render, and review artifacts are stale.
14. Repository search and coordinator tests prove normal `new_video` cannot reach executable candidate modules.
15. Browser-operated mocked lifecycle passes before the silent/no-API live E2E.

## Readiness gate for the live E2E

The live novel-scene E2E remains blocked until:

- all four slices pass unit, contract, crash-window, frontend reducer, browser, and integrity tests;
- the cascade fixture passes deterministic multi-frame visual evidence;
- a mocked browser lifecycle covers CP1, CP2, CP4, recipe adoption rejection/approval, reload, restart, fresh QA, final review, and publication;
- no source-generation or source-promotion action is reachable from normal production;
- silent/no-API mode makes no paid provider call.

## Non-goals

- Full replacement of `ConfigSpecialistRunner` in this feature.
- Broad decomposition of `session.ts` before the authority boundaries pass.
- RPC migration.
- Runtime creation of new renderer primitives or dependencies.
- Relaxation of existing candidate source policy.
- LangGraph removal before its evidence gate.
