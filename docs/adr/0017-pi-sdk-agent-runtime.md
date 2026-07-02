# 0017 — Runtime agéntico Pi-native para generación de vídeo

## Estado

Propuesto — 2026-07-02

## Contexto

Claqueta usa actualmente DeepAgents/LangGraph como runtime agéntico. El sistema ya tiene buenas ideas técnicas: modo conversacional, subagentes, checkpoints humanos, render-service, validación Zod, catálogo de escenas y artifacts de vídeo. El problema es que la experiencia de generación desde UI/chat sigue teniendo fricción: conversación ruidosa, calidad irregular del output, fallos de pipeline y dificultad para retomar o aprovechar trabajo previo.

También existe una ambición mayor: que Claqueta pueda evolucionar sus propias capacidades mediante cambios de código revisables. Esa capacidad debe diseñarse, pero no debe mezclarse con la primera mejora del flujo de generación de vídeo.

## Opciones evaluadas

1. **Mantener DeepAgents/LangGraph y pulir la UI actual.** Menos cambio, pero mantiene acoplamientos y no aprovecha Pi SDK.
2. **Reescribir todo Claqueta sobre Pi.** Demasiado riesgo; Remotion, render-service, schemas y UI existente tienen valor.
3. **Crear runtime Pi-native para el flujo de generación de vídeo, conservando las buenas piezas existentes.** Permite rediseñar la experiencia conversacional y mantener una ruta futura hacia multi-provider y code evolution.

## Decisión

Elegimos la opción 3.

La primera implementación se centra en `video_generation` para `ClaudeCodeTutorial`: chat principal, escaleta/guion editable, dirección técnica revisable, config validado, render automático y artifacts persistentes (`script.json`, `script.md`, `direction.json`, `config.json`).

El modo `code_evolution` queda en roadmap como capacidad separada: cambios en código mediante branch/workspace/PR. No se implementa en V1.

## Decisiones clave

- Backend Pi SDK en TypeScript (`packages/agent-pi/`).
- Frontend rediseñado alrededor de eventos Pi por SSE.
- Persistencia ligera propia en SQLite para threads/artifacts/eventos y enlace con sesiones Pi.
- Un agente Pi principal con passes estructurados; no subsesiones Pi reales en V1.
- Model routing por tarea desde el diseño.
- Allowlist de escritura en código: `content/tutorials/**`, `.generated/**`, `public/audio/**`, `public/voiceover/**`.
- `src/compositions/**` queda fuera de V1 y pertenece a `code_evolution`.

## Consecuencias

- (+) Mejora directamente el flujo que Claqueta ya hace: generar vídeos desde chat/UI.
- (+) Mantiene las partes técnicas valiosas del sistema actual.
- (+) Prepara la arquitectura para múltiples modelos/proveedores por tarea.
- (+) Separa generación de vídeo de evolución del código.
- (−) Habrá que rediseñar parte importante del frontend de streaming.
- (−) Habrá duplicidad temporal entre runtime LangGraph y runtime Pi.
- (−) Hay que reemplazar los interrupts de LangGraph por checkpoints propios.

## Referencias

- Spec: `_project_specs/features/2026-07-02-pi-sdk-agent-runtime.md`
- Diseño: `docs/superpowers/specs/2026-07-02-pi-sdk-agent-runtime-design.md`
- Plan: `docs/superpowers/plans/2026-07-02-pi-sdk-agent-runtime.md`
