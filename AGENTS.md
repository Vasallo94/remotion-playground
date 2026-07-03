# AGENTS.md

## Project intention

Pipeline de generación de videos educativos y promocionales con Remotion, **totalmente automatizado por agentes de IA**. Proyecto personal de Enrique Vasallo enfocado en tutoriales de Codex (LinkedIn) y demos de producto (Línea Directa). Los vídeos se generan programáticamente desde configs JSON, renderizados frame-by-frame con React.

**Principio clave: automatizar la ejecución, no el criterio.** Las skills proponen decisiones creativas (escaleta, carta de sonido) via `AskUserQuestion` e iteran hasta aprobación del humano. El trabajo técnico (llamadas API, generación de archivos, renderizado) es totalmente automático. El humano nunca toca config.json manualmente.

**Cadena de agentes:** `tutorial-generator → director → sound-engineer → render`

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                # Remotion Studio (preview in browser)
npm run build              # Bundle composition
npm run lint               # ESLint + TypeScript check

# Render a tutorial to MP4
npx tsx scripts/render.ts tutorials/[slug]/config.json

# If Chromium missing
npx remotion browser ensure
```

## Architecture

Remotion-based video pipeline that generates Codex tutorial videos from JSON configs.

**Data flow:** `config.json` → Zod validation → React composition → frame-by-frame render → MP4

### Composition system

`src/Root.tsx` registers two compositions: `ClaudeCodeTutorial` (1280×720 landscape) and `ProductShort` (1080×1920 vertical). Each reads a `config.json` as props, calculates total duration via `createCalculateMetadata<T>()` from `src/utils/calculateMetadata.ts`, and renders scenes sequentially via `<Series>`.

Scene types are defined in each composition's `schema.ts`. Named prop types are exported directly (`IntroSceneProps`, `TerminalSceneProps`, etc.) — scene components import these instead of using `Extract<...>`.

### Terminal animation timing

`TerminalScene` simulates a Codex CLI session. It renders user messages in bordered boxes ("You" label), Codex responses with orange "⏵ Codex" label, and tool outputs with orange left border. A status bar at the bottom shows model name, animated context bar, and cost. All colors come from `tokens.terminal.*`.

Timing map — each line has `startFrame` + `durationFrames`:

- `command`: typewriter effect (0.5 chars/frame)
- `Codex`: streaming effect (1 char/frame, 18-frame gap between lines)
- `output`: instant reveal (8 frames)
- `blank`: spacer
- `delayAfterMs` on any line adds pause before it appears

### Theme system

`ThemeContext` provides multiple themes, including `"betelgeuse"` (personal default: dark observatory, Computer Modern, red Betelgeuse), `"linea-directa"` (white bg, red #CC3333, PhoneMascot SVG), `"default"`, `"atom-dark"`, `"h-alpha"` and `"claqueta"`. All design tokens are centralized in `themes.ts` via `ThemeTokens` type. Scene components read tokens via `useThemeTokens()` hook — never check theme name directly.

Key token groups:

- **terminal.\***: sceneBackground, bg, command, output, Codex, labelColor, successColor, statusBarBg, borderColor, separatorColor, costColor, userMessageBg, userMessageBorder
- **mascot.\***: show, cornerScale, cornerOpacity, cornerBottom, cornerRight
- **card.\***: bg, bgGradient, border, accentBorder, shadow
- **Top-level**: primary, secondary, fontFamily, monoFontFamily, fontFaces, radius, labelColor, accentLine, overlay, constellation, watermark

### PhoneMascot

`components/PhoneMascot.tsx` — SVG mascot faithful to the real Línea Directa logo (button phone with 3×3 keypad, handset, cable, 4 wheels). Props: `scale`, `animation` (`"none"` | `"idle"` | `"ring"` | `"entry"` | `"dial"`), `darkBg` (uses light outlines for dark backgrounds). Entry animation chains roll-in → handset lift → idle breathing.

`components/MascotWatermark.tsx` — wrapper for the bottom-right corner mascot pattern. Reads positioning from `tokens.mascot.*`, only renders when `tokens.mascot.show` is true. Used in TerminalScene (dial), CalloutScene (idle), OutroScene (idle).

### Shared hooks

`hooks/useSlideIn.ts` — `useSlideIn({ distance?, delay?, durationInFrames?, damping? })` returns `{ opacity, y, spring }`. Replaces the repeated spring+interpolate "enter from below" pattern used across scenes.

### Custom scene extension

`customSceneRegistry.ts` maps `componentId` strings to React components. All custom components must be statically imported and registered here — Remotion bundles at compile time, no dynamic imports.

## Critical constraints

- **All animations must use `useCurrentFrame()` + `spring()`/`interpolate()`**. CSS transitions and Tailwind animation classes are forbidden (Remotion renders frame-by-frame, CSS animations don't work).
- **`config.json` is the source of truth.** To adjust a tutorial, edit the JSON and re-render.
- **`tutorials/*/output.mp4` is gitignored.** Config files are committed, rendered videos are not.
- **Render script uses `@remotion/bundler` with Tailwind webpack override** — `remotion.config.ts` does NOT apply to the Node.js render API, the override is passed manually in `scripts/render.ts`.
- **Never check theme name directly in scenes.** Use `useThemeTokens()` and read token values. The `isLD` / `useTheme()` pattern is deprecated.
- **Scene prop types are exported from `schema.ts`.** Import `IntroSceneProps` etc. directly — don't use `Extract<z.infer<...>>`.
- **Escaleta validation required.** All video generation skills must present a full escaleta (script) to the user via `AskUserQuestion` and obtain explicit approval before generating `config.json`. The iteration loop has no round limit. Research remains automatic.
- **Default tutorial theme is `"betelgeuse"`.** New personal `ClaudeCodeTutorial` configs must use `"betelgeuse"` unless the user explicitly requests another theme. Keep `"linea-directa"` available for legacy content and Línea Directa product demos. Never generate a config.json with `"theme": "default"` by default.

## Code style

- Prettier: 2-space indent, no semicolons, bracket spacing, printWidth 120
- ESLint: `@remotion/eslint-config-flat`
- TypeScript strict mode, `noUnusedLocals: true`

## Operational instructions for the agent

### Traceability (automatic)

- **CHANGELOG.md**: BEFORE each commit, add an entry under `[Unreleased]` with the corresponding category (Added/Changed/Deprecated/Removed/Fixed/Security). Do not wait for the human to ask.
- **FUTURE.md**: When the human mentions a future idea or improvement not being implemented now, log it in `FUTURE.md` with date and description. Ask priority if not obvious.
- **docs/adr/**: When a relevant technical decision is made (library choice, design pattern, architecture change, trade-off), create a numbered ADR following Structured MADR. Document context, evaluated options with risks, decision and consequences.

### Commit rules (Conventional Commits — enforced by commitlint)

- Format: `type(scope): description` (imperative, ≤50 chars).
- Valid types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- BREAKING CHANGE in footer or `!` after type.
- Verify CHANGELOG is updated before committing.
- One commit = one atomic logical change.

### Quality gates

- Do not push without passing pre-commit hooks (lint, typecheck, format).
- Never commit .env files, credentials or PII.
- Pre-commit runs: `lint-staged` (ESLint fix + Prettier) + `commitlint`.

### Specs before code

- Before implementing a feature, create/update spec in `_project_specs/features/`.
- Include acceptance criteria and test cases.
- On completion, move spec to `_project_specs/completed.md`.

### ADR proactive

- On any technical decision (library, pattern, trade-off, architecture change), create ADR in `docs/adr/`.
- Structured MADR format with risk analysis and options.
- Number consecutively (0000, 0001...).
