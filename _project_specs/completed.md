# Specs completadas

Specs movidas aquí tras implementación exitosa.

---

## 2026-07-03 — Betelgeuse visual system para Claqueta

## Descripción

Aplicar el sistema visual personal Betelgeuse a Claqueta para sustituir la estética por defecto de Línea Directa en la experiencia de generación de tutoriales: frontend web, theme Remotion para `ClaudeCodeTutorial` y runtime Pi.

## Criterios de aceptación

- [x] El frontend `packages/web` usa paleta Betelgeuse oscura, tipografía Computer Modern, radio 0, sin sombras y feedback en formato log.
- [x] El header/empty state incorporan el monograma Cinturón y el lenguaje de observatorio/carta estelar sin depender de assets de Línea Directa.
- [x] `ClaudeCodeTutorial` acepta un theme personal `betelgeuse` con cielo oscuro, rojo Betelgeuse, Computer Modern, Orión en intro y Cinturón como watermark.
- [x] Los defaults de `ClaudeCodeTutorial` y del runtime Pi para configs nuevos usan `theme: "betelgeuse"` salvo petición explícita de otro theme.
- [x] Se mantienen disponibles los themes históricos (`linea-directa`, `h-alpha`, `atom-dark`, `claqueta`) para configs existentes.
- [x] Tests/build relevantes pasan antes de E2E.
- [x] Se puede arrancar web con `VITE_AGENT_RUNTIME=pi` y conversar con `agent-pi` desde el frontend.

## Casos de test

- Prompt nuevo desde Pi → `generate_remotion_config` sin `theme` explícito produce `theme: "betelgeuse"`.
- Config mínimo con `theme: "betelgeuse"` → validación Zod/Remotion acepta el theme.
- `pnpm --filter @remotion-platform/web build` → compila con fuentes/assets Betelgeuse.
- `pnpm --filter @remotion-platform/agent-pi test` → mantiene el flujo de generación y defaults.
- Render/validate de config de prueba Betelgeuse → no usa assets de Línea Directa.

## Notas de implementación

- No eliminar el theme `linea-directa`; solo deja de ser el default para tutoriales personales.
- Reutilizar tokens de `/Users/enriquebook/Personal/Developer/betelgeuse-design`.
- No reescribir render-service ni schemas ajenos al campo `theme`.
- E2E final debe hablar con Pi desde UI, no solo por curl.

## Resultado

Implementado y verificado. Frontend migrado a Betelgeuse, Remotion acepta `theme: "betelgeuse"` con Orión/Cinturón y Computer Modern, y los defaults de Pi/LangGraph/skills apuntan a Betelgeuse para tutoriales personales.

Validación: `agent-pi typecheck` ✓, `agent-pi test` ✓ (20), `web build` ✓, `pnpm run lint` ✓, `pnpm run test:visual` ✓ (6), pytest subset agente ✓ (90), validate config Betelgeuse ✓, still frame Betelgeuse ✓. E2E UI con Pi completado con thread `815822ee-c5e7-4771-9daf-0bb46c316c47`, render `6bc5367b-969d-40bf-900e-83b931d9f696` y artifacts en `content/tutorials/claude-code-plan-betelgeuse/`.

---

## 2026-07-02 — Runtime agéntico con Pi SDK

### Objective

Migrar progresivamente el runtime agéntico de Claqueta a Pi SDK empezando por el flujo de generación de `ClaudeCodeTutorial` desde UI/chat, manteniendo Remotion, render-service, schemas Zod, catálogo de escenas y checkpoints humano-en-el-loop.

### Scope

- Nuevo backend experimental `packages/agent-pi` en TypeScript con Pi SDK, Express, SSE, SQLite y sesiones Pi persistentes.
- Tools cerradas para catálogo, guion, dirección, config, validación, render, status y publicación de artifacts.
- Checkpoints de guion/dirección con artifacts versionados y pausa por `terminate: true`.
- UI activable con `VITE_AGENT_RUNTIME=pi`, `usePiVideoStream`, `ScriptCard` editable y recuperación básica de thread/checkpoint.
- Persistencia final de `script.json`, `script.md`, `direction.json` y `config.json` en `content/tutorials/<slug>/`.
- Reutilización de `packages/render-service` para validar/renderizar, sin reescribir Remotion ni schemas existentes.

### Acceptance Criteria

1. Existe `packages/agent-pi/` como backend experimental TypeScript basado en Pi SDK.
2. La UI puede usar eventos SSE del runtime Pi mediante `VITE_AGENT_RUNTIME=pi` conservando LangGraph como default.
3. El chat sigue siendo el eje y muestra cards/checkpoints para guion y dirección.
4. El usuario puede generar, editar y aprobar una escaleta/guion estructurado.
5. Tras aprobar guion, Pi genera dirección técnica revisable y permite aprobación/crítica.
6. Tras aprobar dirección, Pi genera `config.json`, valida Zod y lanza render.
7. La validación fallida activa un intento automático de reparación; render fallido tiene retry policy en prompt y timeout/progreso en tool.
8. Se publican artifacts aprobados en `content/tutorials/<slug>/` y drafts intermedios quedan en `.generated/`.
9. La persistencia usa SQLite ligera para threads/artifacts/events y enlaza sesiones Pi.
10. La escritura runtime V1 está limitada por allowlist.
11. El model routing permite configurar proveedores/modelos por env.
12. `code_evolution` queda documentado en diseño/roadmap, no implementado en V1.

### Result

Implementado y verificado. Tests: `pnpm --filter @remotion-platform/agent-pi typecheck` ✓, `pnpm --filter @remotion-platform/agent-pi test` ✓ (20 tests), `pnpm --filter @remotion-platform/web build` ✓. E2E manual `/compact` completado con thread `1a2f01ae-65b7-4fa8-87bc-0808846d0d15`, render `cd60beb2-fd72-46f1-ab93-28b7d3f1f945` y artifacts publicados en `content/tutorials/tutorial-breve-compact-claude-code/`.

---

## 2026-05-19 — UI desde plan.json

### Objective

Hacer que el frontend lea el estado real del pipeline desde `/pipeline/plan.json` (via `stream.values.files`) en vez de adivinar la fase desde nombres de subagentes en el stream.

### Scope

- Crear `packages/web/src/lib/planState.ts` — tipos, extracción de plan desde LangGraph state, labels en español, helpers.
- Reescribir `PipelineStepper.tsx` — plan-driven (170 líneas vs 310 hardcodeadas). Steps, status y mode vienen del plan real.
- Modificar `useVideoStream.ts` — exponer `planState` desde `stream.values`, eliminar `SUBAGENT_TO_STAGE` heuristic.
- Simplificar `usePipelineTracker.ts` — solo event log, sin `currentStage`/`mode`/`getLoadingLabel`.
- Actualizar `App.tsx`, `Sidebar.tsx`, `ChatThread.tsx` — wiring de plan state, derivar `loadingLabel` e `isRendering` del plan.

### Acceptance Criteria

1. Stepper muestra steps reales de plan.json con statuses reales.
2. No hay mapas hardcodeados agent→stage en el frontend.
3. Mode label viene de plan.mode, no de setMode (que nunca se llamaba).
4. Loading label derivado del step in_progress actual.
5. TypeScript compila sin errores.

### Result

Implementado. TypeScript ✓, 37/37 tests ✓. Frontend ahora es una _vista_ de estado real, no una _estimación_.

---

## 2026-05-19 — Eliminar heurísticas duplicadas

### Objective

Quitar lógica dispersa que infiere fase actual del pipeline desde mensajes/tool calls cuando ya existe plan.json como fuente de verdad.

