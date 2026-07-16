# Claqueta Pi Agent Completion Plan

## Objective

Finish the Pi-native agent so that models contribute bounded creative judgment while the parent runtime deterministically owns workflow order, validation, persistence, checkpoints, side effects, executable capability expansion, recovery, and publication. Remove LangGraph only after operational parity is demonstrated.

## Non-negotiable principles

1. Agent roles remain topic-neutral. Subject, brand, audience, language, platform, format, dimensions, target composition, theme, evidence, assets, and constraints are explicit inputs.
2. Prompts never contain editorial defaults, composition identities, target-specific dimensions, topic recipes, or implicit language defaults.
3. Models return narrow structured proposals through terminating tools. They do not select pipeline transitions or perform production side effects.
4. The parent validates every specialist result and allows at most one exact repair turn.
5. Human approval is required before creative acceptance, paid/API generation, executable capability expansion, and final publication.
6. Declarative scene composition is the default. Generated source is exceptional and must remain quarantined until separately approved.
7. No destructive workspace command is allowed during this plan. Watchers remain disabled until the deletion incident is understood.

## Supervised swarm model allocation

- Use only Sol and Luna for new subagent waves.
- Use Sol/high for architecture, security boundaries, policy, and cross-cutting contracts.
- Use Luna/high for bounded implementation, deterministic infrastructure, test matrices, and verification.
- Do not launch new Terra agents; its observed intelligence/cost ratio is not justified for this migration.
- Launch future terminal agents through `/tmp/run-claqueta-agent-notify.sh` so completion/failure sends a cmux notification, flash, and feed log to the supervising Pi terminal (`workspace:2`, `surface:2`). Never inject text/keystrokes into the supervisor prompt.

## Execution protocol

For every phase:

1. Re-read `task_plan.md`, this plan, and the relevant feature spec.
2. Capture a worktree integrity manifest before execution.
3. Update or add acceptance criteria in `_project_specs/features/2026-07-03-pi-deepagents-parity.md` before code.
4. Implement one bounded work package.
5. Run targeted tests first, then package and root quality gates.
6. Compare the post-execution integrity manifest. Stop immediately on unrelated deletion or mutation.
7. Update `progress.md`, `findings.md`, and `CHANGELOG.md`.
8. Create or update an ADR for every new architectural decision.
9. Commit one atomic logical change only after human review of the current recovery-sensitive diff. Never push unless explicitly requested.

## Phase 0 — Workspace integrity and recoverable baseline

### Tasks

- [ ] Keep all Claqueta watchers and development services stopped.
- [ ] Inventory every modified and untracked implementation file and compare it with the Pi session recovery log.
- [ ] Add a non-destructive integrity command that records tracked status plus hashes for source/spec/config files while excluding generated output and dependencies.
- [ ] Add explicit guards to test cleanup helpers so recursive deletion is accepted only beneath a freshly created OS temporary directory or a single allowlisted generated fixture path.
- [ ] Run the complete existing test/build suite without watchers and compare integrity manifests.
- [ ] Review the full diff with Enrique and create a local Git checkpoint commit or another explicitly approved durable checkpoint.

### Exit criteria

- No unexplained tracked deletions.
- No missing recovered implementation files.
- Repeated tests leave the integrity manifest unchanged except for known generated outputs.
- A durable reviewed baseline exists before further migration work.

## Phase 1 — Typed, neutral production intake

### Tasks

- [ ] Add a strict `ProductionBrief` contract and `production_brief` artifact.
- [ ] Represent subject, objective, audience, language, platform, format, dimensions/aspect ratio, duration, brand, tone, evidence, assets, constraints, audio preferences, target requirements, and acceptance criteria as explicit nullable/required fields.
- [ ] Add an isolated intake specialist with one terminating structured-output tool and no filesystem, shell, network, or production tools.
- [ ] Validate missing/ambiguous required inputs in the parent. Ask focused human questions rather than applying role-level defaults.
- [ ] Derive `researchRequired` and its rationale from supplied factual requirements; retain parent validation and explicit skip state.
- [ ] Persist intake revisions and recover them after restart.
- [ ] Add neutrality tests covering the main prompt and every specialist prompt.

### Exit criteria

- No downstream specialist runs without a valid brief.
- No prompt contains composition names, dimensions, themes, languages, platforms, or topic-to-template recipes as defaults.
- Missing required information produces a recoverable question, not an inferred value.

