# Diseño — Runtime agéntico con Pi SDK para Claqueta

## Objetivo

Rehacer el runtime agéntico de Claqueta sobre Pi SDK, empezando por mejorar la generación de vídeos desde la UI/chat. No se reescribe Claqueta entera: se conservan Remotion, schemas Zod, render-service, catálogo de escenas, contenido en `content/**`, modelo de checkpoints y principios de dirección creativa ya existentes.

La primera implementación se centra en `video_generation` para `ClaudeCodeTutorial`. El modo `code_evolution` queda diseñado como futuro: permitirá que Claqueta modifique su propio código mediante rama/workspace/PR, pero no entra en el primer slice.

## Decisiones de diseño

- La UI principal puede rediseñarse en profundidad alrededor de Pi; no necesitamos emular el shape actual de LangGraph.
- El chat sigue siendo el eje de la experiencia. Los artefactos aparecen como cards interactivas cuando ayudan a decidir.
- El primer vídeo objetivo es `ClaudeCodeTutorial`.
- Flujo V1: guion/escaleta editable, dirección técnica revisable, generación de config, validación y render automático.
- La escaleta se puede editar en campos principales y mejorar por chat; no habrá editor drag-and-drop completo en V1.
- La dirección técnica se muestra como card revisable no editable. El humano puede criticarla por chat y Claqueta debe regenerarla/mejorarla hasta aprobación.
- Persistir artifacts aprobados: `script.json`, `script.md`, `direction.json` y `config.json`.
- Guardar drafts en `.generated/` y copiar a `content/tutorials/<slug>/` cuando se apruebe el flujo.
- Audio V1: mantener soporte básico con library tracks y assets existentes. Preview/selección fina de voz/audio queda en roadmap.
- Preview visual V1: render final MP4 y stills por escena bajo demanda o ante fallo. Clips cortos por escena quedan en roadmap para diagnosticar timings y orden de aparición.
- Persistencia: SQLite propia ligera para threads/artifacts + sesiones Pi asociadas.
- Streaming backend-frontend: SSE.
- Orquestación V1: un agente Pi principal con passes estructurados (`director_pass`, `audio_pass`, `validator_pass`, `render_pass`, etc.), no subsesiones Pi reales.
- Escritura V1: permitir `content/tutorials/**`, `.generated/**`, `public/audio/**` y `public/voiceover/**`. Cambios en `src/compositions/**` quedan para `code_evolution`.
- Dirección técnica: dos niveles. `direction.json` contiene intención narrativo-técnica; `config.json` contiene props exactas Remotion validadas por Zod.
- Error recovery: un intento automático de corrección ante fallo de validación/render, con trazabilidad.
- Multi-provider: model routing configurable por tarea desde el inicio, porque distintas tareas se benefician de modelos/proveedores distintos.

## Flujo de usuario V1

1. El usuario pide un tutorial desde el chat.
2. Pi genera una escaleta/guion estructurado.
3. La UI muestra una card editable con título, objetivo, escenas, guion/voiceover, notas visuales y duración aproximada.
4. El usuario edita campos o pide cambios por chat.
5. Al aprobar, Pi genera una dirección técnica Remotion.
6. La UI muestra una card de dirección técnica: tipos de escena, duración, intención visual, timings, audio y riesgos.
7. El usuario aprueba o critica la dirección por chat.
8. Al aprobar, Pi genera `config.json`, valida contra schemas Zod y lanza render.
9. Si falla validación o render, Pi intenta corregir una vez y reporta el resultado.
10. Si el render termina, la UI muestra el MP4 y guarda artifacts persistentes.

## Arquitectura propuesta

```text
packages/web
  Chat UI Pi-native
  Cards: ScriptCard, DirectionCard, RenderResultCard
  SSE client

packages/agent-pi
  Pi SDK session manager
  SQLite thread/artifact store
  SSE event stream
  Tools cerradas
  Model router por tarea

packages/render-service
  Validación Zod
  Render Remotion
  Jobs y streaming de MP4

content/tutorials/<slug>
  script.json
  script.md
  direction.json
  config.json
```

## Modelo de eventos SSE

Eventos mínimos:

- `message_delta`: texto del agente.
- `tool_start`: una tool empieza.
- `tool_end`: una tool termina.
- `checkpoint`: card que requiere decisión humana.
- `artifact_updated`: script, direction, config o render job actualizado.
- `render_status`: progreso del render-service.
- `error`: error recuperable o fatal.
- `agent_end`: turno completado.

## Artifacts persistentes

### `script.json`

Fuente estructurada para la card editable.

Campos esperados: título, objetivo, audiencia, tono, escenas, voiceover por escena, notas visuales y duración aproximada.

### `script.md`

Export legible para humanos. No es la fuente de verdad, pero facilita revisión fuera de la UI.

### `direction.json`

Traducción narrativo-técnica aprobada: mapping de escenas a tipos de escena, intención visual, timings, assets, audio y riesgos.

### `config.json`

Fuente exacta para Remotion. Debe pasar validación Zod antes de renderizar.

## Tools V1

- `create_script_draft`
- `present_script_checkpoint`
- `save_script_artifact`
- `create_direction_draft`
- `present_direction_checkpoint`
- `save_direction_artifact`
- `generate_remotion_config`
- `validate_video_config`
- `submit_render`
- `check_render_status`
- `list_scene_catalog`
- `list_existing_configs`
- `load_existing_config`

Todas las tools de escritura aplican allowlist en código.

## Model routing inicial

El runtime debe permitir configurar tareas con modelos distintos:

- escritura narrativa/copy: modelo rápido y creativo configurable.
- escritura/modificación de código: modelo fuerte de coding configurable.
- TTS/voz: proveedor especializado, inicialmente Gemini TTS si está disponible.
- efectos de sonido: proveedor especializado, por ejemplo ElevenLabs si está disponible.
- validación/revisión: modelo barato/rápido o el mismo modelo principal según calidad.

No se fija un único proveedor en diseño. El router debe leer configuración por env o archivo local.

## Fuera de alcance V1

- Crear nuevas escenas o componentes React en `src/compositions/**`.
- Abrir ramas/PRs para modificar el propio código.
- Preview completo de clips por escena.
- Selector avanzado de voz/audio.
- Subsesiones Pi reales por especialista.
- Persistencia multiusuario robusta de producción.

## Roadmap explícito

- `code_evolution`: cambiar capacidades de Claqueta mediante branch/workspace/PR.
- Preview de clips por escena para revisar timing, orden de aparición y animaciones.
- Preview/selección de voz y audio antes del render final.
- Permitir crear nuevas escenas custom desde UI con revisión humana y PR.

## Criterio de éxito de la PoC

La PoC se considera completa cuando desde la UI se pueda crear un `ClaudeCodeTutorial` usando Pi: conversación, guion editable, dirección técnica revisable, config válido, render MP4, artifacts persistentes y sesión retomable.