### Scope

- Eliminar `AGENT_TO_STAGE` map y `advanceFromStream` de `usePipelineTracker.ts` (código muerto, nunca llamado).
- Eliminar `DISABLE_WRITE_TODOS` env var y su inyección runtime en `orchestrator.py` (redundante con política del prompt).
- Consolidar mención duplicada de `write_todos` en `orchestrator.md`.

### Remaining heuristics (for Point 6: UI desde plan.json)

- `SUBAGENT_TO_STAGE` en `useVideoStream.ts` — mecanismo activo que infiere etapa desde subagentes del stream. Reemplazar cuando frontend lea plan.json.
- `MODE_STEPS` / `STAGE_ORDER` / `getStepStatus()` en `PipelineStepper.tsx` — stepper hardcodeado con 7 definiciones por modo. `setMode()` nunca se llama; siempre cae a `STEPS_NEW_VIDEO`. Reemplazar con stepper derivado de plan.json.
- `getLoadingLabel()` en `usePipelineTracker.ts` — labels estáticos por etapa. Derivar de plan step metadata.

### Acceptance Criteria

1. No hay código muerto referenciando mapas agent→stage duplicados.
2. No hay heurísticas runtime (env vars) que parcheen el prompt.
3. 37 tests pasan, TypeScript compila sin errores.

### Result

Implementado. 37/37 tests ✓, TypeScript ✓. Heurísticas activas (frontend tracking) documentadas como scope de Point 6.

---

## 2026-05-19 — get_next_pipeline_step Tool

### Objective

Crear herramienta determinista que lea plan.json y devuelva el siguiente paso a ejecutar, reduciendo la carga cognitiva del prompt del orquestador.

### Scope

- Implementar `get_next_pipeline_step()` en `pipeline.py` con 5 estados: `next_step`, `in_progress`, `blocked`, `all_completed`, `no_plan`.
- Registrar en orchestrator.py tools, **init**.py exports, orchestrator.md tool catalog y execution policy common cycle.
- 7 tests cubriendo todos los estados y edge cases.

### Acceptance Criteria

1. Tool implementado y registrado en orquestador.
2. Prompt actualizado: common cycle usa `get_next_pipeline_step` en vez de parsing manual.
3. 37 tests pasan (30 + 7 nuevos).
4. Tool catalog en orchestrator.md incluye `get_next_pipeline_step`.

### Result

Implementado. 37/37 tests ✓.

---

## 2026-05-19 — Checkpoints como Decisiones del Plan

### Objective

Que cada checkpoint (CP1-CP6, CP-QA) registre la decisión humana en `plan.json` via `record_pipeline_decision`, no solo "step completed".

### Scope

- Añadir `record_pipeline_decision` tool a 5 subagent factories con checkpoint interrupt (copywriter, director, audio_planner, scene_qa, scene_creator).
- Actualizar prompts con instrucciones de `record_pipeline_decision` después de cada resolución de checkpoint (approved / changes_requested).
- Orchestrator registra CP5 (validator warnings), CP6 (reviewer approval), y sus propios checkpoints (revision/variant/target).
- Tests: factory-level (5 factories tienen el tool) + prompt-level (5 prompts mencionan su CP id y record_pipeline_decision).

### Acceptance Criteria

1. 5 checkpoint subagent factories incluyen `record_pipeline_decision` en tools.
2. 5 checkpoint prompts mencionan `record_pipeline_decision` y su CP id.
3. Orchestrator prompt documenta explícitamente quién registra cada CP.
4. 30 tests pasan.

### Result

Implementado. 30/30 tests ✓. Cada checkpoint ahora registra la decisión humana en plan.json.

---

## 2026-05-19 — Orquestador Policy-Based

### Objective

Convertir `orchestrator.md` de un guion procedural rígido (paso 2a, 2b, 2c...) a una policy basada en `plan.json` que dice "lee el plan, decide siguiente step permitido, despacha".

### Scope

- Reemplazar `## Workflow` (80 líneas, 14 sub-pasos rígidos para `new_video`) con `## Execution policy` compacta.
- Common dispatch cycle de 7 pasos genéricos.
- Validation gates como tabla (copywriting, direction, scene_qa, voice+sound).
- Checkpoints como tabla (CP1-CP6 con owner y condición).
- Mode-specific policies como párrafos compactos (no sub-listas numeradas).
- Eliminar 10 templates de dispatch redundantes (cubiertos por `## Shared plan discipline` de cada subagente).
- Limpiar referencias a "step 2n" y "step 2g" del sistema anterior.

### Acceptance Criteria

1. Prompt reducido de 300 a ≤250 líneas.
2. No existe sección `## Workflow`.
3. Existe sección `## Execution policy` con sub-secciones: Common cycle, Dispatching subagents, Parallel dispatch, Validation gates, Conditional steps, Checkpoints, Mode-specific policies.
4. 28 tests pasan (`test_prompts_filesystem.py` + `test_orchestrator.py` + `test_tools_pipeline.py`).
5. No hay templates de dispatch per-agent en el prompt.

### Result

Implementado. 300 → 244 líneas. 28/28 tests ✓.

---

## 2026-05-19 — Subagentes Responsables del Plan Compartido

### Objective

Hacer que todos los subagentes usen `/pipeline/plan.json` como contexto compartido y actualicen explicitamente el estado de su paso.

### Scope

- Anadir seccion `Shared plan discipline` a researcher, copywriter, director, scene_qa, audio_planner, voice_generator, sound_engineer, scene_creator, validator y reviewer.
- Obligar a `read_pipeline_plan` antes de trabajar.
- Obligar a `update_pipeline_step(..., "in_progress")` al empezar.
- Obligar a marcar `completed`, `blocked` o `skipped` segun resultado.
- Registrar artifact paths esperados para brief, config, QA, validation y review.
- Anadir test de prompts para evitar regresiones.

### Acceptance Criteria

1. Cada prompt de subagente contiene `Shared plan discipline`.
2. Cada prompt menciona `read_pipeline_plan`.
3. Cada prompt menciona `update_pipeline_step`.
4. Cada prompt referencia `/pipeline/plan.json`.
5. Cada prompt menciona su step principal.

### Test Cases

1. `uv run pytest tests/test_prompts_filesystem.py tests/test_orchestrator.py -q` — 23 passed.

---

## 2026-05-18 — Shared Pipeline Plan

### Objective

Introducir un plan compartido del pipeline para que el orquestador y los subagentes coordinen trabajo mediante `/pipeline/plan.json`, sin depender de `write_todos` como memoria global.

### Scope

- Crear tools `create_pipeline_plan`, `read_pipeline_plan`, `update_pipeline_step` y `record_pipeline_decision`.
- Registrar las tools en el orquestador.
- Dar `read_pipeline_plan` y `update_pipeline_step` a todos los subagentes.
- Ajustar el prompt del orquestador para que `/pipeline/plan.json` sea la fuente de verdad de coordinacion.
- Documentar que `write_todos` es scratch opcional y anadir schema correcto para evitar llamadas con `items`.
- Crear ADR 0014.

### Acceptance Criteria

1. El orquestador puede crear un plan con pasos por defecto segun modo.
2. El orquestador y subagentes pueden leer `/pipeline/plan.json`.
3. Cada agente puede actualizar el estado de su paso.
4. El prompt del orquestador declara que `pipeline_plan` es la fuente de verdad de coordinacion.
5. `write_todos` queda descrito como scratch opcional, no como plan canonico.
6. Hay tests unitarios para crear, leer y actualizar el plan.

