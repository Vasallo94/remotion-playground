# Diseño — Claqueta Pi con paridad DeepAgents

**Fecha:** 2026-07-03  
**Estado:** Brainstorming / Draft  
**Spec:** `_project_specs/features/2026-07-03-pi-deepagents-parity.md`

## Objetivo

Convertir el aprendizaje del pipeline DeepAgents anterior en una arquitectura Pi-native para Claqueta. La meta es recuperar sus mejores capacidades —especialistas, skills, checkpoints ricos, audio, QA visual y review— sin volver a depender de LangGraph como runtime principal de la UI Pi.

La idea central: **Pi debe orquestar criterio creativo y ejecución técnica con trazabilidad visible**, no solo “hacer un config y renderizarlo”.

## Punto de partida

### Antes de Pi: DeepAgents

El runtime Python organizaba el trabajo así:

```text
Creative:
  researcher → copywriter ──CP1 escaleta──→ director ──CP2 direction──→ scene_qa

Production:
  audio_planner ──CP3 audio chart──→ voice_generator ∥ sound_engineer
                                      → scene_creator ──CP4 custom code?──→ validator ──CP5 warnings?──→

Delivery:
  render → reviewer ──CP6 final review──→ done
```

Características valiosas:

- Plan canónico en `/pipeline/plan.json` con pasos, owners, status, decisions y artifacts.
- Prompts especializados por agente.
- Skills obligatorias para calidad: catálogo de escenas, timing, dirección, audio, guías de marca.
- Checkpoints humanos donde hay criterio creativo.
- Tools técnicas para validar, generar assets, renderizar stills, copiar audio y revisar MP4.
- Disciplina de stop conditions y no modificar `config.json` directamente desde el humano.

### Ahora: `agent-pi` V1

`packages/agent-pi` ya tiene una base sólida:

- Pi SDK embebido.
- Express + SSE.
- SQLite para threads, artifacts y eventos.
- Tools cerradas con allowlist.
- Checkpoints de script y dirección.
- Validación/render/publicación.
- UI con `usePiVideoStream` y cards.

Pero aún es lineal y pobre en contexto:

- `ResourceLoader` devuelve skills/prompts/themes/context vacíos.
- No hay plan real en UI (`planState: null`).
- No hay especialistas ni subagents.
- El catálogo se lista, pero no guía ni valida suficientemente.
- `normalizeScene()` pierde `custom` y `normalizeTerminalLines()` inventa `/compact`.
- Audio, QA visual y reviewer están fuera.

## Principio de migración

No portar clases Python 1:1. Traducir responsabilidades:

| Capacidad antigua             | Forma Pi-native                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| SkillsMiddleware              | `ResourceLoader` + prompt de uso obligatorio + diagnostics                                |
| Subagents DeepAgents          | primero passes/prompt sections; después sesiones Pi/subprocesos si hace falta aislamiento |
| `/pipeline/plan.json` virtual | plan persistente por thread en SQLite/artifacts + SSE `plan_updated`                      |
| Interrupts LangGraph          | checkpoints `terminate: true` + `/api/pi/resume`                                          |
| Tools Python                  | tools TypeScript cerradas, wrappers de scripts existentes o render-service endpoints      |
| UI stream LangGraph           | SSE propio estable y replayable                                                           |

## Arquitectura objetivo

```text
packages/web
  usePiVideoStream
    - messages
    - checkpoint cards
    - planState real
    - event log real
    - subagent cards opcionales

packages/agent-pi
  AgentRuntimeManager
  ClaquetaResourceLoader
  PipelineStore / ArtifactStore / EventBus
  Orchestrator prompt Pi
  Tools:
    - pipeline plan
    - scene catalog
    - script/direction/audio/QA checkpoints
    - validation/render/review
    - optional subagent delegation

packages/render-service
  validate config
  render final MP4
  render stills endpoint/script (future)

content/tutorials/<slug>
  script.json
  script.md
  direction.json
  audio-chart.json
  qa-report.json
  review.json
  config.json
```

## Resource loading

### Opción A — `DefaultResourceLoader` con rutas adicionales

Usar el loader de Pi:

