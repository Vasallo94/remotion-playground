# Claqueta Pi DeepAgents Parity

## Descripción

Migrar el runtime `packages/agent-pi` desde el V1 lineal actual hacia una orquestación con paridad funcional con el flujo creativo anterior basado en DeepAgents, sin volver a acoplar Claqueta a LangGraph ni romper el runtime existente.

La intención no es “copiar todos los archivos Python dentro de TypeScript”, sino traducir las capacidades que hacían bueno al flujo anterior a primitivas Pi SDK: `ResourceLoader` para skills/prompts/contexto, tools cerradas para efectos técnicos, checkpoints humanos para criterio creativo, SSE/SQLite para trazabilidad, y —solo cuando aporte valor— especialistas aislados como sesiones/subprocesos Pi.

El primer objetivo práctico es arreglar el gap observado en el vídeo del eclipse: la UI debe mostrar un pipeline/log real, la escaleta debe justificar visualmente cada escena, el catálogo debe ser usable de verdad y `agent-pi` debe dejar de caer en terminales `/compact` genéricas.

## Alcance

### Entra

- Cargar o inyectar en `agent-pi` las skills/prompts de Claqueta que antes consumía `SkillsMiddleware`.
- Persistir y emitir un plan de pipeline real para Pi (`research`, `copywriting`, `direction`, `scene_qa`, `audio_plan`, `voice_generation`, `sound_assets`, `scene_creation`, `validation`, `render`, `review`).
- Traducir eventos Pi/tools/checkpoints/render a UI: `PipelineStepper`, `EventLog` y, si hay especialistas, `SubagentCard`.
- Ampliar el checkpoint de escaleta para que cada escena exponga:
  - contenido visible/narrativo,
  - función narrativa,
  - tipo visual (`type` o `custom/componentId`),
  - razón de elección visual,
  - duración estimada,
  - assets/datos faltantes,
  - si requiere escena custom o QA especial.
- Hacer que `generate_remotion_config` preserve escenas `custom` registradas y valide sus props básicas contra `src/shared/scene-catalog.json`.
- Eliminar fallbacks heredados que generen contenido falso (`/compact`, `✓ Contexto compactado`) cuando falten líneas de terminal.
- Diseñar y, por slices posteriores, implementar especialistas equivalentes a DeepAgents: researcher, copywriter, director, audio_planner, scene_qa, voice_generator, sound_engineer, validator, reviewer y scene_creator.
- Make every coordinator/specialist prompt topic-neutral: role responsibilities are stable, while subject, brand, audience, format, language, evidence, and assets are explicit inputs.
- Mantener `theme: "betelgeuse"` como default para tutoriales personales.

### No entra en el primer slice

- Reescribir Remotion, schemas Zod o render-service.
- Sustituir el runtime LangGraph por completo: `VITE_AGENT_RUNTIME=pi` sigue siendo el switch de activación.
- Crear escenas React nuevas desde `video_generation` sin checkpoint/allowlist ampliada. La creación de código queda como slice explícito de `code_evolution` o CP4.
- Audio full production obligatoria en el primer slice. Primero debe existir visual planning + telemetry fiable.

## Criterios de aceptación

### Phase 0 — Integridad recuperable del workspace

- [x] `pnpm integrity:manifest` crea un manifiesto no destructivo con el estado de Git y hashes SHA-256 de fuentes, especificaciones y configuración, sin incluir dependencias ni salidas generadas.
- [x] `pnpm integrity:manifest -- --compare <manifest>` informa de forma accionable de archivos añadidos, eliminados o modificados, y de cambios en el estado de Git.
- [x] La limpieza recursiva de tests de `agent-pi` acepta únicamente directorios temporales del SO creados en el proceso con un prefijo registrado, o el único fixture generado permitido explícitamente.
- [x] La guardia rechaza traversal, la raíz del proyecto, enlaces simbólicos, prefijos no registrados y directorios temporales no registrados; acepta un directorio temporal recién creado válido.
- [x] Los tests dirigidos y el typecheck de `@remotion-platform/agent-pi` pasan sin watchers ni borrados fuera del worktree.

### Slice 0 — Saneamiento inmediato