### Test Cases

1. `uv run pytest tests/test_tools_pipeline.py tests/test_orchestrator.py -q` — 18 passed.
2. `uv run pytest tests/test_prompts_filesystem.py tests/test_tools_pipeline.py tests/test_orchestrator.py -q` — 27 passed.
3. `uv run python -m py_compile src/tools/pipeline.py` — pass.

---

## 2026-05-18 — DeepAgent Container Runtime

### Objective

Hacer que el despliegue Docker del DeepAgent sea autocontenido y reproducible, sin depender de montar todo el repo del host en `/app`.

### Scope

- Copiar codigo Python, prompts, skills, LangGraph config y assets Remotion en las imagenes.
- Exponer skills por `/skills/` con `FilesystemBackend(..., virtual_mode=True)`.
- Sustituir bind mounts completos por volumenes nombrados compartidos entre agente y render-service.
- Mantener `scene_creator` funcional dentro del agente con Node/pnpm y dependencias workspace.
- Endurecer `.dockerignore` para no enviar secretos ni artefactos locales al contexto Docker.

### Acceptance Criteria

1. La imagen del agente incluye `packages/agent/src`, `prompts`, `skills`, `graph_server.py` y `langgraph.json`.
2. `SkillsMiddleware` carga 10 skills y publica rutas `/skills/...`.
3. Un `SKILL.md` publicado por metadata se puede leer con el backend normal del agente.
4. `docker-compose.yml` no usa `.:/app`.
5. Agent, render-service y web construyen desde sus Dockerfiles.

### Test Cases

1. `uv run pytest tests/test_orchestrator.py -q` — 12 passed.
2. `docker compose config --quiet` — pass.
3. `docker compose build agent render-service web` — pass.
4. `docker run --rm remotion-playground-agent uv run --project /app/packages/agent python -c "..."` — carga 10 skills, lee `/skills/brand-guidelines/SKILL.md` sin error.

---

## 2026-05-13 — Target Dropdown Incluye Renders Recientes

### Objective

Hacer que el selector de target del frontend represente lo que el usuario entiende por "vídeo objetivo": tanto configs curados de `content/**` como renders recientes completados en `.generated/renders/**`.

### Scope

- Incluir renders completados recientes en `GET /api/configs` si tienen `config.json` y `output.mp4`.
- Mantener filtrado para no listar carpetas temporales de validación ni renders incompletos.
- Mezclar configs remotos con artifacts locales sin duplicados en el frontend.
- Permitir previsualizar renders CLI mediante `/api/render/:id/stream` aunque no exista job en SQLite.
- Marcar renders en el dropdown con prefijo `render ·`.

### Acceptance Criteria

1. Un render completado en `.generated/renders/<id>/` aparece como target seleccionable.
2. Las carpetas sin `output.mp4` no aparecen.
3. Los configs de `content/**` siguen apareciendo.
4. Seleccionar un render con `jobId` muestra la card de vídeo directamente.

### Test Cases

1. `npm run build --workspace packages/web` — pass.
2. `npm run test --workspace packages/render-service` — pass.
3. `npm run lint` — pass.

---

## 2026-05-13 — Estabilización E2E del Video Generator

### Objective

Corregir los fallos detectados en el test E2E del 2026-05-13: onboarding que termina abruptamente, crash de render por props incorrectos en `split-screen`, desincronización básica del panel de pipeline, escaleta poco informativa para escenas custom, baja visibilidad del texto del orquestador, y generación de contenido en inglés.

### Scope

- Ajustar política de onboarding para que "Crear un video nuevo" continúe preguntando por el tema/brief.
- Normalizar defensivamente props de `split-screen`, `icon-grid` y `bullet-slide`.
- Documentar interfaces exactas de esos componentes en skill/prompt.
- Añadir validación anidada de props custom antes del render.
- Añadir stages `scene_creator` y `validator` al tracker/pipeline UI.
- Mostrar summaries útiles para escenas custom en la escaleta.
- Elevar texto del orquestador a mensajes de chat visibles.
- Forzar español de España en prompts creativos y de audio.
- Registrar el rediseño UIUX completo como mejora futura.

### Acceptance Criteria

1. El onboarding no termina con "Proceso completado" tras elegir "Crear un video nuevo"; pide el tema/brief siguiente.
2. `SplitScreenScene` normaliza `title/subtitle` heredados a `label/items` y no crashea si faltan `items`.
3. `icon-grid` y `bullet-slide` toleran shapes comunes incorrectos sin romper render.
4. La documentación de props de custom components incluye interfaces exactas para `split-screen`, `icon-grid` y `bullet-slide`.
5. La validación de calidad detecta props anidados incorrectos para esos componentes antes del render.
6. El tracker muestra fases más fieles para `scene_creator`, `validator` y render.
7. La escaleta muestra contenido útil para escenas custom en vez de `-`.
8. El texto del orquestador dirigido al usuario aparece como mensaje de chat visible.
9. Los prompts fuerzan español de España para usuario, escenas y voiceover.

### Test Cases

1. `npx tsx scripts/render.ts .generated/renders/f2fa4232-f6f1-4d6a-a6f1-5fac61da4204/config.json` — render completed successfully.
2. `npm run lint` — pass.
3. `npm run build --workspace packages/web` — pass.
4. `uv run pytest tests/test_tools_validation.py tests/test_tools_interactions.py tests/test_orchestrator.py tests/test_modes.py tests/test_tools_configs.py` — 41 passed.

---

## 2026-05-13 — Interacciones Conversacionales del DeepAgent

### Objective

Añadir una capa genérica de interacción humano-agente para que el DeepAgent pueda pedir input durante procesos creativos sin depender siempre de cards específicas de escaleta, dirección o audio.

### Scope

- Definir el contrato `interaction_request` para texto, selección única, selección múltiple y aprobación simple.
- Añadir la tool backend `ask_user_interaction` basada en `interrupt()`.
- Exponer la tool en el orquestador y documentar su política de uso en el prompt.
- Añadir tipos frontend para interacciones conversacionales.
- Crear `InteractionRequestCard` y conectarla en `ChatThread`/`App`.
- Mantener las cards ricas existentes sin migrarlas en esta pasada.

### Acceptance Criteria

1. Existe un contrato `interaction_request` compartido entre backend y frontend.
2. El backend expone una tool directa para lanzar interacciones conversacionales mediante `interrupt()`.
3. El orquestador conoce cuándo usar la tool: onboarding, aclaraciones bloqueantes y elecciones creativas ligeras.
4. El frontend renderiza `text`, `single_choice`, `multi_choice` y `approval` sin caer en JSON bruto.
5. Las respuestas se reanudan con payload estructurado suficiente para que el agente continúe.
6. Las cards existentes de escaleta, dirección, audio, target, revisión y variante siguen funcionando.
7. La UI mantiene `GenericCheckpointCard` como fallback para tipos desconocidos.

### Test Cases

1. `uv run pytest tests/test_tools_interactions.py tests/test_orchestrator.py tests/test_modes.py tests/test_tools_configs.py` — 32 passed.
2. `npm run build --workspace packages/web` — TypeScript and Vite build pass.
3. `npm run lint` — root Remotion lint/typecheck pass.

---

## 2026-05-12 — Linea Directa Brand Lockup

### Objective

Mejorar la presencia de marca de Linea Directa en las presentaciones usando assets oficiales animados por composicion en Remotion.

### Scope