- `additionalSkillPaths`: `packages/agent/skills/**` o una copia curada en `packages/agent-pi/resources/skills`.
- `additionalPromptTemplatePaths`: prompts Claqueta adaptados.
- `agentsFilesOverride` o `appendSystemPromptOverride` para AGENTS/contexto.
- `systemPromptOverride` para mantener el prompt específico de Claqueta Pi.

Ventajas:

- Usa mecanismos estándar Pi.
- Menos código propio.
- Diagnostics de recursos ya existen.

Riesgos:

- Discovery demasiado amplio si apunta al repo entero.
- Skills antiguas pueden mencionar tools Python inexistentes.
- Hay que curar nombres y contradicciones.

### Opción B — Loader propio determinista

Implementar `ClaquetaResourceLoader` que lea solo rutas aprobadas y convierta skills/prompts a estructuras Pi.

Ventajas:

- Control total.
- Ideal para servidor web reproducible.

Riesgos:

- Reimplementa parte del loader Pi.
- Más mantenimiento.

### Recomendación

Slice inicial: `DefaultResourceLoader` con rutas explícitas y tests de diagnostics. Si hay demasiada contaminación de instrucciones, migrar a loader propio curado.

## Orquestación de especialistas

### Nivel 1 — Passes en un solo agente

El orquestador principal ejecuta fases y cambia de “rol” mediante prompt/tooling:

- `run_research_pass`
- `run_copywriter_pass`
- `run_director_pass`
- `run_audio_planner_pass`
- `run_scene_qa_pass`

Esto no da aislamiento real, pero es simple y suficiente para recuperar calidad si el plan y las skills están presentes.

### Nivel 2 — Agentes Markdown + tool de delegación

Inspirado en `examples/extensions/subagent` de Pi:

```text
.pi/agents/
  claqueta-researcher.md
  claqueta-copywriter.md
  claqueta-director.md
  claqueta-audio-planner.md
  claqueta-scene-qa.md
  claqueta-reviewer.md
```

Tool propuesta: `claqueta_subagent`.

- Ejecuta single/parallel/chain.
- Inyecta threadId y paths/artifacts permitidos.
- Publica `subagent_start`, `subagent_delta`, `subagent_tool`, `subagent_end`, `subagent_error` al EventBus.
- Devuelve output estructurado capado.

Ventajas:

- Aislamiento de contexto.
- Model routing por especialista.
- UI puede mostrar subagents de verdad.

Riesgos:

- Más coste y latencia.
- Cancelación y replay más complejos.
- Requiere adaptar auth/model config.

### Nivel 3 — SDK sessions internas

En vez de subprocesos, crear `AgentSession` internas desde Node para cada especialista.

Ventajas:

- Mejor integración con store/eventBus.
- Sin spawn externo.

Riesgos:

- Más código de lifecycle.
- Hay que replicar parte del ejemplo subagent.

### Recomendación

Empezar con Nivel 1 para recuperar calidad. Prototipar Nivel 2 con un especialista (`researcher` o `scene_qa`) antes de comprometer todos.

## Pipeline plan Pi-native

Nuevo contrato persistente:

```ts
interface PipelinePlan {
  id: string
  threadId: string
  mode: string
  goal: string
  status: "active" | "blocked" | "completed" | "failed"
  steps: PipelineStep[]
  decisions: PipelineDecision[]
  createdAt: string
  updatedAt: string
}

interface PipelineStep {
  id: string
  owner: string
  title: string
  status: "pending" | "in_progress" | "completed" | "blocked" | "skipped" | "failed"
  summary: string
  artifactPaths: string[]
  blockers: string[]
  startedAt?: string
  completedAt?: string
  modelRoute?: string
}

interface PipelineDecision {
  id: string
  checkpointId: string
  stepId: string
  status: "approved" | "changes_requested" | "selected" | "skipped"
  summary: string
  payload?: unknown
  createdAt: string
}
```

SSE nuevos o enriquecidos:

- `plan_updated`
- `subagent_start`
- `subagent_update`
- `subagent_end`
- `subagent_error`

Los eventos existentes se mantienen para compatibilidad.

## Visual planning

La escaleta debe dejar de ser una lista de escenas genérica. Cada escena propuesta debe ser una decisión visual explícita:

