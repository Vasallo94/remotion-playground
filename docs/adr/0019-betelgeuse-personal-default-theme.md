# 0019. Betelgeuse as personal default theme

## Status

Accepted

## Context

Claqueta started with Línea Directa as the mandatory default theme for generated tutorials. That made sense for product demos, but the current product direction is a personal AI video workshop for Enrique. New tutorials generated from the Pi runtime and shown in the web UI should no longer inherit a corporate red/white Línea Directa identity.

A separate design system, Betelgeuse, already defines Enrique's personal visual language: dark astronomical surfaces, Computer Modern typography, square cards, no shadows, a single red accent, Orion for cover moments, and the Belt as a compact monogram.

## Decision Drivers

- New personal tutorial videos must look owned by Claqueta/Enrique, not by Línea Directa.
- Existing committed videos using `linea-directa` must remain renderable.
- Runtime defaults should guide agents toward the desired style without requiring the user to mention it.
- Frontend and Remotion should share the same visual principles, even if implemented with different token systems.

## Considered Options

### Option 1 — Rename/replace `linea-directa`

Replace the existing theme implementation with Betelgeuse while keeping the name `linea-directa`.

- Pros: minimal schema changes.
- Cons: breaks semantic meaning, surprises existing configs, risks brand asset regressions.

### Option 2 — Reuse existing `claqueta` theme

Change the runtime default from `linea-directa` to the existing `claqueta` cinema/tungsten theme.

- Pros: already implemented and validated.
- Cons: cinema meta-video identity is not the Betelgeuse observatory system; does not satisfy Computer Modern/Orión/Cinturón rules.

### Option 3 — Add `betelgeuse` and make it the tutorial default

Keep all existing themes, add a new `betelgeuse` option to `ClaudeCodeTutorial`, update Pi/default props to emit it for new personal tutorials, and restyle the web app with Betelgeuse tokens.

- Pros: preserves backwards compatibility, makes the new default explicit, aligns UI and video identity.
- Cons: requires schema, theme tokens, assets/fonts and tests to change together.

## Decision

Choose Option 3: add `betelgeuse` as a first-class `ClaudeCodeTutorial` theme and use it as the default for new Pi-generated tutorials and Remotion Studio tutorial defaults. Keep `linea-directa` for legacy content and ProductShort demos.

## Consequences

- `TutorialConfigSchema.theme` accepts `"betelgeuse"`.
- `packages/agent-pi` prompt/tool defaults emit `theme: "betelgeuse"` unless a user explicitly requests another theme.
- The web app uses Betelgeuse fonts/colors/radius/log feedback by default.
- Existing configs with `linea-directa` continue to render because the old theme remains registered.
- Future theme-specific scene behavior must be driven by tokens, not direct theme-name checks.