- Incorporar el SVG oficial como asset publico para el lockup completo.
- Incorporar un recorte oficial del telefono para apariciones pequenas como mascota/watermark.
- Crear `LineaDirectaBrandLockup` con reveal, spring y glint frame-by-frame sobre el asset oficial.
- Usar el lockup completo en la intro de `ClaudeCodeTutorial` cuando el tema muestra mascota.
- Mejorar contraste del simbolo en el hero vertical de `ProductShort`.

### Acceptance Criteria

1. Existe un componente reutilizable para el lockup de marca Linea Directa.
2. El lockup renderiza el asset oficial con telefono, wordmark y subrayado rojo.
3. La intro de `ClaudeCodeTutorial` usa el lockup cuando el tema muestra mascota.
4. Las animaciones usan `useCurrentFrame()` con `spring()`/`interpolate()`.
5. El cambio pasa `npm run lint`.

### Test Cases

1. `npm run lint` — zero errors, existing warnings only.
2. `npm run test:visual` — 2 tests passing.
3. `remotion still` frame 45 for `ClaudeCodeTutorial` — lockup visible, no duplicated brand label.
4. `remotion still` frame 45 for `ProductShort` — phone symbol remains legible on red background.

---

## 2026-05-11 — Normalización de streaming y UI de modos

### Objective

Mejorar el frontend del agente para que soporte los nuevos modos del orquestador y elimine duplicados en mensajes, cards de agentes, tools y artifacts durante la ejecución.

### Scope

- Normalizar eventos de streaming a entidades estables con dedupe por ids/signatures.
- Añadir cards para checkpoints de selección de target, plan de revisión y plan de variante.
- Refactorizar `useAgentStream` para usar refs y useEffect (sin side-effects en setState).
- Añadir `/api/configs` endpoint al render-service.
- Guardar `app.listen()` con entrypoint guard para tests.

### Acceptance Criteria

1. El procesamiento de streaming no ejecuta efectos secundarios dentro de updaters de React.
2. Las tools se deduplican por `tool_call_id` cuando existe y por signature estable como fallback.
3. Los artifacts se deduplican por source/signature estable y no por ids aleatorios.
4. `ACTIVE_VIDEO_TARGET` se añade, parsea y oculta mediante helpers centralizados.
5. La UI activa `streamSubgraphs` en las llamadas de stream para recibir namespaces cuando el backend las emita.
6. Existen cards dedicadas para `target_selection_checkpoint`, `revision_plan_checkpoint` y `variant_plan_checkpoint`.
7. La UI muestra una card/resumen útil para `route_intent` (como artifact compacto en AgentArtifactCard).
8. Hay tests unitarios para helpers de metadata y dedupe de stream.

### Test Cases

1. `npx vitest run packages/web/src/lib/` — 6 tests passing.
2. `npx tsx --test packages/render-service/test/server.test.ts` — 5 tests passing (includes `/api/configs`).
3. `npx tsc --noEmit -p packages/web/tsconfig.json` — zero errors.

---

## 2026-05-11 — Rediseño del orquestador por modos

### Objective

Separar la decisión de intención del pipeline creativo completo para que el agente pueda operar sobre vídeos existentes, renders, auditorías, variantes, recuperación de errores y preguntas sin reiniciar siempre el flujo completo.

### Scope

- Añadir router determinista para `new_video`, `revise_existing`, `render_only`, `recover_failed_render`, `audit_only`, `variant`, `asset_regeneration` y `question`.
- Definir contratos de modo con target requerido, agentes permitidos/prohibidos, permisos de escritura/render y checkpoints.
- Añadir tools para listar, cargar, preparar y guardar configs existentes.
- Añadir checkpoints para plan de revisión, variante y selección de target.
- Actualizar prompts de orquestador/subagentes para respetar contratos de modo.
- Persistir artifacts seleccionables en la UI y enviar target activo al backend.
- Documentar modos futuros.

### Acceptance Criteria

1. El router clasifica los 8 modos base con decisión estructurada.
2. Los contratos bloquean escritura/render/agentes prohibidos por modo.
3. Los modos que requieren target devuelven `missing_target` cuando la UI no lo aporta.
4. La UI guarda artifacts renderizados con `configPath`, `configId`, `jobId`, `composition` y `title`.
5. La UI envía `ACTIVE_VIDEO_TARGET` en el mensaje al backend cuando hay target activo.
6. Los prompts obligan al orquestador a aplicar `route_intent` antes de dispatch.
7. Los modos futuros quedan en roadmap.

### Test Cases

1. `uv run pytest tests/test_modes.py tests/test_tools_configs.py`
2. `uv run pytest tests/test_orchestrator.py`
3. `npm run build --workspace packages/web`

---

## 2026-05-08 — Scene Catalog Templates and Narrative Metadata

### Objective

Elevar el catálogo de escenas de una lista técnica de componentes a una herramienta de dirección narrativa para agentes. El copywriter ahora puede elegir una plantilla de vídeo y escenas por rol narrativo antes de generar la escaleta.

### Scope

- Añadir metadata narrativa a escenas built-in y custom.
- Añadir plantillas reutilizables para tutoriales y shorts.
- Hacer que `query_scene_catalog` consulte escenas y plantillas.
- Actualizar skills/prompts para exigir selección de plantilla.
- Añadir `brief.templateId` y `brief.narrativeArc` al schema compartido.

### Acceptance Criteria

1. `scene-catalog.json` incluye metadata narrativa por escena.
2. `scene-catalog.json` incluye plantillas de vídeo reutilizables.
3. `query_scene_catalog` permite consultar escenas y plantillas por texto.
4. La skill `scene-catalog` documenta cómo elegir plantilla antes de escribir escenas.
5. El prompt del copywriter obliga a seleccionar una plantilla y justificar desviaciones.
6. La auditoría editorial recomienda añadir `brief.templateId` cuando falte.
7. Hay tests de la tool de catálogo y de la auditoría de template.

### Test Cases

1. `query_scene_catalog("template")` devuelve plantillas.
2. `query_scene_catalog("code-walkthrough")` devuelve la plantilla concreta.
3. `query_scene_catalog("terminal")` devuelve metadata narrativa de la escena.
4. Config sin `brief.templateId` devuelve recomendación editorial.
5. `npm run generate:catalog` genera un JSON válido.

---

## 2026-05-08 — DeepAgent Content Quality Upgrade

### Objective

Mejorar el pipeline DeepAgents para que genere mejores vídeos automáticamente, alineando el flujo con las recomendaciones oficiales de Remotion para agentes: skills reutilizables, salida estructurada validada contra schemas, y compilación/validación automática antes de renderizar.

### Scope

- Registrar `scene_creator` en el orquestador real.
- Ejecutar la validación Zod de Remotion desde `validate_config` cuando el script local está disponible.
- Añadir `audit_content_quality` para detectar problemas editoriales de hook, densidad, CTA, beats, timing y voiceover.
- Actualizar prompts de orquestador, copywriter, director, validator y scene creator.
- Normalizar path handling en herramientas de audio/voz para tests y runtime local/Docker.

### Acceptance Criteria

1. El orquestador incluye el subagente `scene_creator` que ya existe.
2. `validate_config` ejecuta la validación Zod de Remotion y conserva los checks de assets.
3. La auditoría editorial devuelve errores, warnings y recomendaciones accionables.
4. Los prompts obligan a usar validación de schema + calidad antes de avanzar.
5. Hay tests unitarios para validación Zod, auditoría editorial y conexión del `scene_creator`.

### Test Cases

1. `uv run pytest tests` en `packages/agent`.
2. Config con schema inválido devuelve errores de schema.
3. Config con texto denso devuelve warnings editoriales.
4. Orquestador mantiene `create_scene_creator()` en el flujo.

