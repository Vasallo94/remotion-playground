# Remotion Skills Wiring Design

## Goal

Make the official `remotion-best-practices` skill actively used by the deepagent pipeline, so agents that write React scene components and generate config.json can draw on Remotion's API knowledge, not just project-specific abstractions.

## Architecture

Two-part change, no new files created:

1. **Skill annotation** — add a `## Project-specific context` section at the top of `packages/agent/skills/remotion-best-practices/SKILL.md` that orients agents to what is and isn't relevant in this project, and documents the project's own Remotion abstractions.

2. **Prompt wiring** — add explicit `remotion-best-practices` read instructions to `scene_creator.md`, `director.md`, and `copywriter.md`.

Sync strategy: manual. The skill is version-controlled locally; update it when Remotion releases something relevant. No automated sync.

## Tech Stack

- DeepAgents `FilesystemMiddleware` (skills already served from `packages/agent/skills/`)
- Markdown skill files (no code changes)

---

## Detailed Design

### Part 1: Skill annotation (`remotion-best-practices/SKILL.md`)

Insert a `## Project-specific context` section immediately after the frontmatter (before `## When to use`). Content:

**Priority rule files for this project:**

- `rules/timing.md` — interpolation curves, spring animations, easing
- `rules/sequencing.md` — `Sequence`, `Series` composition patterns
- `rules/animations.md` — fundamental `useCurrentFrame` + `interpolate` patterns
- `rules/audio.md` — `<Audio>` component, trimming, volume
- `rules/images.md` — `<Img>` component

**Skip these — not used in this pipeline:**

- `rules/maps.md`, `rules/lottie.md`, `rules/gifs.md`, `rules/light-leaks.md`, `rules/charts.md`, `rules/3d.md`

**Project abstractions that extend Remotion:**

These hooks live in `src/shared/hooks/` and replace raw `useCurrentFrame` patterns for the two standard animation phases:

- `usePhase1Entry({ durationMs })` — returns `{ opacity, scale }` for Phase 1 instant-entry animations (titles, structural frames). Use for elements that appear at scene start before any beat fires.
- `useBeatReveal({ beat, fallbackDelayMs, animationMs })` — returns `{ opacity, y }` for beat-driven reveals. `beat` is a `Beat` object from `config.json`; when `beat` is undefined the hook falls back to `fallbackDelayMs`.

**Beat system:**

- `beats[]` in config.json has shape `{ id, startMs, narration, visual }`
- `startMs` is calibrated post-TTS generation by `calibrate_beats_from_audio`
- `beatOffset` convention: `0` for per-item scenes (icon-grid, block-diagram, bullet-slide, step-list); `1` for flow-diagram only (beats[0] = intro text, beats[1+] = nodes)
- Never set `leadInMs` or `audioStartMs` — auto-calculated by platform

**Custom component registration:**

- All new scene components must be added to `src/compositions/ClaudeCodeTutorial/scenes/custom/customSceneRegistry.ts`
- Remotion bundles at compile time — no dynamic imports allowed

### Part 2: Prompt wiring

**`packages/agent/prompts/scene_creator.md`**

Add to the skill reading block (currently only reads `scene-timing-guide`):

```
Read the **`remotion-best-practices`** skill BEFORE writing any component. Focus on the `## Project-specific context` section first, then consult `rules/timing.md` and `rules/animations.md` for animation patterns.
```

**`packages/agent/prompts/director.md`**

Add to the skill reading block (currently reads `remotion-director`, `scene-catalog`, `brand-guidelines`, `scene-timing-guide`):

```
- **`remotion-best-practices`** — Remotion API reference; consult when assigning durations, beat timing, or working with custom componentIds
```

**`packages/agent/prompts/copywriter.md`**

Add to the skill reading block (currently reads `scene-catalog`, `brand-guidelines`, `video-best-practices`, `scene-timing-guide`):

```
- **`remotion-best-practices`** — consult the `## Project-specific context` section when creating or modifying scenes with `type: "custom"` and `componentId`
```

---

## Acceptance Criteria

- [ ] `remotion-best-practices/SKILL.md` has a `## Project-specific context` section before `## When to use` with priority rules, skip list, hook documentation, beat system, and registry note
- [ ] `scene_creator.md` instructs agents to read `remotion-best-practices` on every invocation
- [ ] `director.md` lists `remotion-best-practices` as a reference skill for timing and custom scenes
- [ ] `copywriter.md` lists `remotion-best-practices` as a reference for custom `componentId` scenes
- [ ] No new files created
- [ ] No changes to skill rule files (`rules/*.md`) — only `SKILL.md` is annotated
