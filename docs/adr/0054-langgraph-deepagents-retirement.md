# ADR 0054: Retire the LangGraph/DeepAgents runtime in favor of Pi-native agent-pi

- Status: Proposed
- Date: 2026-07-21

## Context

Claqueta históricamente orquestó la generación de vídeo con un runtime Python
basado en LangGraph/DeepAgents (`packages/agent/src/**`, `graph_server.py`,
`scripts/export-agent-graph.py`). Desde 2026-07-03 la orquestación productiva se
migró a un runtime Pi-native en TypeScript (`packages/agent-pi`), siguiendo el
plan `docs/superpowers/plans/2026-07-12-pi-agent-completion-plan.md` y el spec
`_project_specs/features/2026-07-03-pi-deepagents-parity.md`.

A fecha de este ADR ambos runtimes coexisten:

- `docker-compose.yml` solo levanta `render-service`, `agent-pi` y `web`. El
  servicio Python no está en el despliegue.
- `web` selecciona runtime con el flag `VITE_AGENT_RUNTIME` (default `"pi"`) y
  conserva `@langchain/langgraph-sdk` más el hook legacy `useVideoStream`.
- El runtime Python `packages/agent/src/**` sigue congelado desde 2026-07-03; su
  último commit coincide con el nacimiento de `agent-pi`.
- `packages/agent/skills/**` y `packages/agent/prompts/**` **siguen vivos**: los
  consume `agent-pi/src/resourceLoader.ts`. No forman parte de este retiro.

### Evidencia de paridad

- La suite `@remotion-platform/agent-pi` pasa **260/260 tests** cubriendo intake
  tipado, target contracts, coordinador determinista, especialistas aislados
  (researcher, copywriter, director, audio planner, scene QA), producción de
  audio, matriz de recovery/restart, event outbox, neutralidad de prompts, y la
  frontera de código generado (policy/quarantine/promotion).
- Existe un E2E pi-only que alcanza publicación con verificación SHA-256 sin
  edición manual de artefactos (`piOnlyE2e.test.ts`).
- Producciones reales de temas materialmente distintos publicadas por el
  pipeline pi (`carpinteria-japonesa`, `databricks-scala-best-practices`,
  `claude-code-*`, `deten-el-efecto-domino`) demuestran neutralidad temática en
  la práctica.

### Gates aún abiertos (bloquean el paso a `Accepted`)

1. E2E automatizado parametrizado con ≥3 subjects (spec §Cross-agent prompt policy).
2. Tabla de transiciones ejecutable/testeada para todos los modos, no solo
   `new_video` (`coordinator.ts`).
3. Fase 8 — deployment hardening: Compose pi-only sobrevive restart de
   contenedor, retirada del mount de auth-file host, smoke de deploy y runbook.
4. Smoke live del researcher (bloqueado por cuota externa de Codex).

## Decision drivers

- Un único runtime productivo reduce coste de mantenimiento, superficie de
  dependencias y ambigüedad de "qué está vivo".
- La frontera de seguridad (código de escena generado por IA) ya vive
  íntegramente en `agent-pi` con policy/quarantine/promotion testeadas.
- No romper `skills/`/`prompts/`, que son fuente única compartida.
- No retirar antes de tener evidencia de paridad completa (stop-condition
  explícita del plan de completado).

## Considered options

### Mantener el dual-runtime indefinidamente

Rechazado. Obliga a tests de compatibilidad de schemas/configs entre dos
runtimes, mantiene `@langchain/langgraph-sdk` y el flag `VITE_AGENT_RUNTIME`, y
deja ~7.4k líneas de Python congeladas que confunden el mapa del repo.

### Borrar el runtime Python ya

Rechazado por ahora. Viola la stop-condition del plan: "LangGraph removal is
proposed before the Pi-only parity evidence is complete". Los gates 1–4 siguen
abiertos.

### Registrar la decisión de retiro y ejecutarla al cerrar los gates

Elegido. Este ADR fija la intención y el alcance exacto del borrado; la
transición a `Accepted` y la ejecución ocurren cuando los cuatro gates cierran.

## Decision

Retirar el runtime LangGraph/DeepAgents como paso final de la migración, una vez
cerrados los gates abiertos. El retiro comprende exactamente:

1. Eliminar `@langchain/langgraph-sdk` y los tipos/hooks LangGraph de `web`
   (`useVideoStream`, el flag `VITE_AGENT_RUNTIME` y el ternario
   `useSelectedVideoStream`), dejando `usePiVideoStream` como único stream.
2. Eliminar el runtime Python: `packages/agent/src/**`, `graph_server.py`,
   `conftest.py`, `scripts/export-agent-graph.py`, su Dockerfile y dependencias.
3. Conservar intactos `packages/agent/skills/**` y `packages/agent/prompts/**`.
4. Actualizar `docker-compose.yml`, docs de arquitectura, runbooks y specs; los
   ADR/specs históricos que citan LangGraph quedan marcados como archivales.

Hasta que los gates cierren, este ADR permanece `Proposed` y no se borra nada.

## Consequences

### Positive

- Un solo runtime productivo (Pi) y un solo path de stream en web.
- ~7.4k líneas de Python y una dependencia mayor (`@langchain/langgraph-sdk`)
  fuera del árbol.
- El mapa del repo deja de tener dos "agentes" con solapamiento aparente.

### Negative

- Se pierde el fallback LangGraph; cualquier regresión pi-only deja de tener
  runtime alternativo. Mitigado por la matriz de recovery y el E2E pi-only.
- Referencias históricas en ADR/specs quedan como documentación archival y deben
  etiquetarse para no leerse como estado actual.

## Validation

El retiro se considera válido cuando: los cuatro gates cierran; `pnpm run lint`,
typecheck, la suite completa de `agent-pi`, `scene-contracts`, `render-service`,
el build de `web`, el bundle de Remotion y el E2E pi-only pasan tras el borrado;
`rg -i 'langgraph|langchain'` no devuelve dependencias ni paths de runtime
ejecutable; y un despliegue Compose limpio completa el E2E pi-only y sobrevive un
restart de contenedor.