---

## 2026-03-28 — Claude Code Memory V2

### Objective

Crear una V2 del tutorial `claude-code-memory` con mejor ritmo, mayor claridad visual y una propuesta más adecuada para consumo rápido en LinkedIn.

### Scope

- Reescribir la narrativa del vídeo para reducir su duración total.
- Mejorar la jerarquía visual de las escenas más densas.
- Mantener la identidad visual personal del tutorial mientras se mejora el ritmo y la claridad.
- Mantener el tutorial dentro del sistema actual de composiciones y escenas reutilizables.

### Acceptance Criteria

1. La duración total del tutorial queda por debajo de 100 segundos.
2. El hook inicial comunica el beneficio principal en menos de 6 segundos.
3. La escena de terminal y las escenas de memoria muestran menos texto por pantalla que la versión anterior.
4. El bloque de los tres sistemas muestra relaciones visuales entre conceptos.
5. Auto Dream deja de ser el bloque dominante del vídeo y pasa a ser una explicación breve y clara.
6. El cierre tiene una CTA más clara que la versión anterior.
7. El config sigue validando con el esquema actual y la composición renderiza sin cambios estructurales fuera del sistema existente.

### Test Cases

1. Ejecutar `npm run lint` sin errores.
2. Renderizar fotogramas representativos del tutorial y comprobar:
   - legibilidad del hook
   - legibilidad de terminal
   - claridad del file explorer
   - conexión visual en el diagrama de 3 bloques
   - cierre con CTA clara
3. Verificar que el `config.json` actualizado reduce la duración total esperada.

---

## 2026-03-28 — Pixel Logo Map

### Objective

Convertir un logo raster a un mapa de píxeles reutilizable para Remotion, con una estética más cercana a pixel art tradicional que a un simple pixelado automático.

### Scope

- Incorporar el logo fuente al repositorio como asset reutilizable.
- Generar un mapa de píxeles serializable y editable desde TypeScript.
- Crear un componente de Remotion que pinte el sprite y soporte animaciones básicas.
- Añadir una composición de preview para validar el resultado visual.

### Acceptance Criteria

1. Existe un asset fuente accesible desde el proyecto.
2. Existe un mapa de píxeles tipado exportado desde `src`.
3. El mapa usa una paleta cerrada con transparencia y varios niveles de gris.
4. Existe un componente reutilizable que renderiza el logo como pixel art.
5. Existe una composición de preview que permite inspeccionar el sprite en Remotion Studio.
6. `npm run lint` pasa sin errores.

### Test Cases

1. Ejecutar `npm run lint`.
2. Ejecutar el script generador y verificar que produce el mapa y un preview SVG.
3. Abrir la composición de preview y comprobar que:
   - el logo mantiene la silueta principal
   - se lee como pixel art y no como imagen degradada
   - las animaciones básicas funcionan sin artefactos

---

## 2026-03-28 — Pixel Logo Video Integration

### Objective

Integrar el logo en pixel art dentro del tutorial `claude-code-memory` como una primera prueba visual dentro del vídeo final.

### Scope

- Extender el esquema del tutorial para permitir un logo pixel opcional en escenas compatibles.
- Integrar el logo en la escena de intro con animación sutil.
- Activar la integración en `tutorials/claude-code-memory/config.json`.

### Acceptance Criteria

1. La escena de intro puede renderizar opcionalmente el logo pixel art.
2. La configuración del tutorial de memoria activa esa opción.
3. El logo aparece integrado sin tapar título ni subtítulo.
4. `npm run lint` pasa sin errores.

### Test Cases

1. Ejecutar `npm run lint`.
2. Renderizar un still del tutorial y comprobar que el intro muestra:
   - logo visible
   - composición equilibrada
   - texto legible

---

## 2026-03-28 — Editorial Direction Sync

### Objective

Añadir una capa de dirección editorial y sincronía entre guion, audio y animación para que los vídeos tengan mejor ritmo, intención narrativa y respiración visual.

### Scope

- Definir un modelo compartido de `brief`, `timing` y `beats` dentro del `config.json`.
- Mantener compatibilidad hacia atrás con configs existentes.
- Actualizar runtime para respetar delays de audio y duraciones dirigidas.
- Introducir utilidades comunes para trabajar con milisegundos, beats y offsets.
- Aplicar la primera adopción en `claude-code-memory`.
- Crear una nueva skill `remotion-director` y actualizar las skills generadoras existentes.

### Acceptance Criteria

1. `ClaudeCodeTutorial` y `ProductShort` aceptan `brief`, `timing` y `beats` en schema.
2. `voiceover.scenes` acepta tanto string legacy como objeto con `text` y timing opcional.
3. El runtime calcula duración por escena usando lead-in, delay de audio y tail hold cuando existen.
4. El audio puede empezar más tarde que el frame 0 de la escena.
5. `claude-code-memory` usa el nuevo sistema en intro, outro y al menos una escena central.
6. Existe una skill `remotion-director` documentada y las skills generadoras la integran en su flujo.
7. Los configs antiguos siguen validando y renderizando.

### Test Cases

1. Ejecutar `npm run lint`.
2. Renderizar un still del intro de `claude-code-memory` y comprobar pausa inicial + logo + título antes de la voz.
3. Renderizar el vídeo completo `tutorials/claude-code-memory/output.mp4`.
4. Validar un still de `ProductShort` con timing compatible en runtime.
5. Verificar que un config legacy sin `brief`, `timing` ni `beats` sigue seleccionando composición sin error.

---

## 2026-03-28 — Terminal Pacing and ElevenLabs Controls

### Objective

Hacer que las escenas de terminal pierdan menos tiempo en typing lento y exponer controles útiles de ElevenLabs directamente en `config.json` para afinar la locución desde el propio guion.

### Scope

- Acelerar el streaming de Claude/Codex respecto al typing humano en `TerminalScene`.
- Mantener compatibilidad con escenas terminal existentes.
- Extender el schema de `voiceover` con opciones globales y overrides por escena para ElevenLabs.
- Hacer que el script de generación de voz use esos parámetros.
- Actualizar las skills para documentar el uso correcto de ElevenLabs y el nuevo pacing del terminal.

### Acceptance Criteria

1. Las líneas `claude` se renderizan más rápido que las líneas `command`.
2. Los configs existentes de terminal siguen funcionando sin cambios.
3. `voiceover.elevenlabs` acepta ajustes globales útiles y `voiceover.scenes[n].elevenlabs` acepta overrides.
4. El script de voiceover convierte esos ajustes al payload real de ElevenLabs.
5. Las skills y reglas internas reflejan el comportamiento nuevo.

### Test Cases

1. Ejecutar `npm run lint`.
2. Verificar que un config legacy con strings en `voiceover.scenes` sigue validando.
3. Verificar que un config con `provider: "elevenlabs"` y sin overrides sigue generando usando defaults razonables.

---

## 2026-05-08 — Deepagent Human Review Frontend

### Objective

Mejorar el frontal web de interacción con el deepagent para que el humano vea, durante el streaming y en los checkpoints, los artefactos creativos y técnicos relevantes: pensamiento operativo resumido, validaciones, escaleta, dirección, carta de sonido/audio y guion/voiceover.

### Scope

- Capturar outputs relevantes de herramientas como artefactos consultables del agente.
- Mostrar tarjetas legibles para validaciones y audio chart.
- Enriquecer las tarjetas existentes de escaleta, dirección y sonido.
- Soportar `audio_chart_checkpoint` además de `sound_chart_checkpoint`.
- Mantener fallback JSON para checkpoints desconocidos.