- [x] `normalizeTerminalLines()` no inventa `/compact` ni outputs falsos; si una escena terminal no trae `lines`, la validación falla con error accionable o la escena se convierte usando contenido real aprobado.
- [x] `normalizeScene()` preserva escenas `{ "type": "custom", "componentId": "..." }` cuando el `componentId` existe en `src/shared/scene-catalog.json`.
- [x] El catálogo de escenas puede consultarse y la respuesta distingue claramente builtin vs custom, roles narrativos, duración y props esperadas cuando existan.
- [x] `usePiVideoStream` convierte `tool_start`, `tool_end`, `checkpoint`, `artifact_updated`, `render_status`, `error` y `agent_end` en eventos visibles en `EventLog` con formato Betelgeuse `[hora] [nivel] mensaje`.
- [x] `PipelineStepper` muestra un estado derivado de eventos Pi aunque aún no exista plan compartido completo.

### Slice 1 — Visual planning por escena

- [x] `ScriptDraft`/checkpoint de guion incluye campos por escena: `narrativeRole`, `visualType`, `componentId`, `visualRationale`, `requiredAssets`, `missingCapabilities`, `estimatedDurationSeconds`.
- [x] `ScriptCard` renderiza esos campos de forma revisable/editable sin exigir que el humano toque `config.json`.
- [x] El prompt Pi prohíbe recetas hardcodeadas por tipo de vídeo y exige justificar la elección visual escena por escena usando el catálogo.
- [x] Un E2E de tutorial no técnico o astronómico no genera terminales salvo que haya una razón explícita y contenido terminal real.

### Slice 2 — Skills/prompts dentro de Pi

- [x] `packages/agent-pi` usa un `ResourceLoader` que carga skills/prompts de Claqueta o un loader propio equivalente con tests de discovery.
- [x] Las guías mínimas disponibles para Pi son: `scene-catalog`, `video-best-practices`, `scene-timing-guide`, `remotion-director`, `brand-guidelines`, `gemini-tts`, `sound-engineer`.
- [x] La sesión principal conserva el system prompt específico de Claqueta, pero puede incluir contexto/skills adicionales sin duplicar instrucciones contradictorias.
- [x] Hay diagnóstico visible si una skill esperada no se carga.

### Slice 3 — Pipeline plan real

- [x] Existe un plan persistente por thread en SQLite/artifacts con pasos, owners, status, summaries, artifacts, blockers y decisiones.
- [x] Tools de Pi pueden crear/actualizar/leer el plan: `create_pipeline_plan`, `update_pipeline_step`, `record_pipeline_decision`, `get_next_pipeline_step` o equivalentes.
- [x] La UI consume `plan_updated` o snapshots derivados y rellena `planState` en `usePiVideoStream`.
- [x] Los checkpoints aprobados/rechazados quedan registrados como decisiones trazables.

### Slice 4 — Especialistas Pi sin perder control

- [x] Cada especialista antiguo tiene una representación documentada en Pi: pass prompt, agent Markdown o sesión aislada.
- [x] El orquestador Pi puede ejecutar al menos `researcher`, `copywriter` y `director` manteniendo artifacts intermedios (`brief`, `script`, `direction`, `config`).
- [x] El modelo/ruta por tarea se registra en eventos o artifacts para trazabilidad.
- [x] Si se usa aislamiento, los outputs de especialistas se devuelven estructurados y capados; la UI ve subagent start/end/error.

#### Cross-agent prompt policy

- [x] No Pi role prompt assumes Claude Code, Codex, Línea Directa, technology, astronomy, product marketing, or any other subject unless supplied in the brief.
- [x] Technical composition names such as `ClaudeCodeTutorial` never determine subject matter or editorial treatment.
- [x] Domain/brand skills are conditional overlays, not default role identity.
- [x] Scene and pacing decisions are justified by goal, audience, format, narrative role, visible content, evidence, assets, and catalog contracts—not topic keywords.
- [x] `agent-pi` does not load the legacy `packages/agent/prompts` directory wholesale; each migrated specialist uses a curated Pi prompt.
- [ ] E2E tests cover at least three materially different subjects and reject keyword-to-template recipes. _(Neutralidad probada estructuralmente por `promptNeutrality.test.ts` y en la práctica por producciones reales de temas distintos; falta un E2E automatizado parametrizado con 3 subjects.)_

#### Fourth specialist — isolated topic-neutral audio planner

