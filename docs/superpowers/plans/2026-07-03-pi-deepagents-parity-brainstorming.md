# Brainstorming Plan — Claqueta Pi DeepAgents Parity

**Goal:** Convertir la idea de “meter todas las skills y agentes de DeepAgent dentro de claqueta-pi y orquestarlos sabiamente” en una ruta de producto/arquitectura validable por slices.

**Spec:** `_project_specs/features/2026-07-03-pi-deepagents-parity.md`  
**Design:** `docs/superpowers/specs/2026-07-03-pi-deepagents-parity-design.md`

---

## Tesis de trabajo

Claqueta Pi no debe ser un único prompt enorme que genera configs. Debe ser un **orquestador Pi-native** con:

1. skills/prompts cargados como recursos,
2. plan persistente y visible,
3. checkpoints humanos ricos,
4. tools técnicas cerradas,
5. especialistas solo cuando aporten aislamiento real,
6. QA/Audio/Review como pasos trazables.

El orden importa: primero arreglar visibilidad y decisiones visuales; después meter más agentes.

---

## Resultado esperado del brainstorming

Al final de este plan deberíamos tener respuestas concretas a:

- Qué skills/prompts se cargan en Pi y cuáles se reescriben.
- Qué agentes antiguos se convierten en passes y cuáles en subagents aislados.
- Qué eventos necesita la UI para mostrar Pipeline/Log/Subagents real.
- Qué shape exacto tiene el checkpoint de visual planning.
- Qué herramientas mínimas desbloquean audio, QA y review.
- Qué riesgos de seguridad hay al permitir `scene_creator`.
- Cuál es el primer slice implementable en 1–2 sesiones.

---

## Workshop 1 — Auditoría de capacidades actuales

**Pregunta central:** ¿Qué tiene ya `agent-pi` y qué falta para recuperar calidad?

### Inputs

- `packages/agent-pi/src/session.ts`
- `packages/agent-pi/src/prompt.ts`
- `packages/agent-pi/src/tools.ts`
- `packages/agent-pi/src/events.ts`
- `packages/web/src/hooks/usePiVideoStream.ts`
- vídeo/config del eclipse como caso fallido

### Actividades

- [ ] Trazar flujo real actual desde chat hasta render.
- [ ] Listar cada evento SSE emitido y dónde se ve/no se ve en UI.
- [ ] Revisar tools actuales y marcar: conservar, ampliar, eliminar, reemplazar.
- [ ] Documentar fallbacks peligrosos (`/compact`, custom→callout, etc.).

### Output

- Tabla de gaps priorizados por impacto en calidad.
- Lista de fixes seguros para Slice 0.

---

## Workshop 2 — Escaleta visual y catálogo

**Pregunta central:** ¿Qué necesita ver el humano antes de aprobar una escaleta?

### Inputs

- `src/shared/scene-catalog.json`
- `packages/web/src/components/ScriptCard.tsx`
- Prompt antiguo `copywriter.md`
- Configs buenos/malos existentes

### Actividades

- [ ] Diseñar `VisualScenePlan` final.
- [ ] Elegir campos editables vs solo informativos.
- [ ] Definir cómo se muestran `missingCapabilities` y assets faltantes.
- [ ] Elegir reglas de conversión `VisualScenePlan → config.json`.
- [ ] Probar mentalmente con eclipse 2026 y tutorial `/plan`.

### Preguntas de criterio

- ¿Debe el usuario poder cambiar el `componentId` desde la card?
- ¿Qué pasa si el modelo propone una escena custom sin props válidas?
- ¿Cómo evitamos hardcodear recetas tipo “astronomía = timeline + map”?

### Output

- Shape definitivo del checkpoint de guion.
- Lista de validaciones de catálogo para `generate_remotion_config`.

---

## Workshop 3 — Skills y prompts dentro de Pi

**Pregunta central:** ¿Cómo cargamos conocimiento DeepAgents sin contaminar el runtime Pi?

### Inputs