### Acceptance Criteria

1. El streaming muestra una línea de pensamiento/actividad del agente más legible que el texto parcial recortado.
2. Los outputs relevantes de herramientas se capturan como eventos consultables del agente.
3. Los checkpoints de escaleta, dirección, audio/carta de sonido y validación tienen tarjetas legibles para humano.
4. La escaleta muestra guion/voz si está disponible en la escena o en el checkpoint.
5. La carta de sonido soporta tanto `sound_chart_checkpoint` como `audio_chart_checkpoint`.
6. Los checkpoints desconocidos siguen teniendo fallback JSON aprobable.
7. La UI compila con TypeScript.

### Test Cases

1. `escaleta_checkpoint` con escenas muestra tabla de escenas, duración total y guion por escena si existe.
2. `direction_checkpoint` con warnings y beats muestra avisos y resumen de dirección por escena.
3. `audio_chart_checkpoint` con `voiceover` y `sound_design` muestra voz, música, SFX y guion de locución.
4. Resultado de `validate_config` con errors/warnings/recommendations aparece como artefacto de validación en el stream.
5. Tool output no JSON se muestra como artefacto de texto sin romper la UI.

---

## 2026-05-08 — Frontend Stream Polish And Duration Defaults

### Objective

Corregir los problemas visuales del frontal durante una ejecución real del deepagent y ajustar el criterio por defecto del copywriter para que los vídeos educativos no salgan como micro-piezas de 30-40 segundos cuando el usuario pide un tema amplio.

### Scope

- Ocultar burbujas de agente completado sin herramientas, artefactos ni texto útil.
- Deduplicar herramientas y artefactos equivalentes.
- Quitar el preview negro de la tarjeta de escaleta.
- Cambiar los templates tutoriales a 90-180 segundos.
- Añadir guardrail de auditoría para tutoriales por debajo de 90 segundos.

### Acceptance Criteria

1. No se muestran burbujas de agente completado sin herramientas, artefactos ni texto útil.
2. Las herramientas repetidas no generan ruido visual innecesario.
3. Los artefactos de validación duplicados se deduplican antes de pintarse.
4. La tarjeta de escaleta no muestra un player negro cuando la propuesta todavía no es un config renderizable completo.
5. El copywriter usa 90-180 segundos como duración educativa por defecto si el usuario no pide explícitamente un short.
6. La auditoría editorial avisa cuando un tutorial educativo queda por debajo de 90 segundos.
7. La UI compila con TypeScript.

### Test Cases

1. Stream con subagente sin contenido útil no muestra bubble vacía.
2. Dos outputs iguales de `validate_config` / `audit_content_quality` muestran un solo artefacto equivalente.
3. Escaleta con escenas terminal/custom parciales no muestra rectángulo negro de preview.
4. Prompt “vídeo educativo sobre Claude Code” hace que el agente reciba instrucción explícita de generar 90-180 segundos por defecto.

---

# Ponytail video-production flow

## Status

Completed — doctrine, deterministic silence cut, and regression evidence landed

## Problem

The real browser-operated cascade completed safely, but normal production performed work that added no creative or technical value. An explicitly silent brief still invoked Audio Planner, presented CP3, generated a second semantically equivalent config, rendered the same ordered stills again, called multimodal QA again, and required another human approval.

The pipeline currently optimizes for completing every canonical stage. It should instead stop at the first production rung that satisfies approved intent while preserving trust boundaries, human criterion, and recoverable side effects.

## Ponytail production ladder

For every video, scene, asset, model call, checkpoint, render, and revision, stop at the first rung that holds:

1. **Does this output need to exist?** Skip speculative or already-satisfied work.
2. **Is there an approved artifact that already satisfies it?** Reuse exact content and lineage.
3. **Does a registered scene, active recipe, local asset, or deterministic parent rule cover it?** Use that before a specialist.
4. **Is creative judgment unresolved?** Invoke only the specialist that owns that uncertainty.
5. **Is new evidence required?** Render the smallest evidence capable of detecting the relevant failure.
6. **Did the human-approved quality bar pass?** Stop; do not optimize a passing video without a new request.
7. **Only then:** evolve a renderer or capability through conventional engineering review.

Validation, data-loss prevention, security, accessibility, exact external-effect reconciliation, and explicit human approvals at real authority boundaries are never simplified away.

## Current-flow audit

| Stage                                             | Classification                                                   | Current decision                                                                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Intake and target resolution                      | Required trust boundary                                          | Keep; ask only unresolved fields.                                                                                         |
| Research                                          | Conditional                                                      | Existing deterministic skip already follows Ponytail.                                                                     |
| Copywriting / CP1                                 | Human criterion                                                  | Keep for now; bundling with direction needs separate UX evidence.                                                         |
| Scene capability resolution                       | Conditional                                                      | Existing registered/composed/gap routing stays.                                                                           |
| CP4 and recipe adoption                           | Conditional authority                                            | Keep separate when reusable capability adoption is requested. Evaluate direct one-video Visual Program later.             |
| Direction / CP2                                   | Human criterion                                                  | Keep for now; do not merge without evidence that one approval is sufficient.                                              |
| Draft config                                      | Deterministic projection                                         | Keep while Configurator remains; later replace model work only with measured compiler coverage.                           |
| Scene QA                                          | Conditional evidence                                             | Keep for visual changes and novel temporal scenes. Reusing QA across visual-equivalent configs is a later generalization. |
| Audio planning / CP3                              | **Deterministic when all explicit preferences are `none`**       | Implement now: no model and no duplicate approval.                                                                        |
| Voice and sound assets                            | Conditional side effect                                          | Existing silent skip remains.                                                                                             |
| Final config                                      | **Unnecessary when draft config is already semantically silent** | Implement now by normalizing disabled sound design to absent config audio.                                                |
| Final validation and render                       | Required production evidence                                     | Keep.                                                                                                                     |
| Technical review, human final review, publication | Required authority/side-effect boundary                          | Keep.                                                                                                                     |

## First implementation slice

When the approved `ProductionBrief` explicitly provides all three audio preferences as `none`:

- do not create an Audio Planner session;
- parent-create the existing valid canonical silent `AudioChart`;
- persist it approved in the existing `audio_chart` artifact kind;
- complete the existing `audio_plan` step in the same journaled action;
- emit normal artifact/plan events, but no audio checkpoint;
- consider config `voiceover: null|undefined` equivalent to chart `voiceover: null`;
- consider config `soundDesign: null|undefined` equivalent to a chart whose sound design is disabled with no music or SFX;
- reuse the current draft config, QA, and QA lineage rather than generating a final config and rerunning stills/QA;
- continue through silent asset production, final validation, render, final review, and publication unchanged.

All other audio combinations keep the existing specialist and CP3 flow.

## Acceptance criteria

- [x] Explicit all-silent preferences execute zero Audio Planner model sessions.
- [x] The parent persists one valid approved silent `audio_chart` artifact and completes `audio_plan` atomically with `run_audio_planner` success.
- [x] No `audio_chart_checkpoint` is presented for explicit silence.
- [x] A draft config with absent/null audio is accepted as containing the approved disabled audio chart.
- [x] The pipeline does not derive `generate_final_config` for that case.
- [x] The same config and QA artifacts proceed to final validation; no second config or QA version is created.
- [x] Silent asset production performs no paid/provider audio call.
- [x] Optional or required voice/music/SFX still invoke Audio Planner and CP3 exactly as before.
- [x] No new table, action, scheduler, worker, lease, dependency, or persisted view is added.
- [x] Existing CP1, CP2, CP4/adoption, QA-rejection, final-review, and publication authority remains unchanged.