- [x] `run_audio_planner_specialist` creates a fresh in-memory Pi SDK session using the configured audio-planning model route.
- [x] The specialist receives the approved script, approved direction, explicit audio preferences, exact Gemini voice catalog, and actual local audio-library inventory.
- [x] Subject matter never determines voice/music/SFX by recipe; choices are justified by audience, language, tone, narrative function, density, accessibility, platform, and user intent.
- [x] The specialist has only terminating `submit_audio_chart`; it cannot generate/copy assets, access the filesystem, or approve CP3.
- [x] Output supports deliberate silence, single-speaker Gemini voiceover, or exactly two named speakers; scene narration keys map only to real script indexes.
- [x] Voiceover complements visible content instead of reading slides verbatim, and factual narration remains bounded by approved script/research evidence.
- [x] Music references only an existing library id; absent suitable tracks produce `musicBed: null`; SFX remain empty unless a compatible local-library contract exists.
- [x] The parent validates voices, scene keys, volumes, speaker names, and library ids before persisting `audio-chart.json` and presenting `audio_chart_checkpoint`.
- [x] Human feedback reruns the isolated planner with the previous chart; CP3 approval is recorded in the pipeline plan and artifact store.
- [x] Unit/integration tests cover silent/single/multi-speaker validation, invented library ids, validation repair, lifecycle/disposal, checkpoint recovery, and a non-technical live smoke.

#### Deterministic Pi-native pipeline coordinator and LangGraph removal gate

- [x] Every supported mode has immutable canonical step definitions; model-supplied step lists, unknown modes, unknown step updates, and unknown decision step ids are rejected. The executable transition table is implemented for `new_video`; remaining modes still need transition coverage.
- [x] A structured intake/router session classifies mode, extracts explicit brief/preferences/target, and decides research need with rationale; it cannot execute pipeline tools.
- [x] The coordinator invokes specialists/services directly, not by asking a main LLM to remember the next tool.
- [x] Artifact prerequisites, approval state, transition order, retry budget, and checkpoint creation are enforced by parent code.
  - A failed canonical action is never retried by an ordinary message or restart.
  - An explicit retry endpoint authorizes exactly the current failed action key and generation; started, succeeded, stale, checkpoint-blocked, or non-canonical actions are rejected.
  - Authorization is process-local and single-use, while the retried generation claim is durable before any effect.
  - Concurrent retry requests for one thread cannot execute the effect twice.
  - Tests cover failed specialist retry, duplicate retry, stale action identity, and exactly-one artifact/effect after success.
- [x] Coordinator state is recoverable from SQLite plan/artifacts/decisions/checkpoint after process restart and transitions are idempotent for the implemented `new_video` mode.
- [x] Human feedback routes deterministically to the owning specialist with the previous artifact; approval advances exactly one canonical transition.
- [x] Config generation becomes a structured isolated specialist or deterministic compiler from approved script/direction/audio contracts, not free-form main-agent JSON.
- [ ] Unit transition tests cover every mode, illegal/out-of-order actions, checkpoint revisions, restart recovery, specialist failure/retry, and final completion. _(Solo `new_video` tiene tabla de transiciones ejecutable/testeada; `revise_existing`, `render_only`, `recover_failed_render`, `audit_only`, `variant`, `asset_regeneration` aún sin cobertura.)_
- [x] A real new-video E2E reaches final review and SHA-256-verified publication using Pi-only routing with no manual artifact edits.
- [ ] Docker and web default to agent-pi; LangGraph code/dependencies/config/docs are removed only after all parity gates pass. _(Compose y web ya defaultean a agent-pi; la eliminación de `@langchain/langgraph-sdk`, el flag `VITE_AGENT_RUNTIME` y `packages/agent/src` es la Fase 9, pendiente — ver ADR 0054.)_

#### Controlled scene creation — declarative-first, quarantined code escalation

