# Changelog

All notable changes to this project will be documented in this file.
Format based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **Claqueta Pi resource loader curado** — `packages/agent-pi` deja de usar un loader vacío y ahora carga de forma determinista solo los recursos locales de Claqueta: skills `scene-catalog`, `video-best-practices`, `scene-timing-guide`, `remotion-director`, `brand-guidelines`, `gemini-tts` y `sound-engineer`, más los prompt templates de `packages/agent/prompts`; se añaden diagnósticos explícitos para skills opcionales ausentes y un test de discovery que evita contaminación desde recursos globales.
- **Sistema visual Betelgeuse para Claqueta** — nuevo theme `betelgeuse` para `ClaudeCodeTutorial` con paleta de observatorio oscuro, rojo Betelgeuse, Computer Modern cargado desde `public/fonts/computer-modern`, Orión en intro y Cinturón como watermark; el frontend `packages/web` adopta los tokens Betelgeuse (radio 0, sin sombras, cartas estelares CSS, logs `[hora] [nivel]`) y el runtime Pi/LangGraph usa `theme: "betelgeuse"` como default para tutoriales personales, manteniendo `linea-directa` para legacy/ProductShort.
- **Spec de paridad Pi/DeepAgents** — nueva spec, diseño y plan de brainstorming para evolucionar `agent-pi` hacia el flujo creativo anterior con skills, visual planning por escena, pipeline/log real, especialistas, audio/voz/SFX, Scene QA, reviewer y frontera `code_evolution` para creación de escenas.
- **Runtime experimental `agent-pi` sobre Pi SDK** — nuevo paquete `packages/agent-pi` con backend Express/SSE, sesiones Pi persistentes, SQLite ligera para `threads`/`artifacts`/`events`/`pi_sessions`, model routing por env (`CLAQUETA_PI_MODEL*`), tools cerradas para guion/dirección/config/validación/render con allowlist de escritura y checkpoints de guion/dirección basados en artifacts + `terminate: true`; añade tests de store, path policy, normalización de eventos, router y tools con render-service mockeado, además del primer hook frontend `usePiVideoStream`, flag `VITE_AGENT_RUNTIME=pi` y `ScriptCard` editable para checkpoints de guion, replay/restauración básica de threads por SSE y persistencia automática de guiones editados al aprobar y tool `publish_approved_artifacts` para copiar `script.json`, `script.md`, `direction.json` y `config.json` a `content/tutorials/<slug>/` tras el flujo aprobado; el prompt V1 exige un único intento de reparación tanto para validación como para render fallidos.
- **Vídeo meta «Hola, soy Claqueta» completo** — `content/tutorials/claqueta-se-presenta/` (~2:00 renderizado): tema nuevo `claqueta` (negro proyector + ámbar tungsteno, letterbox), escenas custom `clapperboard` (film leader 3-2-1, golpe con flash y SFX sincronizado vía `audioStartMs: 2300`, modo «corten» con el config.json scrolleando) y `crew-credits` (créditos rodantes del reparto de subagentes); 6 escenas (clapperboard × 2, flow-diagram con emojis, crew-credits, terminal, icon-grid), voiceover ElevenLabs (voz Jessica, es, `eleven_multilingual_v2`), music bed `lofi-tech-2-loop`, SFX con targeting por componentId (`sceneTypes: ["custom/clapperboard"]`) y subtítulos karaoke a 26px.
- **Spec del vídeo meta «Hola, soy Claqueta»** — diseño y escaleta aprobada del tutorial landscape (~2:30) donde Claqueta se presenta en primera persona y revela que el vídeo salió de su propio pipeline: tema visual nuevo `claqueta` (sala de cine: negro proyector + ámbar tungsteno), escenas custom `ClapperboardScene` y `CrewCreditsScene`, y pipeline completo de audio. `docs/superpowers/specs/2026-06-12-claqueta-meta-video-design.md`
- **Subagente `improver` para el modo `self_improve`** — nueva definición `create_improver()` en `packages/agent/src/subagents/improver.py` con herramientas de backlog AFP, workspace git aislado, render de muestra y apertura de PR; registrado en el orquestador junto con `list_friction_drafts` en las tools del orquestador. Nuevo prompt `packages/agent/prompts/improver.md` con flujo de 6 pasos y límites duros. Nueva skill `packages/agent/skills/self-improvement/SKILL.md` con criterios de calidad para PRs de auto-mejora, cuándo renderizar evidencia y cuándo abstenerse.

- **Spec del modo `self_improve`** — diseño aprobado para que el agente desplegado mejore su propio código (escenas custom, skills/prompts, configs de contenido) vía PRs revisados por humano: backlog sobre drafts AFP, post-mortem por vídeo, trigger por umbral y bajo demanda, workspace git aislado en `.generated/workspace/` con allowlist dura. `docs/superpowers/specs/2026-06-11-self-improve-mode-design.md` + `_project_specs/features/2026-06-11-self-improve-mode.md` + plan de implementación en `docs/superpowers/plans/2026-06-11-self-improve-mode.md`

- **Modo `self_improve` completo** — contrato de modo con checkpoint `improvement_plan_approval` (`src/modes.py`), tools de backlog AFP (`list_friction_drafts`/`read_friction_draft`/`mark_draft_addressed` con sidecars `.addressed`), workspace git aislado en `.generated/workspace/` con allowlist dura y doble validación en `commit_and_push` (`src/tools/workspace.py`), `open_pull_request` vía API REST de GitHub, post-mortem por vídeo y trigger por umbral en el prompt del orquestador, `git` en la imagen del agente + env `GITHUB_REPO`/`SELF_IMPROVE_THRESHOLD` en compose, y CI de PRs (`.github/workflows/pr-checks.yml`)

### Security