- `packages/agent/skills/**/SKILL.md`
- `packages/agent/prompts/*.md`
- Pi SDK `DefaultResourceLoader`
- Ejemplo de resource loading en docs SDK

### Actividades

- [ ] Clasificar skills: reutilizar tal cual, adaptar, deprecar.
- [ ] Clasificar prompts: usar como agente Markdown, convertir a prompt snippet, descartar.
- [ ] Decidir ruta física: `packages/agent/skills` vs `packages/agent-pi/resources/skills`.
- [ ] Definir diagnostics obligatorios si falta una skill.
- [ ] Probar `DefaultResourceLoader` con `additionalSkillPaths` en test aislado.

### Output

- Inventario de recursos Pi.
- Decisión provisional de loader.
- Tests de discovery a implementar.

---

## Workshop 4 — Pipeline telemetry y UI

**Pregunta central:** ¿Qué eventos necesita la UI para dejar de fingir el pipeline?

### Inputs

- `packages/web/src/lib/planState.ts`
- `PipelineStepper`, `EventLog`, `SubagentCard`
- `packages/agent-pi/src/events.ts`
- Store SQLite actual

### Actividades

- [ ] Diseñar eventos `plan_updated` y `subagent_*`.
- [ ] Mapear tools existentes a estados de pipeline.
- [ ] Definir formato Betelgeuse de logs `[hora] [nivel] mensaje`.
- [ ] Decidir si `planState` se deriva de eventos o se recupera por snapshot.
- [ ] Diseñar replay tras reload sin duplicados.

### Output

- Contrato SSE actualizado.
- Plan de implementación UI/backend para Slice 0/3.

---

## Workshop 5 — Especialistas: pass, subagent o sesión SDK

**Pregunta central:** ¿Qué significa “meter agentes DeepAgent” en Pi de forma sensata?

### Opciones

| Opción                                     | Pros                                                               | Contras                                           | Uso recomendado                                          |
| ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------- |
| Passes en el agente principal              | Simple, rápido, menos moving parts                                 | Sin aislamiento de contexto                       | Primer slice de researcher/copywriter/director           |
| Tool `claqueta_subagent` con subprocess Pi | Aislamiento fuerte, modelo por agente, parecido al ejemplo oficial | Spawn, coste, cancelación, streaming más complejo | QA, research o revisión cuando el contexto crezca        |
| Sesiones SDK internas                      | Integración fina con store/SSE                                     | Más código propio                                 | Si subprocess se queda corto                             |
| Mantener Python DeepAgents detrás de Pi    | Reutiliza todo                                                     | Dos runtimes, difícil de depurar                  | Solo como fallback temporal, no como dirección principal |

### Actividades

- [ ] Elegir un agente piloto para aislamiento (`researcher` o `scene_qa`).
- [ ] Definir contrato input/output por agente.
- [ ] Definir cómo se registran coste/modelo/errores.
- [ ] Decidir si habrá `.pi/agents/*.md` versionados en repo.

### Output

- Decisión para el primer prototipo de especialista.
- Lista de agentes por nivel: pass vs subagent.

---

## Workshop 6 — Audio, QA visual y review

**Pregunta central:** ¿Qué mínimo recupera la cadena de producción sin hacerla frágil?

### Audio

- [ ] Diseñar `audio_chart_checkpoint` compatible con UI existente.
- [ ] Decidir si voiceover se genera en Pi o sigue en render-service/scripts.
- [ ] Mantener provider Gemini y librería local como defaults seguros.

### Scene QA

- [ ] Definir script/endpoint para render stills por escena.
- [ ] Elegir proveedor multimodal.
- [ ] Definir auto-fix de `MINOR_FIX` y checkpoint de `MAJOR_ISSUE`.

### Reviewer

- [ ] Wrapper `ffprobe` para duración/audio/tamaño.
- [ ] Card CP6 de review final.

### Output

- Roadmap Audio/QA/Review con tool list y checkpoints.

---

## Workshop 7 — Scene creator y frontera code_evolution

**Pregunta central:** ¿Cuándo puede Claqueta Pi escribir código React?