- [x] New visual needs first target a topic-neutral `composed-scene` runtime backed by a shared versioned contract package consumed by Remotion and agent-pi.
- [x] The declarative contract exposes only bounded semantic primitives, theme tokens, deterministic frame-based entrances, and static data; it rejects unknown keys, excessive depth/node/text counts, arbitrary CSS, HTML, JavaScript, URLs, and executable expressions.
- [x] `composed-scene` is statically registered, catalogued, timing-registered, schema-validated before config persistence, and visually QA'd like every other scene.
- [x] An isolated Pi scene composer receives the approved scene intent plus the exact contract and terminates with validated JSON only; it has no filesystem, shell, registry, package, or code tools.
- [x] If the shared DSL cannot express an approved requirement, the composer returns a structured reusable capability gap instead of approximating or emitting code.
- [x] Capability gaps create CP4 before any code generation, including reuse analysis, proposed generic contract, security surface, affected files, and acceptance tests.
- [x] Code escalation uses a fresh Pi coding session with read-only curated references and one terminating candidate-source tool; source remains an artifact under `.generated/` and cannot write production files.
- [x] Parent-side static policy rejects non-allowlisted imports, network/storage/process/global access, dynamic imports, eval/function constructors, nondeterminism, CSS animations/transitions, hardcoded editorial copy/colors, and source/AST size limits.
- [x] Candidate verification runs formatting, TypeScript/ESLint/bundle checks and representative still rendering in a disposable quarantine before presenting diff + stills at CP4 promotion.
- [x] Only the parent promotes an approved candidate atomically, with deterministic registry/timing/catalog edits, full gates, rollback on failure, and a separately reviewable artifact trail.
- [x] Tests cover DSL bounds/unknown fields/determinism, composer output/gaps, source-policy bypass attempts, quarantine failure, CP4 recovery, atomic promotion/rollback, and no direct specialist writes.

#### Deterministic rendered-output review and final acceptance

- [x] Final MP4 review is deterministic and runs beside the render artifact; no LLM is used for file/stream metadata checks.
- [x] A render-service endpoint accepts only a known completed job id, resolves `output.mp4` and its staged config inside that job directory, and invokes fixed `ffprobe` arguments without a shell.
- [x] The report verifies file existence/size, duration against configured scene duration and explicit tolerance, video stream presence, dimensions, frame rate, codec, and expected audio presence.
- [x] The report distinguishes blocking failures from informational warnings and records actual/expected values without hiding unavailable probe capabilities.
- [x] The Pi parent consumes the latest completed render job, persists `render-review.json`, updates `review`, and presents a final human checkpoint.
- [x] Final approval records the artifact/decision and completes the review step; rejection routes to a separate approved revision/recovery flow rather than mutating config.
- [x] The web stream recovers and renders the final checkpoint using existing generic checkpoint semantics alongside the playable video result.
- [x] Unit/integration tests mock probe output and cover success, missing audio, duration/dimension mismatch, unknown/incomplete jobs, artifact persistence, and checkpoint recovery.

#### Isolated topic-neutral visual Scene QA

- [x] `run_scene_qa_specialist` first obtains one representative rendered PNG per scene from the render service, then starts a fresh multimodal Pi SDK session.
- [x] Stills manifests are treated as untrusted: scene indexes must be complete/unique and PNG paths must resolve under the configured render-service jobs root with byte caps.
- [x] The specialist receives explicit video intent, approved script/direction/audio context, exact scene config, neighboring-scene context, and corresponding ordered images.
- [x] Evaluation criteria are topic-neutral: legibility, clipping/overflow, hierarchy, visual-evidence agreement, narration/visual complementarity, narrative continuity, accessibility, and unsupported/misleading claims.
- [x] The specialist has only terminating `submit_scene_qa_report`; it cannot render, read files, mutate config, apply suggestions, or approve QA.
- [x] Every scene returns `PASS`, `MINOR_FIX`, or `MAJOR_ISSUE`, score, image-grounded observations, issues, and concrete catalog-compatible suggestions.
- [x] The parent validates exact scene coverage and report ranges, persists `qa-report.json`, updates `scene_qa`, and presents a human checkpoint whenever any change is proposed.
- [x] Human feedback is recorded by the parent and routed to a separate approved direction/config revision; Scene QA never auto-applies edits. The live-E2E stall is covered by the durable revision cycle in ADR 0044.
  - Rejection requires non-empty human feedback and persists a versioned `qa_revision_request` bound to the exact QA report, config, direction, checkpoint, and content hashes.
  - The coordinator derives a distinct journaled direction-revision action; the director receives the exact previous direction, feedback, QA findings, and one selected target summary.
  - The revised direction is a proposal and must pass CP2 again before configuration regeneration.
  - Config lineage must match the latest approved direction. A stale config is regenerated, and prior config may be used only when its immutable lineage remains compatible.
  - Every QA report has separate parent-authored lineage to the exact rendered config. Old QA cannot satisfy or be re-presented after config revision.
  - Restart at any boundary derives the same next action; duplicate callbacks and consumed checkpoint presentations remain idempotent.
  - Tests cover rejection, missing feedback, direction revision, CP2 rejection/approval, stale config/QA detection, rerender, restart derivation, and eventual visual approval.
