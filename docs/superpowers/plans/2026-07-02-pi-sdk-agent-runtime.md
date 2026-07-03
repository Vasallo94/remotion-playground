# Pi SDK Agent Runtime Implementation Plan

**Goal:** Implementar el primer runtime Pi-native de Claqueta para generar `ClaudeCodeTutorial` desde la UI/chat con guion editable, dirección técnica revisable, validación Zod, render automático y artifacts persistentes.

**Spec:** `_project_specs/features/2026-07-02-pi-sdk-agent-runtime.md`

**Design:** `docs/superpowers/specs/2026-07-02-pi-sdk-agent-runtime-design.md`

**ADR:** `docs/adr/0017-pi-sdk-agent-runtime.md`

---

## Task 1: Preparar paquete `agent-pi`

- [x] Crear `packages/agent-pi/` con `package.json`, `tsconfig.json` y `src/index.ts`.
- [x] Añadir scripts `dev`, `typecheck` y `test`.
- [x] Añadir dependencias: Pi SDK, servidor HTTP, SSE y SQLite ligera.
- [x] Verificar que el workspace compila sin tocar el runtime actual.

## Task 2: Persistencia de threads, artifacts y sesiones Pi

- [x] Diseñar SQLite mínima: `threads`, `artifacts`, `events`, `pi_sessions`.
- [x] Crear store para asociar `threadId` con sesión Pi y artifacts.
- [x] Guardar snapshots de `script`, `direction`, `config` y render jobs.
- [x] Tests de crear/recuperar thread y artifacts.

## Task 3: Sesión Pi y normalización de eventos

- [x] Crear `createClaquetaPiSession()` con Pi SDK.
- [x] Configurar modelo mediante router/env, no hardcodear un único provider.
- [x] Normalizar eventos Pi a eventos SSE propios: `message_delta`, `tool_start`, `tool_end`, `checkpoint`, `artifact_updated`, `render_status`, `error`, `agent_end`.
- [x] Tests de normalización con fixtures.

## Task 4: API SSE y endpoints de chat

- [x] Exponer `POST /api/pi/chat` para enviar mensajes.
- [x] Exponer `POST /api/pi/resume` para decisiones de checkpoints.
- [x] Exponer `GET /api/pi/events/:threadId` como stream SSE.
- [x] Manejar reconexión básica y replay desde SQLite.

## Task 5: Policy de escritura y paths

- [x] Implementar allowlist en código para `content/tutorials/**`, `.generated/**`, `public/audio/**`, `public/voiceover/**`.
- [x] Rechazar traversal, symlinks fuera y rutas absolutas no permitidas.
- [x] Tests de rutas válidas e inválidas.

## Task 6: Tools cerradas V1

- [x] `list_scene_catalog`.
- [x] `list_existing_configs`.
- [x] `load_existing_config`.
- [x] `save_script_artifact`.
- [x] `save_direction_artifact`.
- [x] `generate_remotion_config`.
- [x] `validate_video_config`.
- [x] `submit_render`.
- [x] `check_render_status`.
- [x] Tests de tools con render-service mockeado.

## Task 7: Checkpoints de guion y dirección

- [x] Definir payload `script_checkpoint` para card editable.
- [x] Definir payload `direction_checkpoint` para card revisable.
- [x] Implementar pause/resume de checkpoint en el backend.
- [x] Guardar cada versión de script/direction como artifact.

## Task 8: Prompt y passes internos

- [ ] Crear prompt Pi-native de orquestador para `video_generation`.
- [ ] Definir passes estructurados: `script_pass`, `director_pass`, `audio_pass`, `validator_pass`, `render_pass`.
- [ ] Reutilizar instrucciones útiles de las skills existentes de Claqueta.
- [ ] Forzar que `config.json` no se genere hasta aprobar guion y dirección.

## Task 9: Model routing por tarea

- [ ] Definir config por env/archivo para modelos por tarea.
- [ ] Soportar al menos tareas: narrativa, dirección, coding/config, validación, voz/TTS, efectos/audio.
- [ ] Fallback razonable al modelo principal si una ruta no está configurada.
- [ ] Registrar en trazabilidad qué modelo se usó en cada pass.

## Task 10: Frontend Pi-native

- [x] Crear hook `usePiVideoStream` basado en SSE.
- [x] Reemplazar el flujo de chat nuevo por eventos Pi, reutilizando componentes existentes cuando sirvan.
- [x] Crear/ajustar `ScriptCard` editable.
- [x] Crear/ajustar `DirectionCard` revisable.
- [x] Mantener `RenderResultCard` o equivalente para el MP4 final.
- [x] Permitir recuperar threads/artifacts al recargar.

## Task 11: Render y recuperación de errores

- [ ] Validar config antes de renderizar.
- [ ] Si falla validación/render, permitir un intento automático de reparación.
- [ ] Mostrar error y reparación intentada en UI.
- [ ] Render final y stills bajo demanda/fallo.

## Task 12: Vertical slice completo

- [ ] Desde UI: pedir tutorial `ClaudeCodeTutorial`.
- [ ] Editar/aprobar guion.
- [ ] Revisar/aprobar dirección técnica.
- [ ] Generar artifacts persistentes.
- [ ] Validar config.
- [ ] Renderizar MP4.
- [ ] Recuperar sesión tras reload.
- [ ] Documentar gaps para la siguiente iteración.

## Deferred / roadmap

- Preview avanzado de voz/audio.
- Clips cortos por escena para revisar timing y orden de aparición.
- `code_evolution` con branch/workspace/PR.
- Creación de escenas custom y cambios en `src/compositions/**`.
- Subsesiones Pi reales por especialista.
