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
- Mantener `theme: "betelgeuse"` como default para tutoriales personales.

### No entra en el primer slice

- Reescribir Remotion, schemas Zod o render-service.
- Sustituir el runtime LangGraph por completo: `VITE_AGENT_RUNTIME=pi` sigue siendo el switch de activación.
- Crear escenas React nuevas desde `video_generation` sin checkpoint/allowlist ampliada. La creación de código queda como slice explícito de `code_evolution` o CP4.
- Audio full production obligatoria en el primer slice. Primero debe existir visual planning + telemetry fiable.

## Criterios de aceptación

### Slice 0 — Saneamiento inmediato

- [ ] `normalizeTerminalLines()` no inventa `/compact` ni outputs falsos; si una escena terminal no trae `lines`, la validación falla con error accionable o la escena se convierte usando contenido real aprobado.
- [ ] `normalizeScene()` preserva escenas `{ "type": "custom", "componentId": "..." }` cuando el `componentId` existe en `src/shared/scene-catalog.json`.
- [ ] El catálogo de escenas puede consultarse y la respuesta distingue claramente builtin vs custom, roles narrativos, duración y props esperadas cuando existan.
- [ ] `usePiVideoStream` convierte `tool_start`, `tool_end`, `checkpoint`, `artifact_updated`, `render_status`, `error` y `agent_end` en eventos visibles en `EventLog` con formato Betelgeuse `[hora] [nivel] mensaje`.
- [ ] `PipelineStepper` muestra un estado derivado de eventos Pi aunque aún no exista plan compartido completo.

### Slice 1 — Visual planning por escena

- [ ] `ScriptDraft`/checkpoint de guion incluye campos por escena: `narrativeRole`, `visualType`, `componentId`, `visualRationale`, `requiredAssets`, `missingCapabilities`, `estimatedDurationSeconds`.
- [ ] `ScriptCard` renderiza esos campos de forma revisable/editable sin exigir que el humano toque `config.json`.
- [ ] El prompt Pi prohíbe recetas hardcodeadas por tipo de vídeo y exige justificar la elección visual escena por escena usando el catálogo.
- [ ] Un E2E de tutorial no técnico o astronómico no genera terminales salvo que haya una razón explícita y contenido terminal real.

### Slice 2 — Skills/prompts dentro de Pi

- [ ] `packages/agent-pi` usa un `ResourceLoader` que carga skills/prompts de Claqueta o un loader propio equivalente con tests de discovery.
- [ ] Las guías mínimas disponibles para Pi son: `scene-catalog`, `video-best-practices`, `scene-timing-guide`, `remotion-director`, `brand-guidelines`, `gemini-tts`, `sound-engineer`.
- [ ] La sesión principal conserva el system prompt específico de Claqueta, pero puede incluir contexto/skills adicionales sin duplicar instrucciones contradictorias.
- [ ] Hay diagnóstico visible si una skill esperada no se carga.

### Slice 3 — Pipeline plan real

- [ ] Existe un plan persistente por thread en SQLite/artifacts con pasos, owners, status, summaries, artifacts, blockers y decisiones.
- [ ] Tools de Pi pueden crear/actualizar/leer el plan: `create_pipeline_plan`, `update_pipeline_step`, `record_pipeline_decision`, `get_next_pipeline_step` o equivalentes.
- [ ] La UI consume `plan_updated` o snapshots derivados y rellena `planState` en `usePiVideoStream`.
- [ ] Los checkpoints aprobados/rechazados quedan registrados como decisiones trazables.

### Slice 4 — Especialistas Pi sin perder control

- [ ] Cada especialista antiguo tiene una representación documentada en Pi: pass prompt, agent Markdown o sesión aislada.
- [ ] El orquestador Pi puede ejecutar al menos `researcher`, `copywriter` y `director` manteniendo artifacts intermedios (`brief`, `script`, `direction`, `config`).
- [ ] El modelo/ruta por tarea se registra en eventos o artifacts para trazabilidad.
- [ ] Si se usa aislamiento, los outputs de especialistas se devuelven estructurados y capados; la UI ve subagent start/end/error.

### Slice 5 — Audio, QA y review

- [ ] Hay checkpoint `audio_chart_checkpoint` con voz, música y SFX antes de generar assets.
- [ ] Gemini TTS y copia de librería local se ejecutan como pasos técnicos separados y trazables.
- [ ] `scene_qa` puede renderizar stills por escena y producir un reporte con `PASS`, `MINOR_FIX` o `MAJOR_ISSUE`.
- [ ] `reviewer` verifica MP4 final: existencia, tamaño, duración esperada y audio si procede.

### Slice 6 — Scene creation / code evolution

- [ ] Las escenas custom no registradas se tratan como bloqueo o como CP4 explícito, nunca como generación silenciosa.
- [ ] Si se habilita creación de escenas, opera con allowlist ampliada, lint/typecheck/validate, checkpoint humano y trazabilidad/ADR.

## Casos de test

### Unitarios backend Pi

- `normalizeTerminalLines({ type: "terminal" })` → no contiene `/compact`; devuelve error/fallback seguro según decisión implementada.
- `normalizeScene({ type: "custom", componentId: "block-diagram", props: {...} })` → preserva `type: "custom"` y `componentId`.
- `normalizeScene({ type: "custom", componentId: "no-existe" })` → falla con mensaje accionable o marca `missingCapabilities`.
- `createClaquetaResourceLoader()` con skills disponibles → `getSkills()` devuelve las skills esperadas.
- `create_pipeline_plan` + `update_pipeline_step` + replay SSE → conserva orden y status en SQLite.

### Integración UI

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
- Audio: activar Gemini TTS en Pi cuando `CLAQUETA_PI_ALLOW_AUDIO_GENERATION=true` o moverlo a un servicio separado.
- Scene creation: CP4 dentro de `video_generation` o modo `code_evolution` obligatorio.