- [x] Tutorial config exposes an explicit backward-compatible watermark switch so approved no-logo/no-watermark requirements can be represented and visually verified.
- [x] Tests cover manifest path/index safety, report validation, isolated image lifecycle/disposal, no-output repair, artifact/checkpoint persistence, and model routing without requiring live rendering.

#### Approved audio asset production

- [x] Audio production is deterministic orchestration, not another creative LLM specialist: it consumes only an approved CP3 chart and generated config.
- [x] Voice generation runs automatically only after CP3 approval, matching DeepAgent; local library copies do not require credentials or API access.
- [x] The runtime invokes the existing TypeScript voice generator without a shell, with a fixed executable/script, project cwd, timeout, and bounded output.
- [x] Silent charts skip voice generation successfully; charts without sound design skip sound assets successfully.
- [x] Local music references are revalidated and copied to `public/audio/<config-id>/music-bed.mp3`; unsupported generated music/SFX fail explicitly rather than silently invoking APIs.
- [x] The parent verifies every expected voice MP3 and music asset, records paths/sizes in an `audio_assets` manifest, and updates `voice_generation`/`sound_assets` independently.
- [x] Failed or partial output leaves the relevant pipeline step failed with the exact error and never marks production complete.
- [x] Unit/integration tests use injected process execution and temporary asset roots; no test or default smoke spends API quota.

#### Third specialist — isolated topic-neutral researcher

- [x] `run_research_specialist` creates a fresh in-memory Pi SDK session using the configured `research` model route.
- [x] Research is conditional: factual/external-verification requests use it; fictional or fully supplied content may mark the plan step skipped.
- [x] The specialist has only capped public-web search/fetch tools plus terminating `submit_research`; it has no general filesystem or shell tools.
- [x] Search/fetch reject localhost, private/link-local IP ranges, credentials in URLs, non-HTTPS URLs, unsafe ports, and unsafe redirects before any request.
- [x] The output is a structured research artifact with topic, objective, summary, key concepts, sourced claims, examples, unknowns, and deduplicated source URLs.
- [x] Every factual claim has at least one source URL and explicit confidence; unsupported material becomes an unknown, never an invented claim.
- [x] Network response bytes, redirects, tool calls, and returned text are capped; timeouts/abort propagate and the child session is always disposed.
- [x] The parent persists `brief.json`, completes/fails the `research` plan step, records model route, and emits replayable specialist lifecycle events.
- [x] The copywriter receives the latest research claims as source-labelled evidence without turning a subject keyword into a visual recipe.
- [ ] Unit tests cover SSRF guards, caps, structured output, failures, and artifact/plan integration; the live non-software factual smoke is implemented but currently blocked by the external Codex account usage limit. _(Unit tests en verde; solo el smoke live sigue bloqueado por la cuota externa de Codex.)_

#### Second specialist — isolated Pi copywriter

- [x] `run_copywriter_specialist` creates a fresh in-memory Pi SDK session using the configured `narrative` model route.
- [x] The coordinator passes the original request plus an explicit creative brief; subject, brand, audience, format, tone, language, evidence, and constraints remain input data.
- [x] The specialist receives the exact current-composition scene catalog and has no general filesystem or shell tools.
- [x] A terminating `submit_script` tool returns a strict `ScriptDraft`; the parent validates it against the catalog before persistence.
- [x] Every scene contains a narrative role, visible-content/props plan, visual role, rationale, required assets, missing capabilities, risks, and content-density-aware duration.
- [x] Topic keywords never select a visual recipe; terminal and code scenes require actual CLI/code evidence in the brief.
- [x] The specialist may not invent factual claims absent from the request/evidence; missing research is represented as a blocker or missing capability.
- [x] Human script feedback reruns the isolated copywriter with the previous draft and feedback; CP1 remains owned by the parent runtime.
- [x] The `copywriting` plan step records owner, model route, artifact path, lifecycle events, and CP1 decision.
- [x] A live smoke test uses a non-technical subject and confirms structured output plus `subagent_*` lifecycle.

#### First pilot — isolated Pi director