- **Dependabot — auditorías pnpm/uv a cero** — `pnpm-lock.yaml` queda como único lockfile JavaScript canónico (se eliminan los `package-lock.json` de `packages/web` y `packages/render-service`) y se actualizan overrides/lockfiles para cerrar alertas en `ws`, `protobufjs`, `vite`, `esbuild`, `js-yaml`, `cryptography`, `langchain`, `langgraph-checkpoint`, `langgraph-sdk`, `langsmith`, `pydantic-settings`, `pyjwt`, `python-multipart` y `starlette`; `pnpm audit` y `pip-audit` sobre requirements exportado de `uv.lock` quedan sin vulnerabilidades.
- **Dependabot — 6 alertas resueltas (1 crítica, 5 moderadas)** mediante bumps en los cuatro lockfiles del monorepo:
  - `vitest` `3.2.4 → 3.2.6` (raíz, **crítica** [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp): lectura/ejecución de archivos arbitrarios con el servidor de Vitest UI activo)
  - `qs` `6.15.1 → 6.15.2` ([GHSA-q8mj-m7cp-5q26](https://github.com/advisories/GHSA-q8mj-m7cp-5q26): DoS por `TypeError` en `qs.stringify`) — transitiva vía `express@5`; forzada en raíz con `pnpm.overrides` y regenerada en `packages/render-service/package-lock.json`
  - `ws` `8.17.1`/`8.20.0 → 8.20.1` ([GHSA-58qx-3vcg-4xpx](https://github.com/advisories/GHSA-58qx-3vcg-4xpx): divulgación de memoria no inicializada) — transitiva, forzada con `pnpm.overrides`
  - `starlette` `1.0.0 → 1.2.1` ([GHSA-86qp-5c8j-p5mr](https://github.com/advisories/GHSA-86qp-5c8j-p5mr): falta de validación del header Host) — transitiva vía `fastapi`, `packages/agent/uv.lock`
  - `idna` `3.13 → 3.18` ([GHSA-65pc-fj4g-8rjx](https://github.com/advisories/GHSA-65pc-fj4g-8rjx): bypass del fix de CVE-2024-3651 en `idna.encode()`) — transitiva, `packages/agent/uv.lock`
  - Añadidos `overrides` selectivos por rango vulnerable en `pnpm-workspace.yaml` para fijar las versiones parcheadas de las dependencias transitivas

### Added

- **Animated concept scenes + audio sync** — new `EtalonScene` (light bouncing between plates into a red Hα ray) and `SpectrumScene` (visible spectrum with Fraunhofer lines and a cursor sweeping to the Hα line), a reusable `useKenBurns` hook for continuous slow zoom on imagery, `flow-diagram` light particle, and per-scene `beats` synced to the real voiceover timestamps so elements reveal as the narration names them (fixes the "everything appears then freezes" problem)
- **Vertical scene support** — `media-card` gains an `image-top` layout (large image above centered text), `annotated-image` renders larger with bigger annotation markers, `big-number` parses decimal-comma values (`656,28`), `CtaScene` only shows the phone mascot when `mascot.show`, and a new `SignatureWatermark` (driven by a config `signature` field) provides a text author byline as an alternative to the pixel-skull `LogoWatermark`
- **`h-alpha` theme + `VerticalShort` composition** — new "paper atlas" theme cloning the H-alpha website palette (cream paper, serif, solar-red + teal) and a reusable 1080×1920 vertical composition that reuses the existing scene engine; `TutorialConfigSchema` now accepts vertical dimensions and an optional `composition` field
- **`docs/superpowers/specs/2026-06-08-halpha-solar-video-design.md`** + **`docs/superpowers/plans/2026-06-08-halpha-solar-video.md`** — design spec and implementation plan for the vertical LinkedIn short presenting the H-alpha solar physics website; defines the `h-alpha` theme cloning the site palette, a 6-scene ~78s escaleta (física → instrumento → imagen), and the reuse of the existing dimension-agnostic scene engine for a 1080×1920 `VerticalShort` composition
- **ADR 0015** documenting transitive security remediation via range-scoped `pnpm` overrides in `pnpm-workspace.yaml`, and why per-ecosystem bumps are required across the pnpm/npm/uv lockfiles

- **`packages/web/src/lib/planState.ts`** — plan state extraction module that reads `/pipeline/plan.json` from LangGraph `stream.values.files`; provides `PlanState`/`PlanStep` types, `extractPlanState()` parser, `stepLabel()`/`modeLabel()` i18n mappings, `loadingLabelFromPlan()` and `isRenderingStep()` helpers
- **`get_next_pipeline_step` tool** — deterministic next-step resolver that reads `plan.json` and returns the next actionable step, owner, progress count, and reason; replaces manual plan parsing in the orchestrator prompt; handles all states: `next_step`, `in_progress`, `blocked`, `all_completed`, `no_plan`
- **Shared pipeline plan** — new `/pipeline/plan.json` coordination artifact with tools `create_pipeline_plan`, `read_pipeline_plan`, `update_pipeline_step`, and `record_pipeline_decision`; orchestrator and subagents now use it as the canonical pipeline state instead of relying on generic `write_todos`
- **`packages/agent/tests/test_tools_pipeline.py`** — coverage for creating, reading, updating, blocking, and recording decisions in the shared pipeline plan
- **ADR 0014** documenting the domain-specific shared pipeline plan and why `write_todos` remains scratch planning rather than pipeline memory
- **DeepAgent container runtime** — agent Docker image now carries Python source, prompts, skills, LangGraph entrypoint/config, Remotion source, scripts, content and public assets; includes Node/pnpm dependencies so `scene_creator` can run eslint/bundle validation inside the container
- **ADR 0013** documenting the deployment contract for self-contained DeepAgent images, `/skills/` virtual routing and shared runtime volumes
- **`packages/render-service/src/server.ts`** — added `POST /api/render-stills` endpoint; accepts config JSON, spawns `render-scene-stills.ts` inside the Node.js container, returns PNG manifest JSON; allows the pure-Python agent container to delegate stills rendering without needing Node.js
- **`packages/agent/src/tools/qa.py`** — three QA tools for visual scene review:
  - `render_scene_stills`: delegates to render-service `/api/render-stills` via HTTP POST (replaces subprocess npx call); default model updated to `gemini-3.1-flash-preview`
  - `qa_scenes`: sends each scene still + 5-layer context payload to Gemini multimodal LLM for structured verdict (PASS/MINOR_FIX/MAJOR_ISSUE), score, issues, and suggested changes
  - `present_qa_report`: checkpoint interrupt that pauses the pipeline for human review when issues are found
  - Helpers `_classify_position`, `_summarize_scene`, `_build_context`, `_build_qa_prompt` for rich scene context assembly
- **`packages/agent/tests/test_tools_qa.py`** — 12 tests covering render, skip logic, LLM success/error paths, context builder, and checkpoint behavior
- **`packages/agent/prompts/scene_qa.md`** — Scene QA agent prompt with QA workflow, feedback routing (ALL PASS → continue, MINOR_FIX → auto-fix, MAJOR_ISSUE → human checkpoint), and report/feedback JSON formats
- **`packages/agent/src/subagents/scene_qa.py`** — `create_scene_qa()` factory following DeepAgents subagent pattern with 3 QA tools and skills directory
- **Scene QA orchestrator integration** — `scene_qa` added as 10th subagent in `orchestrator.py`; new step 2f in `orchestrator.md` between direction validation and audio planning with retry logic for MINOR_FIX and human checkpoint for MAJOR_ISSUE
- **`scripts/render-scene-stills.ts`** — renders individual scene stills (PNG) at the 60% frame point using Remotion `renderStill` API; outputs a JSON manifest to stdout for QA agent consumption; shares bundle caching logic with `render.ts`
- **Audio-Visual Sync Platform** — eliminates dead air (blank screens while voice plays) across the entire pipeline
  - `usePhase1Entry` hook: instant ≤200ms entry for core layout elements (title, frame, background)
  - `useBeatReveal` hook: beat-driven progressive reveal for supporting elements (items, stats, diagrams)
  - `sceneTimingRegistry.ts`: central registry mapping 34+ scene types to `visualReadyMs` thresholds
  - Runtime guardrails in `calculateMetadata.ts` and `useScenePrecomputation.ts` auto-clamp audio delay to `max(visualReadyMs, agentValue)`
  - `scene-timing-guide` skill teaching agents the Two-Phase pattern and beat placement rules
  - 5 timing validation rules in `validation.py`: legacy field detection, dead-air detection, beat density, tail room, duration-content density
  - 6 new validation tests (188 total passing)
- Refactored 35 scene components to Two-Phase pattern (3 custom templates, 23 batch custom, 3 built-in, 4 ProductShort)

### Removed

- **Dead `AGENT_TO_STAGE` map and `advanceFromStream` from `usePipelineTracker.ts`** — duplicated `SUBAGENT_TO_STAGE` in `useVideoStream.ts` and was never called from App.tsx
- **`SUBAGENT_TO_STAGE` heuristic pipeline advance in `useVideoStream.ts`** — the frontend no longer infers pipeline phase from which subagent is running; the stepper reads real step statuses from `plan.json` via `stream.values`
- **`DISABLE_WRITE_TODOS` env var and runtime injection in `orchestrator.py`** — redundant with `orchestrator.md` prompt policy that already declares `write_todos` as optional scratch planning
- **Duplicate `write_todos` policy in `orchestrator.md`** — consolidated two near-identical mentions (§ Shared pipeline plan + § Known runtime behavior) into one canonical reference
- **Hardcoded `MODE_STEPS`, `STAGE_ORDER`, and `getStepStatus()` from `PipelineStepper.tsx`** — 7 mode-specific step arrays (310 lines) replaced by plan-driven rendering (~170 lines); steps, statuses, and mode now read from real `plan.json` state
- **`currentStage` / `mode` / `getLoadingLabel` from `usePipelineTracker.ts`** — pipeline tracker simplified to event log only; stepper and loading labels now derived from `planState` extracted from LangGraph stream values

### Changed

- **Orchestrator prompt refactored from procedural to policy-based** — replaced 80-line rigid step-by-step `## Workflow` with compact `## Execution policy` (common dispatch cycle, validation gates table, checkpoint table, mode-specific policy paragraphs); removed 10 redundant per-agent dispatch templates now covered by subagent `## Shared plan discipline`; prompt reduced from 300 → 244 lines
- **Checkpoints as plan decisions** — 5 checkpoint subagents (copywriter CP1, director CP2, audio_planner CP3, scene_qa CP-QA, scene_creator CP4) now have `record_pipeline_decision` tool and prompt instructions to record human verdicts in `plan.json`; orchestrator records CP5 (validator) and CP6 (reviewer) decisions plus its own checkpoints (revision/variant/target)
- Subagent prompts now enforce shared plan discipline: every agent reads `/pipeline/plan.json`, marks its assigned step `in_progress`, records `completed`/`blocked`/`skipped`, and returns a concise handoff with artifact paths
- `orchestrator.md`: now creates `/pipeline/plan.json` after intent routing, updates step statuses around each dispatch, instructs subagents to read/update the plan, and documents the exact valid `write_todos` schema for optional scratch use
- All subagent factories now receive `read_pipeline_plan` and `update_pipeline_step` tools so they can inspect shared context and mark their owned work
- `docker-compose.yml`: replaced full-repository bind mounts with named runtime volumes for `src`, `content`, `public/audio`, `public/voiceover` and `.generated`, shared between agent and render-service
- `packages/render-service/Dockerfile` and `packages/web/Dockerfile`: images now copy the source/assets they need instead of relying on `.:/app`
- `director.md`: removed deprecated `leadInMs`/`audioStartMs` timing fields, added `scene-timing-guide` skill reference, added Audio Sync (auto-calculated) section
- `audio_planner.md`: removed `leadInMs` object format from voiceover scenes example, added note that audio sync is automatic, added `scene-timing-guide` skill reference
- `scene_creator.md`: mandated Two-Phase Animation Pattern with `usePhase1Entry`/`useBeatReveal`, replaced deprecated `useSlideIn` rule, added MANDATORY section with template
- `copywriter.md`: added `scene-timing-guide` skill reference, added Duration-Content Density section with bullet/timing density guidance
- `scene-catalog/SKILL.md`: added Two-Phase timing info and `visualReadyMs` per scene type, deprecated `leadInMs`/`audioStartMs` from direction fields
- `remotion-director/SKILL.md`: removed deprecated timing rules, added scene-timing-guide prerequisite, simplified Escena model
- `video-best-practices/SKILL.md`: marked `leadInMs`/`audioStartMs` as DEPRECATED, added Two-Phase section, deprecated `useSlideIn`

### Fixed

- **Runtime `agent-pi` E2E hardening** — `generate_remotion_config` normaliza props script-like comunes antes de validar (`terminal.command/expectedOutput` → `lines`, `callout.items` → `text`, `outro.summary` → `bullets`, `transition: "cut"` → `none`), `validate_video_config`/`submit_render` pueden caer al último artifact `config` completo cuando el modelo envía inputs parciales, y `submit_render` espera finalización por defecto emitiendo progreso SSE, con skip de audio forzado en V1 salvo `CLAQUETA_PI_ALLOW_AUDIO_GENERATION=true`.
- **E2E Pi `/compact` verificado** — flujo completo con checkpoints de guion/dirección, reparación automática de validación, render MP4 y publicación de `script.json`, `script.md`, `direction.json` y `config.json` en `content/tutorials/tutorial-breve-compact-claude-code/`.
- **`EtalonScene` — physics rewrite** — the Fabry–Pérot animation now respects the actual physics: near-normal incidence (the beam bounces almost horizontally between the plates instead of a ~30° zigzag), the white beam keeps its color inside (the etalon filters, it never shifts color — the old white→red gradient implied otherwise), each right-plate hit emits a partial transmitted red ray and those parallel rays brighten together on the "reforzada" beat (constructive interference) instead of a single ray exiting after N bounces like a delay line, and the non-resonant rest exits reflected back out the entry side ("el resto se cancela"); also fixed the plates label being clipped above the viewBox and the "placas"/"espejos" wording mismatch with the voiceover
- **DeepAgents skills deployment** — skills now route through virtual `/skills/` on the agent `CompositeBackend`, so the metadata paths announced by `SkillsMiddleware` are readable later via `read_file`; added a regression test for metadata load plus full `SKILL.md` read
- **`packages/agent/src/tools/qa.py`** — `render_scene_stills` now calls render-service via HTTP instead of spawning `npx tsx` (agent container is pure Python, no Node.js); fixed default model from `gemini-2.0-flash` to `gemini-3.1-flash-preview`; restored missing `import base64` and `from pathlib import Path` that were accidentally dropped during refactor
- **`packages/agent/prompts/copywriter.md`** — limited post-approval `audit_content_quality` to exactly one call with an explicit STOP CONDITION to break the infinite audit loop
- **`packages/web/src/components/SubagentCard.tsx`** — `extractThinkingText` now shows all intermediate AI reasoning steps separated by `─────` dividers (not just the last message) for better debugging of long-running subagents
- **`scripts/render-scene-stills.ts`** — proportional frame scaling: raw `durationInSeconds * fps` accumulation diverged from actual composition length when audio sync compresses total duration; now scales frame positions proportionally so scenes 6+ are captured at the correct frame rather than being clamped to the last frame
- **`packages/agent/src/tools/qa.py`** — multimodal response parsing: `langchain_google_genai` returns `[{'type': 'text', 'text': '...'}]` for image+text messages; added list-of-dicts extraction and markdown fence stripping before JSON parsing; also fixed `_build_context` to include all top-level scene fields (not just `props`) so built-in scene types (intro, outro, benefits, callout) pass full data to the QA model
- **`src/compositions/ClaudeCodeTutorial/scenes/custom/BeforeAfterScene.tsx`** — swapped beat indices: left panel was using `beats[1]` (the 3000ms "after" beat) and right panel using `beats[2]` (undefined → fallback); corrected to `beats[0]`/`beats[1]` so Antes reveals at 1000ms and Ahora at 3000ms
- Markdown now renders in assistant chat messages (bold, headings, lists, code blocks) instead of showing raw syntax
- Custom scene types (problem-solution, before-after, flow-diagram) show meaningful titles in escaleta and direction cards instead of "-"
- Checkpoint cards persist after user selection, showing the chosen option as a disabled card with decision badge
- VideoResultCard auto-detects render completion from broader jobId patterns across recent messages
- Pipeline tracker advances to "Completado" when stream finishes instead of staying stuck on last active stage
- Checkpoint card entrance animation has 200ms delay for smoother UX
- Thread ID passed from agent runtime to render service for job-conversation association
- Code review fixes: wasLoadingRef reset on thread switch, UUID regex scoped to render context, safe Array.isArray guard on selectedOptions, findTitleInProps traverses arrays
- Chat timeline unified: enrichments (resolved checkpoints, video results) now render inline after their anchor message instead of jumping to the bottom

### Added

- `pnpm-workspace.yaml` for pnpm workspace configuration with `better-sqlite3` build approval
- `SubagentCard` component — collapsible card driven by SDK `SubagentStreamInterface` with auto-collapse on completion, tool call status icons, and thinking text
- `useVideoStream` hook — wraps SDK `useStream` with pipeline stage tracking, checkpoint extraction from interrupts, target metadata injection, and video-result enrichment
- `Enrichment` type for injecting video results and system messages into the conversational UI

- Generic `interaction_request` protocol for lightweight DeepAgent human input (text, single choice, multi choice, approval)
- `ask_user_interaction` agent tool for conversational onboarding, blocking clarifications, and small creative choices via LangGraph interrupts
- `InteractionRequestCard` frontend renderer for text inputs, radio options, checkbox choices, and simple approvals
- ADR 0012 documenting the generic conversational interaction protocol for DeepAgent workflows
- Exact prop contracts for `split-screen`, `icon-grid`, and `bullet-slide` in scene-catalog and scene_creator guidance
- Nested custom-component prop validation for `split-screen`, `icon-grid`, and `bullet-slide` before render
- Official Linea Directa brand assets in `public/branding/` plus an animated `LineaDirectaBrandLockup` that uses the official SVG with Remotion frame-driven reveal/glint effects
- ADR 0011 documenting the decision to animate official Linea Directa assets instead of hand-redrawing the logo
- `WorkingIndicator` component with animated SVG clapperboard — replaces plain loading dots in ChatThread with a visually engaging CSS-animated claqueta de cine during agent processing
- Auto-show video on target select — when selecting a config from the dropdown that has a completed render, `VideoResultCard` appears immediately without needing to ask the agent
- Per-component required props validation in `audit_content_quality` — catches missing/empty props on custom scenes before rendering (prevents blank scenes)
- Voiceover-slide word overlap check in `audit_content_quality` — warns when voiceover text repeats slide content instead of complementing it
- Custom component prop schemas in scene-catalog skill — agents can now query exact required props for big-number, comparison-table, file-explorer, code-block, and 20+ other components
- Voiceover-slide complementarity rules in audio planner prompt — explicit guidance on how voice should explain (not repeat) visual content
- Callout-specific voiceover rule in audio planner — callout scenes must never repeat the callout text; voice should add evidence or the "so what" behind the statement
- Orphaned render job recovery in render service — `recoverOrphanedJobs()` marks stale `validating`/`rendering` jobs as `error` on startup, preventing permanently stuck jobs after container restarts

### Fixed

- Target dropdown now includes recent completed `.generated/renders` configs, not only curated `content/**` configs
- Render stream/download endpoints can serve completed CLI-generated render folders even when no render-service DB job exists
- `SplitScreenScene` render crash when LLM-generated panels used `title/subtitle` instead of required `label/items`
- `IconGridScene` and `BulletSlideScene` now tolerate common LLM prop-shape mistakes without blank/crashing renders
- Escaleta custom scenes now show useful summaries for `split-screen`, `icon-grid`, and `bullet-slide` instead of `-`
- Pipeline tracker now distinguishes `scene_creator` and `validator` from sound/render stages
- Existing lint warnings from Zod `transition` schema fields and `CompositionShell` memo dependencies
- Copywriter prompt missing `composition` field and malformed `brief` — added explicit template with `composition` (required, not empty string), full `brief` object example, and `narrativeArc` as array (not string)
- Render service stderr noise — filter timestamps.json 404s from Remotion's embedded Chromium, increase stderr buffer to 8KB, extract progress from both stdout and stderr
- Frontend video detection — scan completed agent tool outputs (`submit_render`, `check_render_status`) as fallback when jobId is not in the final text message
- Databricks Scala config — fix comparison-table props format, add explicit musicBed ducking/fade fields to prevent NaN crash in `computeMusicVolume`
- Render bundle cache stale audio — `scripts/render.ts` now syncs `public/voiceover/` and `public/audio/` into the cached bundle after generating audio, so Remotion's server can find newly generated MP3s
- Validator rejected explicit `"ClaudeCodeTutorial"` composition — `scripts/validate-config.ts` now uses a `KNOWN_COMPOSITIONS` whitelist instead of only accepting `undefined` or `"ProductShort"`
- `claude-code-memory` TTS provider switched from ElevenLabs to Gemini (no API key required)
- `skills-claude-code` config missing required fields (`title`, `description`, `fps`, `width`, `height`)
- `vida-de-los-grillos` comparison-table scene props incompatible with component interface (`headers/rows` → `leftColumn/rightColumn`)
- Target dropdown polluted with `.generated/renders/` artifacts — `/api/configs` now only scans `content/` directories, reducing 40+ junk entries to 11 curated configs
- `npx` not found error in agent validation — replaced subprocess call with HTTP request to render-service `/api/validate` endpoint, eliminating the need for Node.js in the Python agent container
- Stream event normalization helpers (`packages/web/src/lib/streamEvents.ts`): stable hashing (DJB2), tool call deduplication by `tool_call_id` + input signature, artifact deduplication by content signature, streaming text merge, subagent name extraction
- Target metadata helpers (`packages/web/src/lib/targetMetadata.ts`): `appendTargetMetadata`, `parseTargetMetadata`, `stripTargetMetadata` for embedding active video target in user messages without visual contamination
- `TargetSelectionCard` component — radio-button UI for selecting among candidate video configs at target_selection checkpoints
- `RevisionPlanCard` component — two-column grid showing requested changes vs proposed edits for revision_plan checkpoints
- `VariantPlanCard` component — source→variant transformation display for variant_plan checkpoints
- `IntentDecisionCard` component — compact artifact card showing mode, confidence, flags (write/render/checkpoint/target) for route_intent decisions
- `GET /api/configs` endpoint on render-service — lists selectable video configs with metadata (title, sceneCount, durationSeconds)
- `fetchConfigs()` API client function in web package for loading configs on mount
- `ConfigListResponse` type and checkpoint data types: `TargetSelectionData`, `RevisionPlanData`, `VariantPlanData`, `IntentDecisionData`
- `AgentArtifactKind` now includes `"intent_decision"` for route_intent tool output artifacts
- `CheckpointType` now includes `"target_selection"`, `"revision_plan"`, `"variant_plan"` for new checkpoint cards
- `GET /api/render/:id/stream` endpoint — serves video via `sendFile` for in-browser `<video>` playback (supports Range headers), separate from `/download` which sets `Content-Disposition: attachment`
- `getStreamUrl(jobId)` in web API client — returns streaming URL for the video player
- `getJobByConfigId` function in render-service DB layer — query latest render job by config_id
- `config_id` query param filter on `GET /api/render/jobs` — returns latest job for a specific video config
- `fetchLatestRender(configId)` in web API client — looks up most recent completed render for a config
- Auto-lookup video preview in `App.tsx` — when the agent completes with an active target, surfaces the latest render via `VideoResultCard` if one exists
- Orchestrator mode router (`packages/agent/src/modes.py`): deterministic classification of 8 modes with contracts (target, agents, permissions, checkpoints)
- Config management tools (`packages/agent/src/tools/configs.py`): `list_configs`, `load_config`, `prepare_config`, `save_config` for operating on existing video configs
- ADR 0009 — Router subgraphs by mode
- ADR 0010 — Frontend stream normalization
- Unit tests for stream event helpers and target metadata (vitest, 6 tests)
- Unit tests for mode router and config tools (pytest)
- Test for `/api/configs` endpoint in render-service
- Config sanitizer (`packages/agent/src/tools/_sanitize.py`) that auto-fixes common LLM mistakes before Zod validation: emphasis enum normalization, terminal line format conversion, duration clamping, callout position normalization, benefits items wrapping, timing.transitionMs clamping, out-of-range beat removal, voiceover.enabled literal coercion, and soundDesign.enabled boolean coercion
- Pre-render Zod schema validation gate in `submit_render` — fails fast with structured errors before posting to render service
- Structured httpx error handling in `submit_render` and `check_render_status` (ConnectError, TimeoutException, HTTPStatusError)
- GraphRecursionError parsing in web frontend — shows user-friendly Spanish message instead of raw traceback
- `validation_failed` artifact handling in web frontend — displays structured validation card for pre-render errors
- `isToolError()` helper in `useAgentStream.ts` for robust tool error detection (regex + JSON parsing)
- 26 unit tests for config sanitizer across 8 test classes (`test_sanitize.py`)
- ADR 0005 documenting schema validation and editorial guardrails
- ADR 0006 documenting scene catalog narrative templates
- ADR 0007 documenting frontend artifact normalization
- ADR 0008 documenting educational video duration defaults
- Gemini TTS skill reference (`packages/agent/skills/gemini-tts/SKILL.md`) with 30-voice catalog, audio tags, multi-speaker format, and prompting framework
- Multi-speaker voiceover support: `SpeakerConfigSchema` in Zod schemas, `_build_speech_config` for `multi_speaker_voice_config` API calls, `_is_multi_speaker` detection, fingerprint cache invalidation with speakers
- Expanded `GEMINI_TTS_VOICES` from 8 to 30 voices with `_sanitize_voice_id` validation and fallback
- 22 unit tests for multi-speaker voice tool (`test_tools_voice_multispeaker.py`)
- Docker Compose multi-service setup: `docker compose up` starts agent, render-service, and web together with healthchecks and dependency ordering
- `packages/render-service/Dockerfile` — Node 22 + Chromium headless for containerized Remotion rendering
- `packages/web/Dockerfile` — Node 22 + Vite dev server containerized with `--host 0.0.0.0`
- Makefile targets for Docker-based workflow (`up`, `stop`, `logs`) and native alternatives (`agent-native`, `renderer-native`, `web-native`)
- Narrative metadata and reusable video templates in `src/shared/scene-catalog.json` for template-first video generation.
- `query_scene_catalog` support for searching both scenes and video templates.
- Optional `brief.templateId` and `brief.narrativeArc` fields in shared video schemas.
- ADR 0006 documenting scene catalog narrative templates.
- `audit_content_quality` agent tool for deterministic editorial checks (hook, CTA, copy density, timing, beats, voiceover pacing) before checkpoints and render.
- ADR 0005 documenting schema validation and editorial guardrails for DeepAgents.
- `packages/agent/src/paths.py` — single source of truth for all agent path constants (`PROJECT_ROOT`, `SCENE_CATALOG`, `CUSTOM_SCENES_DIR`, `SCENE_REGISTRY`, `AUDIO_LIBRARY_DIR`, etc.)
- `docs/agent-io-convention.md` — formal specification of agent READ/WRITE/SUBMIT paths and environment variables
- `content/` directory for committed video project configs (tutorials, shorts, presentations)
- `.generated/` directory for all transient pipeline outputs (render jobs, configs, MP4s, SQLite DB)
- npm workspaces configuration for `packages/render-service` and `packages/web`

### Changed

- **Package manager**: Migrated from npm to pnpm — Dockerfiles use `corepack enable` + `pnpm install --frozen-lockfile`, Makefile targets use `pnpm run`/`pnpm install`, workspaces defined in `pnpm-workspace.yaml`
- **Frontend conversational UI**: Coordinator messages now appear as first-class chat bubbles instead of collapsible agent cards; subagent work renders as collapsible `SubagentCard` details underneath the coordinator message that launched them
- **Streaming infrastructure**: Replaced manual event parser (`useAgentStream`, `streamEvents.ts`) with SDK-native `useStream` hook from `@langchain/langgraph-sdk/react` (`filterSubagentMessages: true`, `streamSubgraphs: true`)
- `ChatThread` now consumes SDK `Message[]` directly instead of internal `ChatMessage[]`; rendering splits messages into user bubbles, assistant bubbles, and linked subagent cards
- `App.tsx` reduced from ~323 to ~170 lines by delegating stream management to `useVideoStream` hook
- Orchestrator prompt now defines when to ask lightweight conversational questions vs continuing automatically or using rich checkpoint cards
- Onboarding prompt policy now keeps the same run alive after "Crear un video nuevo" by asking for the video topic/brief instead of ending with "Proceso completado"
- Orchestrator, copywriter, director, audio planner, and voice generator prompts now force Spanish from Spain (`es-ES`) unless the user explicitly requests another language
- Orchestrator user-facing text is surfaced as a first-level chat message, leaving agent cards for technical tools/artifacts
- `PipelineStepper` is now mode-aware: shows contextual steps for each routing mode (new_video, revise_existing, render_only, audit_only, question, etc.) instead of hardcoded 5-stage new_video pipeline; shows mode label badge and idle state
- `usePipelineTracker` tracks active mode (`PipelineMode`) via `setMode()`, detected from `route_intent` intent_decision artifacts in the stream
- `Sidebar` and `App.tsx` pass mode through to PipelineStepper
- `useAgentStream` refactored: side-effect-free setState updaters, refs for stable IDs, `useEffect` for agent completion callbacks, `streamSubgraphs: true` on all stream calls
- `ChatThread` now renders `TargetSelectionCard`, `RevisionPlanCard`, and `VariantPlanCard` for their respective checkpoint types
- `AgentArtifactCard` now renders `IntentDecisionCard` for `route_intent` tool outputs
- `App.tsx` checkpoint handlers extended with `target_selection`, `revision_plan`, and `variant_plan` handlers; fetches configs on mount to populate video artifact selector; `activeTargetRef` prevents stale closure in auto-lookup effect
- `VideoResultCard` uses `/stream` endpoint for `<video>` playback, `/download` for the download button
- `render-service/server.ts` `app.listen()` guarded with entrypoint check (`import.meta.url === pathToFileURL(process.argv[1])`) so importing for tests no longer starts a server
- `route_intent` refactored from regex classifier to contract resolver — the orchestrator LLM now decides the mode, `route_intent` validates and returns the contract (`mode` is now the first parameter instead of being inferred from regex patterns)
- Orchestrator prompt rewritten for LLM-based intent routing: explicit mode selection guidance with decision heuristics instead of delegating to regex classification
- Orchestrator prompt updated with mode-aware dispatch and `route_intent` requirement
- All agent prompts updated for mode contracts (target awareness, permission boundaries)
- Agent Docker Compose: added `BG_JOB_ISOLATED_LOOPS=true` env var to isolate each LangGraph run in its own event loop (prevents blocking tool calls from starving concurrent pipelines)
- `submit_render` now sanitizes configs and validates against Zod schemas before posting to render service
- Orchestrator prompt: added validation retry limit (max 2 re-dispatches) to prevent GraphRecursionError loops
- Director prompt: explicit emphasis enum values (`"low"|"medium"|"high"` ONLY) with warning against invalid values
- Copywriter prompt: explicit terminal scene format with `lines: [{kind, text}]` and warning against `output: string[]`
- Validator prompt: clarified that `validate_config` expects JSON string content, not file paths
- `docker-compose.yml` rewritten from 1 service to 3 (agent, render-service, web) with healthchecks and `depends_on` ordering
- Agent `RENDER_SERVICE_URL` changed from `http://host.docker.internal:3100` to `http://render-service:3100` (Docker internal DNS)
- Makefile `up` target now uses `docker compose up --build` instead of 4 background processes
- Copywriter/director prompts now require preserving a selected narrative template before generating scenes and beats.
- `scene-catalog` and `video-best-practices` skills now document template-first generation.
- `validate_config` now runs the Remotion Zod validation script when available and returns schema errors together with asset checks and editorial recommendations.
- DeepAgents prompts now require schema/content-quality validation before advancing from copywriter/director/validator checkpoints.
- `scene_creator` is now registered in the real orchestrator subagent list, not only documented in the prompt.
- Agent path resolution: all 8 Python files now import from `paths.py` instead of computing `Path(__file__).parent.parent...` chains (up to 5 levels deep)
- Render service job outputs moved from `packages/render-service/jobs/` to `.generated/renders/`
- Video configs relocated: `tutorials/` → `content/tutorials/`, `shorts/` → `content/shorts/`, `presentations/` → `content/presentations/`
- `CLAUDE.md` updated with full directory layout, agent I/O convention reference, and corrected paths
- `Makefile` updated for `content/` paths and npm workspace-aware install

### Fixed

- Stale closure in `App.tsx` stream result handler: `activeTarget` was read inside `useEffect` but not in its dependency array, causing auto-lookup to query the wrong config_id (showed esporas video when git tutorial was selected)
- Silent error swallowing: replaced three `.catch(() => {})` calls with `console.warn` logging for `fetchConfigs`, `fetchJobStatus`, and `fetchLatestRender`
- Video player not playing in `VideoResultCard`: `<video>` element now uses `/stream` endpoint (`sendFile`) instead of `/download` endpoint (`Content-Disposition: attachment`)
- Video streaming 404 in Docker: Express `send` module rejected paths through `.generated/` (dotfile security check); added `dotfiles: "allow"` to `sendFile` options
- Host/container path mismatch for video files: `resolveOutputPath(jobId)` derives path from `JOBS_DIR` instead of using stored `output_path` from SQLite (which contains host absolute paths)
- `Multiple configs match` error when loading configs by slug: `_resolve_config_path` now prefers `content/` matches over `.generated/renders/` copies (render jobs duplicate config.json into job dirs)
- No feedback when user asks to see a video with no render: auto-lookup now shows a message suggesting to render or regenerate assets when `fetchLatestRender` returns null
- Orchestrator `question` mode silently completing when user asks to see a non-existent video: prompt now instructs the agent to check render status and suggest actionable next steps
- `Converting circular structure to JSON` crash on checkpoint approval: all 7 checkpoint cards passed React click event as `onApprove` payload via `onClick={onApprove}` — fixed with `onClick={() => onApprove()`
- Voiceover validation always failing for existing configs: `resolve_config_id` prioritized auto-generated `PipelineContext.config_id` (`video-{random}`) over the config's own `id` field, causing validation to look in wrong directory (e.g., `video-2d38158a/` instead of `reproduccion-por-esporas/`)

### Removed

- `useAgentStream` hook, `streamEvents.ts`, `streamEvents.test.ts`, `artifacts.ts` — replaced by SDK-native `useStream` via `useVideoStream` hook
- `StreamingBubble`, `AgentArtifactCard`, `IntentDecisionCard` components — replaced by `SubagentCard` and SDK message rendering
- `extractResponse`, `createThread`, `TaskEntry` from `api.ts` — thread creation and response extraction handled by SDK internally
- `AgentSummary`, `AgentArtifact`, `AgentArtifactKind`, `ChatResponse` types from `types.ts` — no longer needed with SDK message types
- ~1,060 lines of manual stream parsing infrastructure removed in total
- `package-lock.json` and npm `workspaces` field from `package.json` — replaced by pnpm lockfile and `pnpm-workspace.yaml`
- Regex-based intent classification from `modes.py` (~80 lines of pattern constants, `_classify()`, `_matches()`, `import re`) — replaced by LLM-driven mode selection in the orchestrator
- `host.docker.internal` dependency for agent→render-service communication
- `.agents/skills/` duplicate skills directory (44 files) — `packages/agent/skills/` is the single authoritative source

### Added

- Docker containerization for LangGraph agent (`make agent` now uses Docker)
- `docker-compose.yml` with agent service, bind mount, and env passthrough
- `make agent-native` escape hatch for running without Docker
- `make agent-logs` and `make agent-shell` helper targets
- ClaudeCodeTutorial composition now supports `hero`, `benefits`, `pricing`, `cta` scene types (previously ProductShort-only)
- `PipelineContext` dataclass (`packages/agent/src/context.py`) for static per-run metadata; fields: `config_id`, `composition`, `width`, `height`, `theme`, `output_dir`, `render_service_url`
- Filesystem virtual state management: all agent prompts now include `## State management` sections specifying `/pipeline/*.json` read/write paths via built-in `read_file`/`write_file`
- `validate_config` registered as orchestrator direct tool for intermediate validation between creative steps
- `runtime` parameter on `submit_render`, `check_render_status`, `generate_voiceover`, `copy_library_track` for DeepAgents `ToolRuntime` context injection
- Summarization middleware (`create_summarization_tool_middleware`) wired into orchestrator for context compression
- Orchestrator prompt: validation between steps (after copywriter and director), pipeline state filesystem docs, agent dispatch instructions for filesystem usage
- Run-state logging in `graph_server.py` for debugging LangGraph pending tool call terminations
- `DISABLE_WRITE_TODOS` env var to suppress `write_todos` tool usage (workaround for Gemini nested format bug)
- "Known runtime behavior" section in `prompts/orchestrator.md` documenting LangGraph run termination and write_todos issues

### Changed

- Callout scene now accepts `"center"` position in addition to `"top"`, `"bottom"`, `"right"` (schema, component, skill)
- `validate_config` / `review_render` return error JSON instead of crashing when given virtual paths — LLM can recover gracefully
- Scene catalog skill updated: callout position includes "center"

### Fixed

- `validate_config` now reads `config_id` from `PipelineContext` runtime — no longer defaults to `"unknown"` when config JSON lacks `id` field
- Copywriter prompt now requires `id` field in config JSON — voiceover files are saved to the correct directory
- Audio planner prompt enforces `voiceover.scenes` as record format (`{"0": "text"}`) — Zod no longer rejects array format at render time
- `list_audio_library()` now searches for `.mp3` files instead of directories — videos will now have background music
- `generate_voiceover()` now checks for scenes presence instead of `enabled: true` flag — voiceover was silently skipped
- `_generate_scene_audio()` base64 handling: bytes written directly, strings decoded, unexpected types raise `ValueError`
- `_find_ffmpeg()` raises `FileNotFoundError` instead of returning bare `"ffmpeg"` string; supports `FFMPEG_PATH` env var
- `submit_render()` defaults changed from ProductShort (1080x1920) to Tutorial (1280x720)
- BeatSchema `narration`, `visual`, `animation` fields are now optional — missing fields no longer block renders
- Orchestrator allows re-dispatching agents on checkpoint rejection with user feedback
- Audio planner prompt always includes `"enabled": true` in voiceover config (required by Zod schema)
- Render service now captures stderr and surfaces actual error messages (Zod validation, bundler crashes) instead of opaque "exit code N"
- All Zod `.optional()` fields in schemas now accept `null` via `.nullable().optional()` — prevents validation failures when Python agents send `null` instead of omitting keys
- DuckDuckGo search tool now handles HTTP 202 responses and guides agent to fallback tools

### Changed

- Researcher agent prompt: limits failed search retries to 2, prioritizes `scrape_product` over `web_search` for known domains, caps total tool calls to 3
- `scrape_product` docstring now lists common Línea Directa slugs and marks it as primary research tool
- Skills restructured from flat `.md` files to proper DeepAgents skill directories (`scene-catalog/SKILL.md`, `brand-guidelines/SKILL.md`, `video-best-practices/SKILL.md`) with YAML frontmatter — enables progressive disclosure via SkillsMiddleware
- Prompts (copywriter, director, audio_planner, sound_engineer) rewritten: domain knowledge moved to skills, prompts now contain only workflow/tools/state-management; each includes `## Skills` section referencing relevant skill directories
- All subagent factories with domain needs now include `"skills": [str(SKILLS_DIR)]` key for SkillsMiddleware integration
- ADR 0003: documents skills/prompts/agents architecture decision (separation of domain knowledge from workflow)

### Fixed

- `submit_render()` now passes `voiceover` and `soundDesign` to render service (audio was silently dropped)
- Removed `icon` string field from `BenefitItemSchema` — was rendering raw text in videos
- Replaced emoji fallbacks in `ProblemSolutionScene` with proper SVG icons (CrossIcon/CheckIcon)

### Changed

- Constrained `icon` field in `IconGridScene` and `BulletSlideScene` to valid SVG lookup keys only
- Copywriter prompt: added visual storytelling principles, scene selection guide, copy density rules
- Director prompt: added visual emphasis/intensity levels and scene-specific direction patterns
- Improved `BenefitsScene` animations: scale effect per item, animated accent line under title
- Improved `HeroScene`: breathing radial gradient, accent line under title
- Improved `PricingScene`: pulsing glow on light variant circle

### Added

- Interactive video preview via `@remotion/player` in web frontend (VideoPlayer component)
- Shared `calculateTotalFrames` pure function in `src/shared/calculateDuration.ts` (used by both Player and calculateMetadata)
- Vite `@remotion-src` path alias for importing Remotion source from web app
- Escaleta preview: CheckpointCard now embeds a Player preview of the proposed scenes
- Visual snapshot tests for `ClaudeCodeTutorial` and `ProductShort` compositions using vitest + pixelmatch + pngjs
- Minimal test fixtures (`tutorial-minimal.json`, `short-minimal.json`) for visual regression testing
- `test:visual` and `test:visual:update` npm scripts for running and updating snapshots
- Scene transitions via `@remotion/transitions` TransitionSeries (fade, slide, wipe) with global config
- VideoResultCard: inline `<video>` player + download button shown after render completes
- `GET /api/render/:id/download` endpoint for downloading rendered MP4s
- `GET /api/render/jobs` endpoint for paginated job listing
- SQLite job persistence for render-service via better-sqlite3 (replaces in-memory Map)
- Conversation persistence: threadId and thread list stored in localStorage, survives page refresh
- ThreadList component in sidebar: switch between conversations, delete old threads, start new ones
- Render service API client (`fetchJobStatus`, `fetchJobs`, `getDownloadUrl`) in web frontend
- `TransitionConfig` Zod schema added to both composition schemas
- `calculateMetadata` adjusts total duration for transition overlap
- Native Python TTS: `generate_voiceover` now calls Gemini TTS directly via `google-genai` SDK instead of subprocess to Node.js script
- SSE reconnection with exponential backoff (3 retries) and 5-min stream timeout
- Tool error tracking in streaming UI (tools starting with "Error" show red status)
- ErrorBanner retry button wired to `stream.clearError`
- Stable `id` field on ToolEntry for consistent React keys
- Chronological agent bubbles interleaved with messages (no longer grouped at bottom)
- RenderProgress and SubagentBadge components integrated (were dead code)
- ARIA labels, semantic HTML, keyboard accessibility across all components
- PipelineStepper `covers` mapping to align 5 high-level steps with internal stages
- User-friendly error messages (ECONNREFUSED, timeout, auth errors mapped to Spanish)
- Cmd/Ctrl+Enter keyboard shortcut for send
- Shared `btnStyle` utility extracted from 4 checkpoint card components
- Unified `checkpointHandlers` factory replacing 8 copy-paste handlers in App.tsx
- Shared `checkpoint_interrupt` helper for 5 Python tool functions
- Centralized `PROJECT_ROOT` in `packages/agent/src/config.py`
- `useMemo` for `precomputeScenes` in CompositionShell (was recomputing every frame)
- TTL eviction (1h) for render service jobs Map
- `AGENT_TO_STAGE` moved to module scope in usePipelineTracker

### Fixed

- `scene_creator` KeyError: `max_attempts` and `attempt` now initialized via `init_node` entry point in the validation graph
- `check_render_status` UnboundLocalError on timeout: `result` is now initialized with a safe default before the polling loop
- Render polling timeout is now configurable via `RENDER_TIMEOUT_SECONDS` env var (default 300)
- Startup warning logged when `RENDER_SERVICE_URL` uses the default localhost value
- Hardcoded `#f59e0b` in DirectionCard replaced with theme tokens

### Removed

- Dead functions `present_sound_chart()` and `generate_audio()` from `tools/sound.py` and their exports/tests
- Subprocess-based voiceover generation (replaced by native Python TTS)

### Added

- DeepAgent graph redesign: 3-subgraph architecture (creative, production, delivery) with 6 human checkpoints
- `voice_generator` subagent for Gemini TTS voiceover generation
- `audio_planner` subagent with unified audio chart checkpoint (CP3) — presents voice + music + SFX together
- `validator` subagent for config coherence checks against disk assets (scene registry, voiceover MP3s, library tracks)
- `reviewer` subagent for post-render MP4 verification via ffprobe (duration, audio, file size)
- `present_direction` tool for director timing/beats checkpoint (CP2)
- `present_audio_chart` tool for unified audio approval
- `present_custom_scene` tool for scene creator code review (CP4)
- `generate_voiceover` tool wrapping Gemini TTS script
- `copy_library_track` tool for library-only sound design
- `validate_config` tool for pre-render asset verification
- `review_render` tool for post-render ffprobe inspection
- `--skip-audio-generation` flag in render script for agent pipeline

### Changed

- Orchestrator reorganized from 4-agent flat pipeline to 3 subgraphs with 8 subagents
- Director now has human checkpoint (CP2) for timing/beats approval
- Sound engineer operates in library-only mode (API generation disabled, uses `copy_library_track`)
- Scene creator includes `present_custom_scene` for human review of generated React components
- `submit_render` passes `_skipAudioGeneration` flag to render service
- Pipeline has 6 human checkpoints: escaleta (CP1), direction (CP2), audio chart (CP3), custom scenes (CP4), validator warnings (CP5), review (CP6)
- Mission Control dark theme UI: 2-panel layout (sidebar with pipeline stepper + event log, main chat panel), DM Sans + JetBrains Mono fonts, CSS animations
- `packages/web/src/components/AppLayout.tsx`, `Sidebar.tsx`, `PipelineStepper.tsx`, `EventLog.tsx`, `Header.tsx`, `InputBar.tsx`, `ChatThread.tsx`: new layout components
- `packages/web/src/hooks/usePipelineTracker.ts`: pipeline state machine derived from POST responses (replaces SSE-based useAgentStream)
- `packages/web/src/theme.ts`: centralized design tokens (colors, fonts, spacing)

### Changed

- `scripts/generate-sound-design.ts`: migrate from ElevenLabs to Google Lyria 3 for music bed and SFX generation, with ElevenLabs as optional fallback and local audio library support
- `packages/web/src/components/SoundChartCard.tsx`: dark theme, `disabled` prop, feedback textarea pattern matching CheckpointCard
- `packages/web/src/components/CheckpointCard.tsx`, `MessageBubble.tsx`, `SubagentBadge.tsx`, `RenderProgress.tsx`, `ErrorBanner.tsx`: dark theme styling
- `packages/web/src/App.tsx`: replaced useAgentStream with usePipelineTracker, fixed checkpoint type discrimination (escaleta vs sound_chart), added sound chart approve/reject handlers
- `packages/web/src/types.ts`: added `CheckpointType`, `PipelineStageId`, `PipelineEvent`; removed SSE-specific types

### Removed

- `packages/web/src/hooks/useAgentStream.ts`: replaced by usePipelineTracker (SSE endpoint incompatible with POST invoke)
- `packages/web/src/components/ChatWindow.tsx`: replaced by ChatThread with SoundChartCard integration

### Fixed

- Blank screen after escaleta approval: frontend now distinguishes `sound_chart_checkpoint` from `escaleta_checkpoint` and renders the correct card
- `SoundChartCard` was defined but never integrated into the chat view
- `stream.connect()` was never called (architectural fix: removed SSE in favor of POST-derived pipeline tracking)
- Orchestrator agent loop: agent re-dispatched researcher after render completion due to missing stop conditions in prompt. Added explicit STOP CONDITIONS section and "never re-dispatch" rule to `prompts/orchestrator.md`. Added `_pipeline_complete` flag in `check_render_status` docstring to reinforce termination.

- `packages/agent/tests/test_orchestrator.py`: integration tests validating orchestrator wiring, prompt file existence, skills availability, and subagent factory return types
- `packages/agent/src/subagents/scene_creator/`: Scene Creator CompiledSubAgent with deterministic lint-register-validate graph loop using LangGraph StateGraph, plus `write_scene`/`read_scene` tools
- `packages/agent/src/subagents/`: researcher, director, copywriter, sound_engineer SubAgent definitions with factory functions
- Comprehensive subagent tests: `tests/test_subagents.py` validates all 4 subagent definitions, tool assignments, and interrupt usage
- `packages/agent/src/tools/` package: split monolithic `tools.py` into `render.py`, `research.py`, `catalog.py`, `sound.py` modules
- `packages/agent/src/orchestrator.py`: multi-agent orchestrator scaffold with researcher, copywriter, director, sound_engineer subagents
- Agent prompts: `orchestrator.md`, `researcher.md`, `director.md`, `sound_engineer.md`, `scene_creator.md`
- Agent skills: `best_practices.md`, `brand_guidelines.md`, `scene_catalog.md`
- New tools: `web_search`, `web_fetch`, `scrape_product` (research), `query_scene_catalog` (catalog), `present_sound_chart`, `list_audio_library`, `generate_audio` (sound)

### Fixed

- `packages/agent/src/orchestrator.py`: fix Gemini 3.1 authentication — load Vertex AI service account credentials explicitly, correct model IDs to `gemini-3.1-pro-preview` / `gemini-3.1-flash-lite-preview`, and default location to `global` (preview models unavailable in regional endpoints)

### Changed

- `packages/agent/src/orchestrator.py`: replaced inline subagent definitions with factory functions from `src/subagents/` — cleaner, tested independently, no duplicate code
- Extracted `CompositionShell` component (`src/shared/CompositionShell.tsx`) and `precomputeScenes` function (`src/shared/useScenePrecomputation.ts`) — eliminates ~80 lines of duplicated precomputation + Series/Sequence/Audio rendering boilerplate from both compositions
- `ClaudeCodeTutorial.tsx` reduced from 173 to 84 lines using `CompositionShell` with `renderScene`/`renderOverlay` callbacks
- `ProductShort.tsx` reduced from 109 to 24 lines using `CompositionShell` with `musicLoop` flag

### Added

- `scripts/generate-scene-catalog.ts` — TypeScript script that reads `customSceneRegistry.ts` and generates `src/shared/scene-catalog.json` with machine-readable catalog of all 26 custom scenes plus builtin scenes for both compositions
- `npm run generate:catalog` script for catalog generation

- Monorepo directory scaffold: `packages/render-service/`, `packages/agent/`, `packages/web/` with placeholder `.gitkeep` files
- `scripts/validate-config.ts` — CLI validation tool that parses a config JSON against `TutorialConfigSchema` or `ProductShortConfigSchema` and exits with code 0 (valid) or 1 (invalid)
- Render service Express bridge (`packages/render-service/`) with 4 HTTP endpoints: `/api/validate` (Zod schema validation), `/api/render` (async job submission), `/api/render/:id/status` (progress tracking), `/api/audio/library` (music track listing)
- Agent project (`packages/agent/`) with `pyproject.toml`, LangGraph/httpx dependencies, and three tools: `present_escaleta()` (LangGraph interrupt for human approval), `submit_render()`, `check_render_status()` (HTTP wrappers for render-service)
- LangGraph ReAct agent (`packages/agent/src/agent.py`) with system prompt from `copywriter.md`, three tools, and MemorySaver checkpointer
- FastAPI application (`packages/agent/src/api.py`) with 3 endpoints: `POST /api/chat` (new message or resume thread), `POST /api/chat/resume` (resume after checkpoint), `GET /api/chat/:threadId` (message history)
- Agent API tests (`packages/agent/tests/test_api.py`) with skip marker for LLM-dependent tests and lazy agent initialization to avoid import failures
- React frontend (`packages/web/`) with Vite, TypeScript, and React 19 — chat interface with escaleta checkpoint cards, approve/request-changes workflow, and API client for agent endpoints

### Fixed

- `ProblemSolutionScene`, `BeforeAfterScene`: replaced hardcoded `#ff5050`/`#50ff78` colors with `tokens.terminal.labelColor`/`tokens.terminal.successColor`
- `ApiRequestScene`: replaced hardcoded panel background, Request/Response label colors, and status color with theme tokens (`tokens.terminal.bg`, `tokens.terminal.successColor`, `tokens.terminal.claude`, `tokens.primary`)
- `BrowserMockupScene`: replaced hardcoded chrome bar, traffic light dots, and URL bar colors with `tokens.terminal.titleBar`, `tokens.terminal.dots[*]`, and `tokens.terminal.bg`
- `CountdownScene`: fixed beat index collision — boxes now stagger correctly when beats are provided (`boxesStartFrame + i * step` instead of `beats[1] + i * step` overwriting per-item with same value)
- `BarChartScene`: added missing `<MascotWatermark animation="idle" />` for theme consistency

### Added

- 4 presentation scene components: `MediaCardScene`, `LogoWallScene`, `TwoColumnTextScene`, `StepListScene`
- 4 demo/technical scene components: `BrowserMockupScene`, `ApiRequestScene`, `CodeDiffScene`, `AnnotatedImageScene`
- 7 custom scene components for animated presentations: `CodeBlockScene`, `SplitScreenScene`, `IconGridScene`, `BigNumberScene`, `ComparisonTableScene`, `SectionTitleScene`, `BulletSlideScene`
- 13 SVG icon components in `svg-icons.tsx`: CheckIcon, CrossIcon, TerminalIcon, CloudIcon, CodeIcon, ShieldIcon, GearIcon, UserIcon, BookIcon, LightbulbIcon, ArrowRightIcon, LayersIcon, LinkIcon
- Vertex AI service account auth for Gemini TTS (`GOOGLE_APPLICATION_CREDENTIALS`)
- `findFfmpeg()` helper in `generate-voiceover.ts` — auto-discovers Remotion's bundled ffmpeg
- Gemini 3.1 Flash TTS Preview model support (`gemini-3.1-flash-tts-preview`)
- Tutorial `skills-claude-code` (14 scenes, ~97s): Skills de Claude Code para desarrolladores LDA
- `.gitignore` patterns for service account key files

### Changed

- `generate-voiceover.ts`: dual auth (Vertex AI service account + API key), upgraded TTS model
- `render.ts`: added `shell: true` to child process calls for Windows compatibility

- Theme `atom-dark` (One Dark Pro palette) for personal videos
- 3 custom scene components: `BlockDiagramScene`, `FileExplorerScene`, `FlowDiagramScene`
- SVG icon components (`svg-icons.tsx`) replacing emoji characters
- Terminal auto-scroll with fixed height container
- Fade-in + slide entry animation on terminal messages
- SVG triangle for Claude label (replacing unicode character)
- Enterprise bootstrap: husky, lint-staged, commitlint, ADRs, specs structure
- Gemini 2.5 Flash TTS voiceover integration (`scripts/generate-voiceover.ts`)
- `<Audio>` component in ClaudeCodeTutorial for per-scene voiceover playback
- Voiceover auto-generation step in render pipeline (`scripts/render.ts`)
- Schema fields `provider` and `language` in voiceover config
- Spanish narration for claude-code-memory tutorial (9 scenes, voice: Orus)
- Custom Claude Code hooks: config validator, render reminder, voiceover cost tracker
- Editorial direction model (`src/utils/direction.ts`): Brief, Timing, Beats, VoiceoverConfig schemas
- `remotion-director` skill for refining timing/beats on existing configs
- Pixel logo pipeline: `generate-pixel-logo.ts`, PixelLogo component, PixelLogoPreview composition
- Dual TTS support (Gemini + ElevenLabs) with per-scene overrides in `generate-voiceover.ts`
- Dynamic scene duration from measured audio length in `calculateMetadata.ts`
- Beat-driven animation timing across all scene components
- ADR 0001 (pixel logo pipeline) and ADR 0002 (editorial direction model)
- Tutorial claude-code-memory V2 with narrative brief, beats, and pixel logo
- Sound design pipeline: `scripts/generate-sound-design.ts` with ElevenLabs SFX V2 + Music API
- `src/utils/audioMix.ts` — ducking, SFX trigger/end frame, volume utilities
- Music bed `<Audio>` with dynamic ducking in ClaudeCodeTutorial and ProductShort compositions
- Per-scene SFX `<Audio>` with trigger-type mapping (scene-start, beat, typewriter, reveal, transition, accent-line)
- `SoundDesignSchema`, `SfxEntrySchema`, `MusicBedSchema` in direction.ts
- `transitionMs` field in TimingSchema for scene transition silence gaps
- `sound-engineer` skill — 5-step workflow for automated sound design with human approval gates
- Music-aware rules in `remotion-director` skill (narrative pauses, transition heuristics, beat gaps)
- Agent pipeline principle in CLAUDE.md and AGENTS.md: automate execution, not criteria
- Karaoke subtitles: word-by-word synchronized captions via ElevenLabs `/with-timestamps` endpoint
- `KaraokeSubtitles` component with chunked word display and highlight animation
- `SubtitlesConfigSchema` in `schema.ts` (enabled, style, fontSize, position)
- `LogoWatermark` component: PixelLogo with procedural smoke particles for non-mascot themes
- `SmokeParticles` component: deterministic particle system using seeded PRNG
- Seamless music loop (`lofi-tech-2-loop.mp3`) via ffmpeg crossfade

### Changed

- LogoWatermark now renders per-scene (inside Series.Sequence) and is hidden during intro scenes
- Voiceover text uses literal `.md` and `/command` instead of spelled-out "punto md" / "barra command" so subtitles display correctly
- Voiceover script now uses ElevenLabs `/with-timestamps` endpoint, saves word-level `.timestamps.json` per scene
- Music bed no longer requires `loop` — crossfaded track is longer than video duration
- Voice changed to David Martin (Calm) `y6WtESLj18d0diFRruBs` for Spanish peninsular narration
- SFX reduced to keyboard + new epic cinematic intro braam

- Font sizes increased across all scenes for mobile readability
- Prettier config completed (semi: false, printWidth: 120, trailingComma, arrowParens)
- All scene schemas merged with `DirectionSceneFieldsSchema` (timing + beats fields)
- Skills `remotion-tutorial-generator` and `remotion-short-ld` updated with editorial brief step

### Fixed

- FlowDiagramScene orb animation rewritten with per-node cycle system
- Terminal content overflow with estimateLineHeight() scroll calculation
- FlowDiagramScene: fixed broken indentation in arrow generation, removed IIFE pattern, fixed `frame` vs `localFrame` bug in outro
- BlockDiagramScene: fixed beat-to-block mapping (beat[0] is title, not first block) and connection timing (now appears after all blocks with stagger)

## 2026-03-23

### ProductShort — Composición vertical para marketing

- Nueva composición `ProductShort` (1080×1920, 9:16) con 4 escenas: `hero`, `benefits`, `pricing`, `cta`
- Skill `/short-ld` para generar shorts de marketing de Línea Directa automaticamente
- `render.ts` soporta campo `composition` en el config (backwards compatible)
- Smoke test: `shorts/seguro-coche-demo/config.json`
- README reescrito como plataforma multi-composición

### PhoneMascot SVG y TerminalScene redesign

- `PixelPhoneMascot` reemplazada por `PhoneMascot` SVG fiel al logo real de Línea Directa (teléfono con ruedas, auricular, cable, teclado 3×3)
- Prop `darkBg` para outlines blancos sobre fondos oscuros (terminal)
- `TerminalScene` rediseñada para simular la CLI real de Claude Code: cajas "You", etiqueta "⏵ Claude", barra de estado con modelo/contexto/coste
- Fondo de terminal LD: gradiente radial cálido (`#2d1c22` → `#141014`)

### Refactoring del sistema de tokens y componentes

- Tokens de terminal cableados: `sceneBackground`, `labelColor`, `successColor`, `statusBarBg`, `borderColor`, `separatorColor`, `costColor`, `userMessageBg`, `userMessageBorder`
- `MascotWatermark` — componente reutilizable para mascota en esquina (3 escenas)
- `useSlideIn()` hook — reemplaza patrón spring+interpolate repetido en 5 escenas
- `createCalculateMetadata<T>()` — factory genérica para ambas composiciones
- Tipos de escena exportados desde `schema.ts` (`IntroSceneProps`, etc.)
- `monoFontFamily` en tokens (eliminada carga separada de JetBrains Mono)
- Todas las escenas de ProductShort tokenizadas (eliminados colores hardcodeados)
- Eliminados tokens muertos: `backgroundAlt`, `secondaryForeground`, `primaryHover`, `primaryActive`, `terminal.cursor`
- Eliminadas comprobaciones `isLD` / `useTheme()` en todas las escenas

### Escaleta validation — flujo de aprobación de scripts

- Nuevo paso en ambas skills: presentar escaleta completa al usuario via `AskUserQuestion` antes de generar config.json
- Bucle sin límite de iteraciones hasta aprobación
- `remotion-tutorial-generator`: Paso 4 (Escaleta) + Paso 3 (Copywriting) extraído como paso explícito
- `remotion-short-ld`: Paso 3 (Escaleta) insertado entre Copywriting y Config
- Regla global en `CLAUDE.md`: toda skill de vídeo debe validar la escaleta

### Tema por defecto y tutorial /plugin

- Tema `"linea-directa"` establecido como default obligatorio para todas las composiciones
- Tutorial `/plugin` (54s, 7 escenas): descubrir, instalar y crear plugins de Claude Code

## 2026-03-22

### ClaudeCodeTutorial — Composición horizontal para tutoriales

- Composición `ClaudeCodeTutorial` (1280×720) con 5 escenas: `intro`, `terminal`, `callout`, `outro`, `custom`
- `TerminalScene` con efecto typewriter (command), streaming (claude) e instant reveal (output)
- Sistema de temas: `default` (oscuro/verde) y `linea-directa` (blanco/rojo #CC3333)
- `PixelPhoneMascot` — mascota pixel art del teléfono rojo de Línea Directa
- `customSceneRegistry` para escenas custom por composición
- Skill `/tutorial-generator` — investiga, genera config y renderiza tutoriales de Claude Code
- Script `render.ts` con bundler + Tailwind webpack override
- Tutoriales: `compact-command`, `plan-command`, `git-worktrees-claude-code`

### Infraestructura

- `CLAUDE.md` con arquitectura y constraints del proyecto
- Remotion best practices skill integrada
- VHS/screenRecording añadido y luego eliminado (TUI de Claude Code incompatible con VHS)
- Fix: eslint 9.19→9.39 (ReDoS en @eslint/plugin-kit)