### Actividades

- [ ] Separar “necesito una escena custom” de “puedo crear una escena custom”.
- [ ] Definir CP4 y allowlist ampliada.
- [ ] Definir gates: lint, typecheck, validate config, render still.
- [ ] Decidir si requiere branch/workspace/PR.
- [ ] Definir ADR obligatoria por patrón nuevo de escena.

### Output

- Política de scene creation.
- Entrada de roadmap para modo `code_evolution`.

---

## Experimentos propuestos

### E1 — Custom preservation spike

**Objetivo:** `generate_remotion_config` preserva `custom/componentId` y falla si el componente no existe.

- Tests unitarios de `normalizeScene`.
- Config smoke con `block-diagram` o `timeline`.
- Validación Zod.

### E2 — Pi event log spike

**Objetivo:** `usePiVideoStream` llena `EventLog` y `PipelineStepper` solo con eventos actuales.

- Fixture SSE con `tool_start/tool_end/checkpoint/render_status`.
- Test de hook o componente.
- Screenshot UI.

### E3 — ResourceLoader spike

**Objetivo:** cargar skills de `packages/agent/skills` desde `agent-pi` con diagnostics.

- Test TS que instancia loader.
- Verificar presencia de `scene-catalog`, `video-best-practices`, `scene-timing-guide`.
- Verificar que `getSystemPrompt()` sigue siendo Claqueta Pi.

### E4 — Visual planning checkpoint spike

**Objetivo:** ampliar `ScriptDraft` y `ScriptCard` sin romper checkpoints existentes.

- Backward compatibility con scripts antiguos.
- Card muestra rationale y missing capabilities.
- Resume sigue guardando `script.json`/`script.md`.

### E5 — Specialist pilot spike

**Objetivo:** ejecutar un `researcher` Pi aislado o pass dedicado y devolver `/pipeline/brief.json`.

- Sin render.
- Eventos `subagent_start/end` visibles.
- Output estructurado capado.

---

## Roadmap recomendado

### Slice A — Fix visible quality debt

- Quitar `/compact` fallback.
- Preservar `custom`.
- Log/Pipeline desde eventos actuales.
- Script checkpoint con visual planning mínimo.

### Slice B — Skills y catálogo fiable

- ResourceLoader con skills.
- Prompt Pi actualizado para leer/usar skills.
- Tests de catálogo/prop contracts.

### Slice C — Plan compartido

- SQLite/artifact plan.
- Tools `create/update/record/get_next`.
- `plan_updated` + UI.

### Slice D — Especialistas básicos

- Researcher/copywriter/director como passes o agentes Markdown.
- Model routing por tarea visible.
- Brief/script/direction artifacts.

### Slice E — Producción y QA

- Audio chart.
- Voice/sound generation.
- Scene QA stills.
- Reviewer MP4.

### Slice F — Code evolution

- Scene creator CP4.
- Branch/workspace/PR.
- Gates y ADR.

---

## Primer backlog accionable

1. Escribir tests para `normalizeTerminalLines` sin `/compact`.
2. Escribir tests para preservar `custom/componentId`.
3. Añadir `pipelineEvents`/`toolEvents` derivados en `usePiVideoStream`.
4. Mostrar esos eventos en `EventLog` con Betelgeuse.
5. Ampliar `ScriptDraftSchema` con campos visuales opcionales.
6. Ampliar `ScriptCard` para renderizar visual planning.
7. Actualizar prompt Pi para exigir justificación visual por escena.
8. Añadir spike de `DefaultResourceLoader` con skills Claqueta.

---

## Criterio para cerrar el brainstorming

- [ ] Enrique aprueba el orden de slices.
- [ ] Queda decidido si el primer especialista aislado será `researcher` o `scene_qa`.
- [ ] Queda decidida la estrategia inicial de `ResourceLoader`.
- [ ] La spec de `_project_specs/features/` tiene criterios de aceptación suficientes para arrancar implementación.
- [ ] El primer slice se puede estimar y ejecutar sin reabrir toda la arquitectura.