## Test cases

1. Run the parent integration path with all audio preferences explicitly `none`; assert the injected Audio Planner factory is never called.
2. Assert one approved canonical silent chart, no checkpoint, completed `audio_plan`, and succeeded action attempt.
3. Given a draft config with `voiceover: null` and `soundDesign: null`, derive `produce_audio_assets` rather than `generate_final_config` after the silent chart exists.
4. In the mocked Pi-only E2E, assert deterministic audio creates no additional config or QA version beyond those already required by creative revisions.
5. Run an optional-audio fixture and assert the existing unapproved chart plus CP3 presentation path remains unchanged.
6. Restart after deterministic silence and derive the same next action without another artifact or model call.

## Deferred audit findings

- Bundle CP1 and CP2 into one editorial approval only after browser evidence proves no loss of useful human control.
- Support direct one-video Visual Programs without reusable-recipe adoption when reuse is explicitly unnecessary.
- Introduce a general visual-equivalence projection only after more than the silent-audio case demonstrates the same waste.
- Replace Configurator model calls only when a deterministic target compiler covers observed production inputs.
- Reduce full-scene multimodal QA to novel/changed scenes only after visual identity is explicit and tested.

## Non-goals

- Changing the canonical plan shape.
- Removing any trust-boundary validation.
- Relaxing recipe, checkpoint, render, review, or publication lineage.
- Reworking non-silent audio generation or provider receipts.
- Adding adaptive orchestration infrastructure.

---

# Human-friendly generic checkpoints

## Status

Completed — discovered and verified during the live explicit-silence proof

## Problem

Intake and target clarification checkpoints exposed complete internal artifacts and the target registry as JSON. The user had to inspect implementation data to find one question, while `Aprobar` and `Pedir cambios` did not describe a clarification action. The later final-review checkpoint also appeared as `Revisión pendiente` with decision-relevant media facts hidden in JSON.

## Implemented decision

The existing checkpoint payload and feedback endpoint remain unchanged. Generic checkpoint presentation now:

- renders focused clarification questions prominently;
- shows requested and supported values;
- opens one answer field with a single `Responder` action;
- omits the full registry from sanitized technical details;
- keeps technical payloads collapsed;
- gives QA and final-review checkpoints human Spanish titles;
- shows final render pass state, codec, dimensions, FPS, duration, and warnings before technical details;
- propagates checkpoint type through active and resolved artifact hydration.

No form framework, checkpoint schema, API, persistence model, or authority path was added.

## Acceptance evidence

- [x] The same paused live thread displayed one focused clarification and continued after its answer.
- [x] The registry was absent from the default and technical presentation projection.
- [x] Clarification used `Responder` with no approve/reject actions.
- [x] Non-clarification checkpoints retained approve/request-changes authority.
- [x] Final review displayed `Correcto`, H.264, 1280×720, 30 fps, and 9.05/9 s without opening JSON.
- [x] Web authority tests, TypeScript build, ESLint, and browser verification passed.

---

# Live thread completion convergence

## Status

Completed — root fix and live snapshot recovery verified

## Problem

The real silent production completed render, review, publication, and all 13 plan steps, while the browser continued showing `Procesando...`. The persisted thread was correctly `idle` and the browser DOM already contained the video and download link. Terminal canonical completion changed `running → idle` without publishing an event, so the live frontend could not clear its loading state.

## Implemented decision

`PiAgentRuntime.sendMessage()` now publishes the existing persisted `agent_end` event with `{ willRetry: false, reason: "canonical_complete" }` exactly when canonical work returns with the thread still `running` and the parent transitions it to `idle`.

Checkpoint pauses remain `waiting` and emit no terminal completion. Failures continue using `error`. The solution reuses the event log, transactional outbox, SSE replay, and existing frontend terminal handler; it adds no polling, scheduler, table, lease, or derived frontend authority.

## Acceptance evidence

- [x] Pi-only E2E asserts no terminal event at checkpoint pauses.
- [x] Final publication leaves the thread `idle` with exactly one final `agent_end`.
- [x] Existing render/publication idempotency remains unchanged.
- [x] Historical thread `5065f045-306b-4fbb-a79e-191287fbaeae` recovered from its revision-148/event-80 snapshot without another render or publication.
- [x] Browser showed `Completado`, ready video/download, and no `Procesando...`.
- [x] Agent Pi 260/260, scene contracts 28/28, render service 12/12, web authority 4/4, Visual Program renderer 3/3, typechecks, lint, build, and diff checks passed.

---

# Feature: Pi model routing and Google media authentication

## Status

Completed.

## Problem

The Pi runtime must not use Gemini for text-only orchestration, research, writing, direction, planning, configuration, or validation. Those tasks should use the existing Azure OpenAI Luna/Sol deployments. Gemini remains necessary for Google media capabilities, currently image-grounded Scene QA and Gemini voice generation, and must authenticate in Docker with a Google service-account file rather than a Gemini API key.

The current Compose defaults name `openai-codex` routes that do not load the repository user's Azure deployment catalog, route Scene QA to Sol, do not mount Pi's `models.json`, and do not mount the Google service account into `agent-pi`.

## Scope

- Give every text-only Pi task an explicit Azure OpenAI Luna or Sol default.
- Route image-grounded Scene QA to a supported Google Vertex multimodal model.
- Mount Pi's model catalog and the configured Google service-account file read-only in `agent-pi`.
- Pass the Azure and Google environment required by their providers.
- Keep Gemini voice generation using the same service-account credential.
- Fail startup diagnostics when a configured route cannot be resolved.

Voice generation preserves the former DeepAgent path: Gemini TTS `gemini-3.1-flash-tts-preview` through Vertex service-account ADC. This is text-to-speech, not a generic transcription/Whisper stage.

## Acceptance criteria

- [x] Main, intake, research, narrative, direction, audio planning, scene creation, configuration, and validation default only to `azure-openai/gpt-5.6-luna` or `azure-openai/gpt-5.6-sol`.
- [x] Scene QA defaults to `google-vertex/gemini-2.5-flash` and accepts image inputs.
- [x] No text-only default route uses `google` or `google-vertex`.
- [x] `agent-pi` receives the Azure OpenAI key/settings, Pi model catalog, Google project/location, and a read-only service-account path.
- [x] The service-account JSON is never copied into an image or committed.
- [x] Model route validation reports unresolved configured routes clearly.
- [x] Existing explicit `CLAQUETA_PI_MODEL_*` overrides remain supported.
- [x] Gemini TTS still receives `GOOGLE_APPLICATION_CREDENTIALS` inside `agent-pi`.

## Tests

1. Assert default routes select Azure Luna/Sol for every text-only task and Google Vertex only for Scene QA.
2. Assert explicit environment overrides still win.
3. Assert a missing configured model produces a useful route error.
4. Typecheck and run the full `agent-pi` test suite.
5. Build/start Compose and verify `agent-pi` resolves an Azure text model and Google Vertex Scene QA model without exposing credential contents.

## Result

Completed on 2026-07-23. The full 263-test suite and typecheck pass; Compose is healthy; Azure Luna completed a real Researcher smoke; Vertex Gemini inspected a real PNG and emitted a structured tool call through service-account ADC; Gemini TTS generated a real MP3 with the same mounted credential. Native-video analysis remains out of scope because that pipeline stage does not exist yet.

---

# Feature: Pi Gemini TTS parity with DeepAgent

## Status

Completed.