## Phase 2 — Abstract target contracts

### Tasks

- [ ] Define a parent-owned `TargetContract` that describes available compositions, formats, dimensions, themes, scene schemas, prop contracts, rendering defaults, and publication destination without embedding those choices in role prompts.
- [ ] Replace editorially named catalog groupings exposed to specialists with neutral target identifiers.
- [ ] Resolve the target contract from the approved production brief and registered runtime capabilities.
- [ ] Pass only the selected contract and approved artifacts to copywriting, direction, composition, config, QA, and validation specialists.
- [ ] Add schema/version compatibility checks for persisted briefs/configs across restart.

### Exit criteria

- The same specialist prompt can operate against different registered target contracts.
- Target selection is explicit, persisted, and parent-validated.
- Existing technical composition identifiers may remain internal adapters but never define agent identity or editorial behavior.

## Phase 3 — Direct deterministic pipeline executor

### Tasks

- [ ] Replace the current coordinator repair prompts with direct parent action handlers.
- [ ] Define immutable transition tables for `new_video`, `revise_existing`, `render_only`, `recover_failed_render`, `audit_only`, `variant`, `asset_regeneration`, and `question`.
- [ ] Make each handler declare prerequisites, accepted artifact versions, side effects, next states, and idempotency keys.
- [ ] Invoke specialist runners and deterministic tools directly from the parent; do not ask the main model to remember or execute tool order.
- [ ] Restrict the conversational model to mode/intake interpretation, focused questions, and human-facing explanations.
- [ ] Reject invalid transitions, stale artifact versions, duplicate side effects, unknown steps, and attempts to bypass checkpoints.
- [ ] Persist transition attempts/results so interrupted actions can be resumed safely.

### Exit criteria

- Given the same persisted snapshot, `deriveNextAction()` always returns the same action.
- The main model cannot create drafts, mutate plan state, render, publish, or choose the next pipeline step.
- Every mode has transition-table unit tests, rejection tests, and idempotency tests.

## Phase 4 — Isolated target-contract configurator

### Tasks

- [ ] Finish the abstract config specialist started in `configSpecialist.ts`.
- [ ] Supply approved brief, target contract, script, direction, optional audio chart, and previous config as immutable inputs.
- [ ] Require one terminating structured config output.
- [ ] Validate with the target render-service schema and exact scene prop contracts.
- [ ] Permit one parent-error repair turn, then fail explicitly.
- [ ] Preserve approved creative artifacts during final audio-bearing regeneration.
- [ ] Remove `generate_remotion_config` and any free-form config synthesis from main-model authority.

### Exit criteria

- Config generation is isolated, target-neutral, schema-valid, and reproducible from persisted inputs.
- Invalid or creatively divergent configs never become current artifacts.

## Phase 5 — Checkpoint, rejection, and restart recovery matrix

### Tasks

- [ ] Add integration fixtures for CP1 script, CP2 direction, Scene QA findings, CP3 audio, CP4 capability expansion, and final review.
- [ ] Test approve, reject, revise, repeated decision, stale decision, and malformed decision paths.
- [ ] Restart the runtime after every persisted state and confirm the same next action is derived.
- [ ] Reconnect SSE with `Last-Event-ID` and verify no missing/duplicated state transitions.
- [ ] Simulate interruption during research, specialist execution, audio production, render submission, review, and publication.
- [ ] Verify paid/API and publication side effects remain exactly-once.

### Exit criteria

- The full transition/recovery matrix passes deterministically without a live model.
- Checkpoints cannot be skipped and resumed work does not duplicate side effects.

## Phase 6 — Tier 2 executable scene quarantine

### Tasks

- [ ] Define a strict candidate manifest: capability proposal id, source files, target registry changes, dependencies, size limits, and acceptance criteria.
- [ ] Generate source only inside a fresh quarantine directory after CP4 approval.
- [ ] Apply AST/static policy for allowlisted imports and forbidden filesystem, network, process, environment, dynamic evaluation, mutable globals, nondeterminism, CSS animation, and unrestricted asset access.
- [ ] Run formatting, TypeScript, ESLint, unit tests, disposable Remotion bundle, and representative still renders inside quarantine.
- [ ] Produce immutable diff, policy report, build report, and still manifest artifacts.
- [ ] Add a separate human promotion checkpoint showing diff and visual evidence.
- [ ] Promote atomically through the parent only; retain previous registry/source snapshot and implement rollback.
- [ ] Test policy rejection, failed bundle, failed still, rejected promotion, successful promotion, interrupted promotion, and rollback.

