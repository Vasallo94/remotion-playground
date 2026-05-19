---
name: scene-timing-guide
description: Two-Phase animation timing model for Remotion scenes. Teaches agents beat placement rules, visualReadyMs registry, and duration-content density. Read before directing or creating scenes.
---

# Scene Timing Guide

## Two-Phase Animation Pattern

Every scene in this platform uses a Two-Phase animation model. You do NOT need to set animation timing — the platform handles it automatically.

### Phase 1: Instant Entry (0-200ms)

Core layout appears immediately when the scene starts:

- Title text
- Card/container frames
- Background elements
- Grid/column structure

The viewer instantly sees WHAT this scene is about.

### Phase 2: Progressive Reveal (beat-driven)

Supporting elements appear as the voice mentions them:

- Bullet points → each on its narration beat
- Diagram nodes → draw as voice describes flow
- Stats/numbers → count up when voice cites them
- Highlights → emphasize what voice discusses

## What You Generate

| Field          | Generate?       | Notes                                                              |
| -------------- | --------------- | ------------------------------------------------------------------ |
| `beats[]`      | YES             | Creative sync points — one beat per narrative point                |
| `tailHoldMs`   | OPTIONAL        | Only if scene needs extra hold (CTA, brand). Default 350ms is fine |
| `transitionMs` | OPTIONAL        | Cross-fade duration between scenes (0-1500ms)                      |
| `leadInMs`     | NO — DEPRECATED | Auto-calculated from scene registry. Do not set.                   |
| `audioStartMs` | NO — DEPRECATED | Auto-calculated from scene registry. Do not set.                   |

## Key Principle

**You decide WHAT to show and WHAT to say. The platform decides WHEN to sync them.**

Audio automatically starts when the scene's visuals are ready. You don't need to calculate or guess millisecond values.

## Beat Placement Rules

1. First beat `startMs` must be >= the scene's `visualReadyMs` (typically 100-150ms)
2. Space beats at least 500ms apart
3. Each beat should have: `id`, `startMs`, `narration` (what voice says), `visual` (what appears)
4. Leave >= 500ms between last beat and scene end

## Duration-Content Rules

For scenes with countable items (bullet-slide, icon-grid, benefits):

- Minimum: 2.5 seconds per item + 1.5 seconds overhead
- Example: 4 items → minimum 11.5 seconds

## visualReadyMs Reference

| Scene Type       | visualReadyMs | Phase 1 Elements             |
| ---------------- | ------------- | ---------------------------- |
| intro            | 100ms         | Title, lockup, background    |
| terminal         | 150ms         | Window chrome, status bar    |
| callout          | 100ms         | Card frame, icon, title      |
| outro            | 100ms         | Title, brand, CTA            |
| bullet-slide     | 100ms         | Title, subtitle, accent line |
| icon-grid        | 100ms         | Title, grid layout frame     |
| split-screen     | 100ms         | Title, columns, separator    |
| code-block       | 150ms         | Card chrome, title, filename |
| flow-diagram     | 150ms         | Title, node outlines         |
| comparison-table | 100ms         | Title, column headers, frame |
| stat-reveal      | 100ms         | Label, container             |
| file-explorer    | 150ms         | File tree sidebar            |
| quote            | 100ms         | Quote marks, card background |
| block-diagram    | 150ms         | Title, block outlines        |
| All others       | 100-150ms     | Title + structural frame     |
| Unregistered     | 200ms         | Default fallback             |

## Dead Air Definition

**Dead air** = voice playing while the screen has no visible content. This is FORBIDDEN.

The platform prevents this automatically by delaying audio start until `visualReadyMs`. But you must also avoid placing beats before `visualReadyMs`.

## Universal Beat Convention

Every scene follows one indexing rule. **beats[0] = first narration moment** (the first thing the narrator says that has a matching visual reveal). Scene titles use `usePhase1Entry()` and do NOT consume a beat.

### beatOffset rule

- Scenes with **intro text rendered via beats** (flow-diagram): `beatOffset = 1` — beats[0] triggers the intro text reveal, beats[1+] trigger the nodes.
- All other scenes (icon-grid, block-diagram, split-screen, comparison-table, bullet-slide, step-list): `beatOffset = 0` — beats[0] triggers the first visual element directly. The `title` prop uses `usePhase1Entry()` and does NOT consume a beat slot.

### Panel-based scenes (split-screen, comparison-table)

Author **one beat per panel**. All items within a panel appear simultaneously when that beat fires.

```
beats[0] → first narration moment after title
beats[1] → left/first panel (all items appear together)
beats[2] → right/second panel (all items appear together)
```

### Per-item scenes (icon-grid, bullet-slide, step-list, timeline)

Author **one beat per item** (beatOffset = 0):

```
beats[0] → first item
beats[1] → second item
beats[2] → third item
…
```

### Never leave beats[0] unused

The first beat in every scene must have a valid `startMs` that matches the first moment in the narration audio where something visual changes. The `calibrate_beats_from_audio` tool will overwrite `startMs` values with real measured times after TTS generation.