```ts
interface VisualScenePlan {
  id: string
  title: string
  narrativeRole: "hook" | "problem" | "explanation" | "demo" | "proof" | "takeaway" | "summary" | string
  visibleContent: string
  voiceover?: string
  visualType: "builtin" | "custom"
  sceneType?: "intro" | "terminal" | "callout" | "outro"
  componentId?: string
  visualRationale: string
  catalogFit: {
    bestFor: string[]
    avoidWhenChecked: string[]
  }
  durationInSeconds: number
  requiredAssets: string[]
  missingCapabilities: string[]
  riskNotes: string[]
}
```

Reglas:

- No recetas hardcodeadas por tipo de vídeo.
- El catálogo sugiere posibilidades, pero cada elección se justifica por la función narrativa.
- Terminal solo si hay comando/salida real o workflow CLI real.
- `custom` debe usar `componentId` registrado y props compatibles.
- Si falta un componente, se marca como `missingCapabilities`, no se inventa.

## Catálogo usable

Mejoras necesarias:

1. `list_scene_catalog` debe devolver resumen accionable y, opcionalmente, prop contracts por `componentId`.
2. `generate_remotion_config` debe preservar:
   - `{ type: "custom", componentId, props, durationInSeconds }`
   - timing/beats compatibles.
3. Si un componente no está registrado, el pipeline decide:
   - cambiar a alternativa existente,
   - bloquear para CP4/scene_creator,
   - o pedir permiso para `code_evolution`.

## Audio/QA/review

### Audio

- `audio_planner` propone voiceover + música + SFX.
- Checkpoint `audio_chart_checkpoint` antes de generar assets.
- `voice_generator`: wrapper de Gemini TTS/scripts existentes.
- `sound_engineer`: solo librería local al principio.

### Scene QA

- Render still al 60% de cada escena.
- Payload multimodal con 5 capas: video context, scene audio, scene config, narrative context, still.
- Output por escena: score, verdict, issues, suggested props.
- MINOR_FIX puede retroalimentar copywriter/director; MAJOR_ISSUE requiere checkpoint.

### Reviewer

- Verifica MP4 final con ffprobe: tamaño, duración, audio stream si aplica.
- CP6 para aceptar/rechazar resultado final.

## Seguridad

- Mantener allowlist V1 para generación de vídeo.
- `scene_creator` requiere frontera separada: allowlist ampliada solo para `src/compositions/**`, `src/shared/customSceneRegistry.ts`, tests y docs, con checkpoint CP4.
- No exponer tokens/API keys en eventos ni artifacts.
- Subagents proyecto solo en repos confiables; si se usa `.pi/agents`, no cargar fuera del repo sin control.

## Roadmap por slices

1. **S0 — Telemetry/catálogo seguro:** eventos a UI, sin `/compact`, preservar custom.
2. **S1 — Visual planning:** checkpoint enriquecido y ScriptCard.
3. **S2 — ResourceLoader:** skills/prompts Claqueta en Pi con diagnostics.
4. **S3 — Pipeline plan:** SQLite + tools + `plan_updated`.
5. **S4 — Especialistas básicos:** researcher/copywriter/director como passes.
6. **S5 — Audio:** audio chart + voice/sound assets.
7. **S6 — QA/reviewer:** stills, reporte, ffprobe.
8. **S7 — Subagents aislados:** si hace falta calidad/contexto.
9. **S8 — Scene creation/code evolution:** crear React con CP4 y gates.

## Preguntas abiertas

- ¿Queremos copiar/curar skills antiguas a `packages/agent-pi/resources/skills` o referenciar `packages/agent/skills` directamente?
- ¿Debe el plan de pipeline ser artifact versionado, tabla SQLite normalizada o ambos?
- ¿Qué modelo local disponible se usa por defecto para subagents si `anthropic` no tiene API key y `openai-codex` sí?
- ¿Audio generation debe seguir detrás de `CLAQUETA_PI_ALLOW_AUDIO_GENERATION=true`?
- ¿Scene QA multimodal usará proveedor Pi o una integración propia con Gemini?
- ¿Cuándo se retira el runtime LangGraph o queda como legacy indefinido?
