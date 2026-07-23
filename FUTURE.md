# FUTURE.md — Ideas y roadmap

Ideas discutidas durante el brainstorming del 2026-03-22 que no se han implementado todavía.

## Contexto

El repo empezó como generador de tutoriales de Claude Code y evolucionó a una plataforma de vídeo con múltiples composiciones. Cada tipo de vídeo es una composición Remotion + skill de Claude Code.

## Composiciones implementadas

- **ClaudeCodeTutorial** (1280×720) — tutoriales educativos con terminal simulada
- **ProductShort** (1080×1920) — shorts de marketing para Línea Directa

## Ideas pendientes

### Nuevos tipos de composición

- **Presentación / explainer** — formato horizontal, slides animadas para explicar conceptos (onboarding, producto, procesos internos). No terminal, sino diagramas, bullets y transiciones.
- **Social clip genérico** — formato cuadrado (1080×1080) para posts de redes sociales que no sean shorts. Carruseles animados, quotes, datos destacados.
- **Comparativa** — side-by-side de dos productos o antes/después. Útil para marketing y para tutoriales.

### Video meta-educacional: "Cómo hicimos este repo con IA"

Video autoreferencial que documente el proceso de crear este mismo repositorio de generación de videos, mostrando cómo se ha construido todo mediante direcciones y conversaciones con agentes de IA. Cubriría desde la idea inicial hasta las composiciones, skills, el modelo de dirección editorial, y cómo cada feature nació de un prompt. Formato educacional para LinkedIn mostrando el workflow real humano-agente.

### Mejoras a composiciones existentes

- **Voiceover con ElevenLabs** — Gemini TTS integrado en el pipeline del agente (voice_generator subagent). ElevenLabs pendiente de acceso API. (Parcialmente implementado 2026-04-21)
- **Transiciones entre escenas** — actualmente es corte directo. Usar `@remotion/transitions` para fades, wipes o slides.
- **Música de fondo** — implementado en modo library-only (sound_engineer copia tracks de `public/audio/library/`). Generación via API (Lyria/ElevenLabs) pendiente. (Parcialmente implementado 2026-04-21)
- **Pixel logo hero variant** — crear una segunda versión del sprite del logo en `96x144`, con limpieza manual adicional en barba, humo y gafas para planos grandes o intros de marca.
- **Animación de humo real en pixel art (GIF sprite sheet)** — el humo del logo debe moverse orgánicamente como un GIF de pixel art real: crear varios frames del sprite con el humo en distintas posiciones/formas y ciclarlos. No superponer partículas encima del logo estático. Approach: diseñar 4-6 frames de humo en el propio sprite `64×96`, exportar como sprite sheet, y reproducirlos con `useCurrentFrame()` + frame hold. (2026-03-28)

### Infraestructura

