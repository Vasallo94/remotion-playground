# Runtime agéntico con Pi SDK

## Descripción

Migrar progresivamente el runtime agéntico de Claqueta a Pi SDK, empezando por el flujo de generación de vídeo desde la UI/chat. La primera entrega sustituye el flujo conversacional de `ClaudeCodeTutorial` por un runtime Pi-native con guion editable, dirección técnica revisable, validación Zod, render automático y persistencia de artifacts.

No se reescribe Claqueta entera. Se conservan Remotion, render-service, schemas Zod, catálogo de escenas, `content/**`, modelo de checkpoints y el principio de automatizar la ejecución sin delegar el criterio creativo.

Diseño completo: `docs/superpowers/specs/2026-07-02-pi-sdk-agent-runtime-design.md`.

## Criterios de aceptación

- [ ] Existe `packages/agent-pi/` como backend experimental TypeScript basado en Pi SDK.
- [ ] La UI usa eventos SSE del runtime Pi y deja de depender de LangGraph para el flujo nuevo.
- [ ] El chat sigue siendo el eje de la experiencia y muestra cards interactivas solo cuando aportan decisión o revisión.
- [ ] El usuario puede generar y editar una escaleta/guion estructurado para `ClaudeCodeTutorial`.
- [ ] El usuario puede aprobar la escaleta o pedir cambios por chat.
- [ ] Tras aprobar la escaleta, Pi genera una dirección técnica Remotion revisable.
- [ ] El usuario puede aprobar la dirección técnica o criticarla por chat para que Pi la mejore.
- [ ] Tras aprobar la dirección, Pi genera `config.json`, valida contra Zod y lanza render automáticamente.
- [ ] Si validación o render fallan, Pi intenta corregir una vez y deja trazabilidad del intento.
- [ ] Se persisten `script.json`, `script.md`, `direction.json` y `config.json` junto al vídeo aprobado.
- [ ] Los drafts intermedios viven en `.generated/` y solo se copian a `content/tutorials/<slug>/` al aprobar.
- [ ] La persistencia usa SQLite ligera para threads/artifacts y enlaza cada thread con su sesión Pi.
- [ ] La escritura del runtime V1 está limitada en código a `content/tutorials/**`, `.generated/**`, `public/audio/**` y `public/voiceover/**`.
- [ ] El render-service actual se reutiliza para validar y renderizar; no se reescribe.
- [ ] El model routing permite configurar modelos/proveedores distintos por tarea.
- [ ] El modo `code_evolution` queda reflejado en diseño/roadmap, pero no se implementa en V1.

## Casos de test

- Prompt “haz un tutorial breve sobre `/compact`” genera una card de guion editable.
- Editar texto de una escena y aprobar conserva los cambios en `script.json`.
- Pedir por chat “hazlo más corto y con menos escenas” regenera la escaleta manteniendo estructura válida.
- Aprobar guion genera `direction.json` con mapping narrativo-técnico de escenas.
- Criticar la dirección técnica por chat produce una nueva versión antes de generar config.
- Aprobar dirección genera `config.json` válido para `ClaudeCodeTutorial`.
- Config inválido no se renderiza y activa un intento automático de reparación.
- Render aceptado devuelve `jobId` y se muestra en la UI.
- Intentar escribir fuera de la allowlist se rechaza aunque el modelo lo pida.
- Recargar la página permite recuperar thread, artifacts y estado de sesión.

## Notas de implementación

- El primer slice no crea nuevas escenas React ni toca `src/compositions/**`; eso queda para `code_evolution`.
- El frontend puede rediseñarse alrededor de eventos Pi, reutilizando componentes existentes cuando tenga sentido.
- La escaleta es editable; la dirección técnica es revisable y criticable por chat, pero no editable directamente en V1.
- Audio V1 mantiene soporte básico; preview avanzado de voz/audio queda en roadmap.
- Preview visual V1 usa render final y stills bajo demanda/fallo; clips cortos por escena quedan en roadmap.