- [x] `run_direction_specialist` creates a fresh in-memory Pi SDK session using the configured `direction` model route.
- [x] The specialist receives the latest approved script and the exact current-composition scene catalog; it cannot use general read/bash/write/edit tools.
- [x] The specialist must finish through a terminating structured-output tool that returns a `DirectionDraft`; free-form completion gets one repair attempt and then fails explicitly.
- [x] Specialist output deterministically preserves every script scene id/type/component contract; the topic-neutral prompt requires risks/warnings for unsupported visual intentions.
- [x] The parent runtime, not the specialist, persists the direction artifact and presents CP2.
- [x] The run updates the `direction` pipeline step and records its owner/model route.
- [x] Replayable `subagent_start`, `subagent_update`, `subagent_end`, and `subagent_error` SSE events populate the existing web subagent cards after live streaming and thread reload.
- [x] Abort/error paths dispose the child session and leave an actionable failed/blocked pipeline state.

#### Typed production intake slice

- [x] `ProductionBrief` and the `production_brief` artifact explicitly model subject, objective, audience, language, platform, format, dimensions, aspect ratio, duration, brand, tone, evidence, assets, constraints, audio preferences, target requirements, acceptance criteria, and research rationale.
- [x] Required, optional, explicitly absent, and unresolved states are represented without role-level defaults; unresolved required fields produce focused human questions.
- [x] The intake specialist has one terminating structured-output tool and no filesystem, shell, network, rendering, asset, or publication tools.
- [x] The specialist submits only a brief candidate; the parent owns schema metadata, research derivation, unresolved fields, questions, and one exact repair turn.
- [x] Production-brief types are compatible with the existing persisted artifact store, with unit coverage for validation, research derivation, repair, lifecycle disposal, persistence, and prompt neutrality.
- [x] The coordinator and main session remain unwired in this isolated slice; the next integration must persist the returned artifact and route its unresolved questions before downstream work.

#### Abstract target-contract foundation

- [x] `@claqueta/scene-contracts` defines a versioned, parent-owned `TargetContract` with explicit technical capabilities, scene schema/prop-contract references, rendering constraints/defaults, and publication target data.
- [x] The generic resolver consumes only explicit approved-brief target selectors and returns exactly one target, or structured unresolved/unsupported results; it has no subject, keyword, or role defaults.
- [x] The current runtime registry keeps existing composition/schema/component identifiers as adapter data behind neutral target ids; every adapter is verified against `Root.tsx`.
- [x] Registry structures are recursively immutable and full registry listing remains parent-only; a specialist-safe summary exists only after one exact target resolves.
- [x] Tests cover schema/version strictness, nested contract validation, deep immutability, exact resolution, ambiguity, unsupported combinations, Root registration, and selected-summary boundaries.
- [x] Persist the selected target id/schema version with `ProductionBrief` and pass exactly one resolved contract into every downstream specialist/validator.

### Slice 5 — Audio, QA y review

- [x] Hay checkpoint `audio_chart_checkpoint` con voz, música y SFX antes de generar assets.
- [x] Gemini TTS y copia de librería local se ejecutan como pasos técnicos separados y trazables.
- [x] `scene_qa` puede renderizar stills por escena y producir un reporte con `PASS`, `MINOR_FIX` o `MAJOR_ISSUE`.
- [x] `reviewer` verifica MP4 final: existencia, tamaño, duración esperada y audio si procede.

### Slice 6 — Scene creation / code evolution

- [x] Las escenas custom no registradas se tratan como bloqueo o como CP4 explícito, nunca como generación silenciosa.
- [x] Si se habilita creación de escenas, opera con allowlist ampliada, lint/typecheck/validate, checkpoint humano y trazabilidad/ADR.

## Casos de test

### Unitarios backend Pi

- Public URL policy rejects loopback/private/link-local/credentialed/non-HTTPS targets and accepts a normal public HTTPS URL.
- Researcher with mocked search/fetch → returns claims with citations, emits lifecycle, enforces call caps, and disposes.
- Research artifact integration → persists `brief.json`, completes the research step, and injects source-labelled evidence into copywriter input.
- Copywriter specialist with a mocked child session → emits lifecycle events, returns a catalog-valid script, preserves revision context, and disposes the session.
- Copywriter output with invented scene/component types → parent rejects before artifact persistence.
- Copywriter abort/free-form completion → explicit failure, disposal, and failed/blocked `copywriting` step.
- Director specialist with a mocked child session → emits start/end, returns structured direction, records the direction model route, and disposes the session.
- Director specialist free-form completion without `submit_direction` → emits `subagent_error` and returns an actionable failure.
- Director specialist abort/error → disposes the session and marks the direction step failed or blocked.
- `normalizeTerminalLines({ type: "terminal" })` → no contiene `/compact`; devuelve error/fallback seguro según decisión implementada.
- `normalizeScene({ type: "custom", componentId: "block-diagram", props: {...} })` → preserva `type: "custom"` y `componentId`.
- `normalizeScene({ type: "custom", componentId: "no-existe" })` → falla con mensaje accionable o marca `missingCapabilities`.
- `createClaquetaResourceLoader()` con skills disponibles → `getSkills()` devuelve las skills esperadas.
- `create_pipeline_plan` + `update_pipeline_step` + replay SSE → conserva orden y status en SQLite.