## Problem

DeepAgent generated the CP3-approved voiceover automatically with `gemini-3.1-flash-tts-preview` through Vertex service-account ADC. Pi already invokes the same generator, but an additional runtime guard rejects every non-empty voiceover before the generator can run.

## Scope

- Preserve CP3 as the human approval boundary.
- After approval, run the existing `scripts/generate-voiceover.ts` path automatically from Pi.
- Keep the same Gemini TTS model, voices, multi-speaker behavior, fingerprint cache, MP3 verification, and service-account authentication used by DeepAgent.
- Keep render audio generation disabled because Pi materializes and verifies audio before render.

## Acceptance criteria

- [x] An approved non-empty voiceover reaches `AudioAssetProducer` instead of failing on the former provider-receipt guard.
- [x] API generation defaults on after CP3 approval, while an explicit test/operator disable remains available.
- [x] Silent and local-music flows remain unchanged.
- [x] The generated MP3 paths are verified before the `audio_assets` artifact is committed.
- [x] Tests, typecheck, and a real Vertex TTS smoke pass.

## Result

Pi now follows the former DeepAgent path after CP3: it invokes the existing Gemini TTS generator automatically, preserves `gemini-3.1-flash-tts-preview`, Vertex ADC, voice/multi-speaker settings and fingerprint caching, verifies every expected MP3, and renders with audio regeneration disabled. The full 263-test suite and typecheck pass; a real Pi `AudioAssetProducer` smoke generated and verified a 9,453-byte MP3.

---

# Fix: Parent-owned audio lineage in draft configuration

## Status

Completed.

## Problem

The live Pi E2E failed immediately after CP2 because the draft configurator copied Gemini narration mentioned in direction before CP3 existed. Parent validation rejected it twice with `Config voiceover requires an approved audio artifact`, so the pipeline never reached Scene QA or audio planning.

## Decision

Project audio fields deterministically from parent-approved artifacts, exactly like approved scene props:

- before CP3, remove model-authored `voiceover` and `soundDesign` from the draft config;
- after CP3, overwrite both fields with the exact approved audio chart;
- keep validation as a final invariant check.

## Acceptance criteria

- [x] Draft config generation cannot introduce audio before CP3 and does not waste a repair turn for it.
- [x] Final config contains the exact CP3-approved voiceover and sound design even if the model proposes divergent values.
- [x] Existing config lineage, render-schema, and target validation remain unchanged.
- [x] Config tests and the live browser E2E proceed beyond the former failure.

---

# Fix: Repair invalid composed-scene props inside the copywriter session

## Status

Completed.

## Problem

The live Claqueta copywriter submitted a `composed-scene` with an unsupported `gap` value. The terminating tool accepted it, the child session ended, and only the parent later rejected the script, forcing a failed pipeline action instead of an in-session correction.

## Decision

Validate every submitted `composed-scene` props plan inside `submit_script`. Return the exact contract error as a non-terminating tool error so the same isolated copywriter can correct its structured output. Parent validation remains the final boundary.

## Acceptance criteria

- [x] Valid composed scenes terminate normally.
- [x] Invalid composed props do not get captured or terminate the session.
- [x] The tool returns the exact contract validation error.
- [x] Explicit retry resumes the failed copywriting action and reaches CP1.

---

# Fix: Unwrap approved custom component props at config boundary

## Status

Completed.

## Problem

Live Scene QA proved that an approved `code-block` plan shaped like a full scene wrapper (`{componentId, durationInSeconds, props:{...}}`) was copied wholesale into `scene.props`. Remotion therefore received nested props and rendered only line number `1` with YAML defaults instead of `edad = 25`.

## Decision

At the shared config adapter, when a custom scene's approved `propsPlan` is an exact wrapper for the same component and contains an object `props`, project only that inner `props` object. Preserve already-flat plans unchanged.

## Acceptance criteria

- [x] Wrapped custom plans become direct component props.
- [x] Flat custom plans remain byte-equivalent.
- [x] The regenerated E2E still shows `edad = 25`, title `nombre → valor`, and Python.

---

# Fix: Materialize persisted Pi config for Gemini TTS

## Status

Completed.

## Problem

The live E2E reached CP3 and final config, then Gemini TTS failed because Pi config artifacts are stored in SQLite with `path: null`, while the reused DeepAgent TypeScript generator accepts a config file path.

## Decision

When no artifact path exists, `AudioAssetProducer` writes the exact approved config to a private OS temporary directory, invokes the existing generator, and removes the temporary directory in `finally`. Existing path-backed calls remain unchanged.

## Acceptance criteria

- [x] Pathless approved configs reach Gemini TTS through an exact temporary JSON file.
- [x] Temporary files are removed on success and failure.
- [x] Existing path-backed generation remains unchanged.
- [x] The browser E2E generates and verifies all three MP3 files.

---

# Fix: Include scene-contracts workspace in render Docker image

## Status

Completed.

## Problem

The live Pi E2E reached Scene QA still rendering, but Remotion bundling failed because `@claqueta/scene-contracts` was installed as a workspace package while its exported source files were absent from the render-service image.

## Acceptance criteria

- [x] The render-service Docker image copies `packages/scene-contracts` after dependency installation.
- [x] Remotion can resolve the package export during still rendering.
- [x] The live E2E proceeds beyond Scene QA still generation.

---

# Fix: Complete the canonical research transition

## Status

Completed.

## Problem

A live Claqueta run completed and persisted required research, but left the canonical `research` step `in_progress`. The coordinator repeatedly derived `research_or_skip` until exhausting its transition budget instead of advancing to copywriting.

## Decision

A successful required-research parent action must atomically complete the `research` plan step, just as the no-research branch atomically skips it.

## Acceptance criteria

- [x] Required research persists one approved research artifact.
- [x] The same successful action marks `research` completed.
- [x] The next derived action is `run_copywriter`.
- [x] The failed browser flow recovers through the explicit retry endpoint.

---

# Fix: Vertex Scene QA structured tool completion

## Status

Completed.

## Problem

The live E2E delivered three real stills to Vertex Gemini, but Scene QA spent its response on extended internal reasoning and ended with a provider error before calling `submit_scene_qa_report`. The runner also ignored the configured task thinking level.

## Decision

Pass the Scene QA route's thinking level into `createAgentSession` and default this image-classification/reporting task to thinking `off`, preserving the strict structured tool and parent validation.

## Acceptance criteria

- [x] Scene QA applies its configured thinking level.
- [x] Default Scene QA route remains Vertex Gemini but uses `off` reasoning.
- [x] Unit tests verify propagation.
- [x] A real three-image schema smoke completes the tool call.
- [x] The browser E2E proceeds beyond Scene QA.

---

# Reuse approved Scene QA across audio-only config finalization

## Status

Completed.

## Problem

After CP3, Claqueta recompiles the final config with approved audio. A 22-scene production then reran the identical visual QA twice and Vertex could not return a complete structured report. The previously human-approved QA was tied to draft config v2, while final config v3 differed only in audio fields.

## Decision

Define a deterministic visual projection of config that excludes top-level `voiceover`/`soundDesign` and per-scene `voiceover`. If the latest approved QA lineage points to a config with the same visual projection, reuse that report and write fresh lineage to the final config instead of rerendering/reviewing unchanged visuals.

## Acceptance criteria

- [x] Audio-only config changes reuse the latest approved QA report.
- [x] Fresh QA lineage points to the exact final config/version/hash.
- [x] Any visual field change forces new still rendering and multimodal QA.
- [x] Reuse is recorded in action metadata/events and advances to audio production.