### Exit criteria

- Generated source never writes directly to production paths.
- CP4 proposal approval is distinct from source promotion approval.
- Promotion and rollback are atomic and parent-owned.

## Phase 7 — Pi-only end-to-end acceptance

### Scenario matrix

- [ ] Non-technical, fully supplied factual video with research skipped.
- [ ] Evidence-dependent video with grounded research.
- [ ] Deliberately silent video.
- [ ] Voiceover plus approved local music.
- [ ] Declarative composed scene.
- [ ] Scene QA rejection and revision.
- [ ] Render failure and recovery.
- [ ] Tier 2 capability proposal rejected without source promotion.
- [ ] Final review rejection and corrected render.
- [ ] Restart at representative checkpoints and side-effect boundaries.

### Exit criteria

- At least one complete real video reaches final publication without manual JSON editing.
- All scenarios preserve topic neutrality, approvals, traceability, idempotency, and recovery.
- Human review confirms the workflow remains understandable and does not expose implementation complexity unnecessarily.

## Phase 8 — Pi-first deployment hardening

### Tasks

- [ ] Build and run `agent-pi`, web, and render-service images once Docker is available.
- [ ] Remove the host-auth-file mount as a required path; support documented secure provider credentials without exposing secrets.
- [ ] Verify health checks, persistent SQLite volume, render output volume, SSE reconnect, graceful shutdown, and restart recovery.
- [ ] Add deployment smoke tests and operational runbook.
- [ ] Confirm web uses only the Pi API and no LangGraph fallback in normal operation.

### Exit criteria

- A clean Compose deployment completes the Pi-only E2E and survives container restart.
- No credentials are committed, logged, or embedded in images.

## Phase 9 — LangGraph retirement

### Tasks

- [ ] Record the parity evidence and retirement decision in an ADR.
- [ ] Remove `@langchain/langgraph-sdk` and LangGraph-specific hooks/types from web.
- [ ] Remove the legacy Python agent service, prompts, subagents, graph config, Dockerfile, dependencies, scripts, and environment variables.
- [ ] Remove dual-runtime flags and fallback routing.
- [ ] Update package documentation, architecture diagrams, runbooks, Compose, and feature specs.
- [ ] Search the repository for remaining LangGraph/DeepAgents runtime references and classify any retained historical documentation explicitly.
- [ ] Run all quality gates and the Pi-only E2E again.

### Exit criteria

- No executable LangGraph dependency or runtime path remains.
- Historical ADR/spec references are clearly archival.
- Pi is the single supported production runtime.

## Phase 10 — Final quality and maintainability gate

### Tasks

- [ ] Run formatting, lint, TypeScript, all package tests, web build, Remotion bundle, render-service tests, Docker validation, prompt-neutrality audit, security policy tests, recovery matrix, and full E2E.
- [ ] Confirm generated outputs, credentials, videos, and quarantine workspaces are ignored appropriately.
- [ ] Reconcile `CHANGELOG.md`, completed spec status, ADR index, README, and operational documentation.
- [ ] Move the feature spec to completed status only after every exit criterion is evidenced.
- [ ] Prepare atomic Conventional Commits and stop before push.

## Quality gate command groups

Run targeted commands after each work package and the complete set at phase boundaries:

```bash
pnpm --filter @remotion-platform/agent-pi typecheck
pnpm --filter @remotion-platform/agent-pi test
pnpm --filter @claqueta/scene-contracts typecheck
pnpm --filter @claqueta/scene-contracts test
pnpm --filter @remotion-platform/render-service test
pnpm --filter @remotion-platform/web build
pnpm run lint
pnpm run build
git diff --check
```

Destructive cleanup commands are intentionally absent.

## Stop conditions

Stop execution and request human review when any of the following occurs:

- Any unrelated tracked or untracked source file disappears.
- A prompt introduces a role-level topic, format, composition, language, theme, platform, or dimension default.
- A model is granted filesystem, shell, network, publication, or production mutation authority beyond its explicit specialist contract.
- A checkpoint can be bypassed.
- A paid/API or publication side effect is not idempotent.
- Tier 2 candidate code reaches production without separate visual/diff approval.
- LangGraph removal is proposed before the Pi-only parity evidence is complete.