- **Análisis de vídeo nativo con Gemini Vertex** — añadir un contrato y una etapa real de revisión temporal de vídeo usando la service account/ADC ya montada; hoy Scene QA analiza stills ordenados. Prioridad por confirmar. (2026-07-23)
- **Ponytail production doctrine for video generation** — apply Ponytail to creative philosophy and operating procedures, not only implementation code. The pipeline should stop at the first production rung that meets the approved intent: question whether the video/scene/research/asset/checkpoint is needed; reuse an approved artifact, registered scene, recipe, or local asset before generating anything; prefer deterministic projection/rendering over another specialist; invoke specialists only for unresolved judgment; render the smallest evidence needed; repair the shared root cause once; and stop iterating when the human-approved quality bar is met. Audit the current 13-step flow for deletable handoffs, duplicate approvals, stale artifact regeneration, model calls that deterministic code already covers, and quality gates that can become conditional. Priority high after the real cascade E2E exposed excessive retries and ceremony. Doctrine/skill and the explicit-silence short circuit implemented; broader checkpoint/QA/config cuts remain evidence-gated. (2026-07-12)
- **Pi RPC isolation pilot** — evaluate replacing in-process specialist `AgentSession`s with one-shot `pi --mode rpc --no-session` subprocesses behind the existing runner interfaces. Start with the director, use repository-owned narrow output extensions, compare structured-output parity, multimodal support, cancellation, crash containment, cold-start latency, event fidelity, and auth/model routing before deciding on broader migration. Priority high pending Enrique's confirmation. (2026-07-13)
- **Catálogo web** — página estática (Astro o similar) que liste todos los vídeos generados con preview y metadatos del config.
- **CI/CD render** — GitHub Action que renderice automáticamente cuando se pushea un config.json nuevo.
- **Modo revisión sobre vídeo existente para DeepAgent** — evitar que una nueva sesión trate una petición de mejora como vídeo nuevo. El orquestador debería resolver primero el artifact objetivo (`content/**/config.json` o job renderizado), cargarlo en `/pipeline/config.json`, declarar modo `modify`, y limitar el grafo a agentes de parche (`director`, `audio_planner`, `sound_engineer`, `validator`, `render`) según el tipo de cambio. Prioridad por confirmar. (2026-05-11)
- **Router de modos operativos del agente** — formalizar modos como `new_video`, `revise_existing`, `render_only`, `recover_failed_render`, `variant`, `audit_only`, `asset_regeneration` y `question`, con contratos de entrada/salida distintos para evitar que todo caiga en el pipeline completo. Prioridad por confirmar. (2026-05-11)
- **DeepAgent conversacional y autoexplicativo** — añadir una capa de interacción para que el DeepAgent pueda conversar durante procesos creativos, explicar qué está haciendo, guiar a usuarios nuevos, y pedir input en distintos formatos: texto plano, opciones, checkboxes y cards enriquecidas. Debe complementar el flujo actual de aprobación creativa sin obligar a que todo sea una card. Prioridad por confirmar. (2026-05-13)
- **Rediseño UIUX tipo agente moderno** — evolucionar el web frontend hacia una experiencia tipo Codex/Claude Cowork: chat conversacional como eje principal, tools/progreso como detalles secundarios colapsables, checkpoints integrados naturalmente en el chat, y pipeline como indicador sutil en vez de panel dominante. Prioridad alta para la siguiente iteración. (2026-05-13)
- **Modos operativos posteriores** — incorporar, cuando los 8 modos base estén estabilizados, modos especializados como `director_pass`, `sound_pass`, `copy_pass`, `catalog`, `compare_versions`, `publish_package` y `migration`. Prioridad media; dependen de observar el uso real del router base. (2026-05-11)
- **Extraer shared/** — parcialmente hecho: `createCalculateMetadata` extraído a `src/utils/`, `MascotWatermark` componetizado. Pendiente: mover ThemeContext y PhoneMascot a `src/shared/` cuando haya una 3ª composición (cross-import entre ProductShort y ClaudeCodeTutorial aún existe).
- **Tests visuales** — ~~snapshot testing con `@remotion/test`~~ Implementado (2026-04-27): vitest + pixelmatch + renderStill. `npm run test:visual`.
- **Mover `src/` a `packages/remotion/`** — unificar todo bajo packages/ por consistencia. Requiere reconfigurar remotion.config.ts, scripts/render.ts, render-service paths y Remotion Studio entrypoint. Hacer cuando las features actuales estén estabilizadas. (2026-04-27)
- **Reactivar generación de audio via API** — cuando ElevenLabs/Lyria estén disponibles, reactivar `generate_audio` en sound_engineer y añadir fallback chain en audio_planner. El diseño ya lo soporta. (2026-04-21)
- **Paralelismo voice_generator/sound_engineer via LangGraph Send()** — el orquestador actual pide al modelo despachar ambos en paralelo via prompt. Para garantizarlo, implementar fork/join con `Send()` API de LangGraph. (2026-04-21)
- **Scene Creator integración como CompiledSubAgent** — el scene_creator se registra como subagente dict pero su grafo interno (lint → register → validate) no se ejecuta como subgrafo LangGraph. Verificar API CompiledSubAgent de DeepAgents. (2026-04-21)
- **Separar VideoResultCard del chat** — sacar el reproductor de vídeo del flujo de mensajes y llevarlo a un panel dedicado (el Header ya tiene el selector de targets). El chat solo tendría mensajes + cards de decisión. Evita que el player ocupe espacio en el scroll conversacional y simplifica el modelo mental. Prioridad por confirmar. (2026-05-13)
- **Feedback visual con capturas de slides rotas** — permitir al usuario enviar screenshots de slides renderizadas que tienen errores visuales (layout roto, texto cortado, colores incorrectos) como contexto al DeepAgent. El agente recibiría la imagen + el config.json de la escena y podría diagnosticar el problema y generar un patch. Requiere: soporte multimodal en el chat (image upload), mapeo screenshot→escena del config, y prompt de diagnóstico visual para el orquestador/scene_creator. (2026-05-13)
- **Preview de clips por escena** — ampliar la validación visual más allá de stills: renderizar clips cortos por escena para revisar timing, orden de aparición y animaciones antes del MP4 final. Especialmente importante porque los modelos tienden a equivocarse en secuenciación temporal dentro de slides. Prioridad alta tras el primer slice Pi SDK. (2026-07-02)
- **Secuenciador compartido row-major para slides** — los componentes de listas y grids mezclan beats parciales con delays fallback absolutos; cuando hay menos beats que elementos, los elementos sin beat pueden aparecer antes que los anteriores. Crear una única planificación monotónica que ordene por índice visual (izquierda→derecha, arriba→abajo), distribuya los reveals dentro de una ventana temporal explícita y sea consumida por `icon-grid`, `bullet-slide`, `step-list`, tablas y diagramas. Añadir preview temporal por escena para verificar el orden, no solo un still. Prioridad alta tras el vídeo «Claqueta de principio a fin». (2026-07-23)
- **Preview y selección de voz/audio** — permitir escuchar voces TTS, música y efectos antes de integrarlos en el render final. Gemini TTS puede cubrir voz; ElevenLabs u otros proveedores pueden cubrir efectos/sonido. Prioridad posterior al flujo de guion/dirección editable. (2026-07-02)
- **Modo code_evolution Pi-native** — separar de `video_generation` un modo donde Claqueta pueda modificar sus propias capacidades mediante branch/workspace/PR: nuevas escenas, nuevas composiciones, nuevos componentes Remotion, nuevos prompts/tools y cambios en `src/compositions/**`. No debe mutar el contenedor en caliente como fuente de verdad; Git/PR debe ser la persistencia. (2026-07-02)
- **Paridad Pi runtime con DeepAgents** — llevar `agent-pi` de MVP a pipeline creativo completo: panel de pipeline/logs alimentado por eventos reales, carga de skills/guías de Remotion, selección explícita de tipos de escena en escaleta, dirección visual aprobable, selección de voz/música/SFX, previews de imagen/audio, QA de sincronía y render con trazabilidad. Prioridad alta salvo confirmación en contra. (2026-07-03)
- **Checkpoint de escaleta con decisión visual por escena** — no usar recetas hardcodeadas por tipo de vídeo; el agente debe proponer para cada escena el contenido, función narrativa, tipo de escena/componente (`intro`, `custom/step-list`, etc.), razón de elección y necesidades nuevas si el catálogo no basta. El humano debe poder dirigir esto antes de generar config/render. Prioridad alta. (2026-07-03)
- **Telemetría Pi para Pipeline y Log** — el frontend Pi debe rellenar la columna Pipeline/Log con fases, tools, checkpoints, validación, render y errores; ahora el único feedback real es el spinner del agente. Prioridad alta. (2026-07-03)

### Más productos Línea Directa

La skill `/short-ld` puede generar shorts para cualquier producto asegurable:
coche, moto, hogar, salud, movilidad personal, mascotas, autónomos/pymes, antiokupación.

### Otros clientes / marcas

La arquitectura de temas permite añadir más marcas. Cada marca sería un tema nuevo en `ThemeContext` con sus colores, tipografía y mascota/logo.