### Integración UI

- Replayed Pi `subagent_start/update/end` events → `SubagentCard` restores the director name, status, output, model metadata, and timestamps without duplicates.
- Stream Pi con `tool_start/tool_end` → `EventLog` muestra líneas `[hora] [info] tool:name started/done`.
- Stream Pi con checkpoint script enriquecido → `ScriptCard` muestra función narrativa, componente y razón visual por escena.
- Stream Pi con `render_status` → `PipelineStepper` pasa a `rendering` y luego `done`.
- Reload de thread con plan y checkpoint pendiente → UI recupera checkpoint, log y plan sin duplicar eventos.

### E2E creativos

- Prompt: “haz un vídeo sobre el eclipse solar de 2026 en España y seguridad” → escaleta con escenas visuales variadas (`timeline`, `map/media-card` si aplica, `bullet-slide`, `callout`, etc.) y sin terminales genéricas.
- Prompt: “tutorial de Claude Code /plan” → terminal solo donde muestre comandos/resultados reales; el resto usa diagramas/callouts/código según justificación.
- Rechazar checkpoint de escaleta con feedback “demasiado terminal” → nueva escaleta reduce terminales y actualiza rationale visual.
- Config generado tras aprobar visual planning → `pnpm tsx scripts/validate-config.ts <config>` devuelve válido.

### Seguridad/regresión

- `agent-pi` no escribe fuera de `content/tutorials/**`, `.generated/**`, `public/audio/**`, `public/voiceover/**` salvo slice `code_evolution` aprobado.
- `VITE_AGENT_RUNTIME=pi` activa Pi; sin esa env el flujo LangGraph existente no se rompe.
- Los videos legacy con `theme: "linea-directa"` siguen validando.

## Notas de implementación

### Arquitectura recomendada incremental

1. **Primero telemetry + visual planning.** Es la deuda que más afecta la calidad visible y permite depurar el resto.
2. **Después resources.** Usar `DefaultResourceLoader` con rutas adicionales a `packages/agent/skills`/prompts, o un loader propio si se quiere evitar discovery global.
3. **Después plan compartido.** No depender del estado interno de Pi; persistir plan propio en SQLite y emitir SSE.
4. **Después especialistas.** Empezar con passes en la sesión principal; si el contexto o la calidad lo exige, evolucionar a sesiones/subprocesos Pi inspirados en `examples/extensions/subagent`.
5. **Audio/QA/review al final del primer tramo de paridad.** Son importantes, pero necesitan plan/telemetry para no convertirse en pasos invisibles.
6. **Scene creation separado.** Tocar `src/compositions/**` implica cambio de código y debe tener una frontera de seguridad distinta.

### Riesgos

- Cargar todas las skills/prompts sin curación puede crear instrucciones contradictorias entre el prompt Pi V1 y los prompts antiguos.
- Subagents por proceso Pi dan buen aislamiento, pero complican auth/model routing, coste, streaming y cancelación.
- Mantener dos runtimes vivos (LangGraph y Pi) exige tests de compatibilidad para schemas y configs.
- Si el catálogo no incluye prop contracts suficientes, el modelo puede elegir `custom` correcto pero rellenar props inválidas.

### Decisiones abiertas

- `ResourceLoader`: `DefaultResourceLoader` con `additionalSkillPaths` vs loader determinista propio.
- Especialistas: passes del mismo agente vs `.pi/agents/*.md` + tool `claqueta_subagent` vs SDK sessions internas.
- Audio: Gemini TTS activado en Pi tras CP3 mediante el generador y service-account ADC heredados de DeepAgent (ADR 0055).
- Scene creation: CP4 dentro de `video_generation` o modo `code_evolution` obligatorio.
