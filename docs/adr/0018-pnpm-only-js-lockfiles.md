# 0018 — Lockfile JavaScript canónico con pnpm

## Estado

Aceptado — 2026-07-03

## Contexto

El monorepo ya declara `packageManager: pnpm@11.1.1`, tiene `pnpm-workspace.yaml` y los Dockerfiles/Makefile actuales instalan dependencias con pnpm. Aun así quedaban `package-lock.json` dentro de `packages/web` y `packages/render-service`.

Esos lockfiles npm duplican el grafo de dependencias JavaScript, hacen que Dependabot/auditorías reporten vulnerabilidades por rutas que no son el runtime canónico y obligan a mantener overrides en dos ecosistemas para el mismo paquete. Durante la remediación de vulnerabilidades, esto generó trabajo y riesgo extra: el grafo pnpm podía estar limpio mientras un lockfile npm seguía anclando versiones vulnerables o incompatibles.

## Opciones evaluadas

1. **Mantener `pnpm-lock.yaml` y package-locks npm.** Conserva compatibilidad con comandos históricos `npm install`, pero duplica fuentes de verdad y alertas.
2. **Usar npm como gestor único.** Contradice la configuración actual, Dockerfiles, Makefile y workspace pnpm.
3. **Usar pnpm como único lockfile JavaScript canónico y eliminar package-locks npm.** Reduce superficie de mantenimiento y alinea CI/runtime/local.

## Decisión

Elegimos la opción 3.

El monorepo usará `pnpm-lock.yaml` como única fuente de verdad para dependencias JavaScript/TypeScript. Se eliminan los `package-lock.json` de `packages/web` y `packages/render-service`; los overrides de seguridad para dependencias transitivas viven en `pnpm-workspace.yaml`.

## Consecuencias

- (+) Dependabot/audit dejan de analizar grafos npm stale que no representan el runtime canónico.
- (+) Una sola política de overrides JavaScript, en `pnpm-workspace.yaml`.
- (+) Docker, Makefile y desarrollo local quedan alineados.
- (+) Menos posibilidad de inconsistencias entre lockfiles.
- (−) Comandos históricos `npm install` en subpaquetes dejan de estar soportados como flujo recomendado.
- (−) Documentación antigua que mencione npm queda como histórica o deberá migrarse progresivamente.

## Verificación

- `pnpm audit --json` devuelve 0 vulnerabilidades.
- Dockerfiles existentes usan `pnpm install --frozen-lockfile`.
- Tests/build relevantes pasan tras eliminar package-locks.
