# Remotion Skills Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `remotion-best-practices` actively used by the deepagent pipeline by annotating the skill with project-specific context and wiring it into three agent prompts.

**Architecture:** Pure markdown edits — no code changes. The skill file gets a project context section at the top; three prompt files get an additional skill reference in their existing skills blocks. All files already exist; nothing is created.

**Tech Stack:** Markdown, DeepAgents FilesystemMiddleware (serves `packages/agent/skills/` as `/skills/` virtual path)

---

## File map

| File                                                     | Change                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `packages/agent/skills/remotion-best-practices/SKILL.md` | Insert `## Project-specific context` section after frontmatter                       |
| `packages/agent/prompts/scene_creator.md`                | Add remotion-best-practices read instruction before existing scene-timing-guide line |
| `packages/agent/prompts/director.md`                     | Add remotion-best-practices to Skills list                                           |
| `packages/agent/prompts/copywriter.md`                   | Add remotion-best-practices to Skills list                                           |

---

### Task 1: Annotate `remotion-best-practices/SKILL.md` with project context

**Files:**

- Modify: `packages/agent/skills/remotion-best-practices/SKILL.md`

Context: The skill currently starts with frontmatter and then `## When to use`. We insert a new `## Project-specific context` section between the frontmatter closing `---` and `## When to use`. This section tells agents which rule files matter, which to skip, and documents the two project hooks (`usePhase1Entry`, `useBeatReveal`) and the beat system.

- [ ] **Step 1: Open the file and locate the insertion point**

Run:

```bash
grep -n "## When to use" packages/agent/skills/remotion-best-practices/SKILL.md
```

Expected output: a line number (e.g. `7:## When to use`). The new section goes immediately before this line.

- [ ] **Step 2: Insert the project-specific context section**

The file currently has this content starting at the `## When to use` line:

```markdown
## When to use
```

Replace that line with the following block (the `## When to use` line is preserved at the end):

```markdown
## Project-specific context

This skill is used inside an automated video generation pipeline. Before reading the general sections below, note what is and isn't relevant here.

**Priority rule files for this project:**

- `rules/timing.md` — interpolation curves, spring animations, easing
- `rules/sequencing.md` — `Sequence`, `Series` composition patterns
- `rules/animations.md` — fundamental `useCurrentFrame` + `interpolate` patterns
- `rules/audio.md` — `<Audio>` component, trimming, volume
- `rules/images.md` — `<Img>` component

**Skip these — not used in this pipeline:**

`rules/maps.md`, `rules/lottie.md`, `rules/gifs.md`, `rules/light-leaks.md`, `rules/charts.md`, `rules/3d.md`

**Project abstractions that extend Remotion:**

These hooks in `src/shared/hooks/` replace raw `useCurrentFrame` patterns for the two standard animation phases:

- `usePhase1Entry({ durationMs })` — returns `{ opacity, scale }`. Use for Phase 1 instant-entry animations: titles, structural frames, elements that appear at scene start before any beat fires.
- `useBeatReveal({ beat, fallbackDelayMs, animationMs })` — returns `{ opacity, y }`. Use for beat-driven reveals. `beat` is a `Beat` object from config.json; when undefined, falls back to `fallbackDelayMs`.

**Beat system:**

- `beats[]` in config.json: `{ id, startMs, narration, visual }`
- `beatOffset` convention: `0` for per-item scenes (icon-grid, block-diagram, bullet-slide, step-list); `1` for flow-diagram only (beats[0] = intro text, beats[1+] = nodes)
- Never set `leadInMs` or `audioStartMs` — auto-calculated by the platform

**Custom component registration:**

- All new components must be added to `src/compositions/ClaudeCodeTutorial/scenes/custom/customSceneRegistry.ts`
- Remotion bundles at compile time — no dynamic imports

## When to use
```

- [ ] **Step 3: Verify the section was inserted correctly**

Run:

```bash
grep -n "Project-specific context\|usePhase1Entry\|beatOffset\|customSceneRegistry\|When to use" packages/agent/skills/remotion-best-practices/SKILL.md
```

Expected output — lines in this order:

```
N:## Project-specific context
M:- `usePhase1Entry({ durationMs })` — returns `{ opacity, scale }`. Use for Phase 1 instant-entry animations...
O:- `beatOffset` convention: `0` for per-item scenes...
P:- All new components must be added to `src/compositions/ClaudeCodeTutorial/scenes/custom/customSceneRegistry.ts`
Q:## When to use
```

`N < Q` — the context section must appear before `## When to use`.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/skills/remotion-best-practices/SKILL.md
git commit -m "docs(skills): annotate remotion-best-practices with project-specific context"
```

---

### Task 2: Wire `scene_creator.md` — always read remotion-best-practices

**Files:**

- Modify: `packages/agent/prompts/scene_creator.md`

Context: `scene_creator.md` currently opens with:

```
# Scene Creator Agent

Read the **`scene-timing-guide`** skill BEFORE creating any component.
```

We add the `remotion-best-practices` read instruction on the line immediately before the existing `scene-timing-guide` line. The `scene_creator` is the agent that writes actual React component code, so it needs the Remotion API skill on every invocation.

- [ ] **Step 1: Insert the remotion-best-practices instruction**

The file currently contains:

```markdown
Read the **`scene-timing-guide`** skill BEFORE creating any component.
```

Replace it with:

```markdown
Read the **`remotion-best-practices`** skill BEFORE writing any component — focus on `## Project-specific context` first, then consult `rules/timing.md` and `rules/animations.md` for animation patterns.

Read the **`scene-timing-guide`** skill BEFORE creating any component.
```

- [ ] **Step 2: Verify**

Run:

```bash
grep -n "remotion-best-practices\|scene-timing-guide" packages/agent/prompts/scene_creator.md | head -5
```

Expected output — `remotion-best-practices` line number must be lower than `scene-timing-guide`:

```
3:Read the **`remotion-best-practices`** skill BEFORE writing any component...
5:Read the **`scene-timing-guide`** skill BEFORE creating any component.
```

- [ ] **Step 3: Commit**

```bash
git add packages/agent/prompts/scene_creator.md
git commit -m "docs(agent): wire remotion-best-practices into scene_creator prompt"
```

---

### Task 3: Wire `director.md` and `copywriter.md` — reference skill for custom scenes

**Files:**

- Modify: `packages/agent/prompts/director.md`
- Modify: `packages/agent/prompts/copywriter.md`

Context: Both prompts have a `## Skills (read before ...)` block listing skills as bullet points. We append one bullet to each list. Neither agent reads it on every invocation — only when working with custom componentIds or timing.

- [ ] **Step 1: Add remotion-best-practices to `director.md` skills list**

The file currently contains this block:

```markdown
- **`scene-timing-guide`** — Two-Phase animation timing model, beat placement rules, duration-content awareness

Read `remotion-director` on every invocation.
```

Replace it with:

```markdown
- **`scene-timing-guide`** — Two-Phase animation timing model, beat placement rules, duration-content awareness
- **`remotion-best-practices`** — Remotion API reference; consult when assigning durations, beat timing, or working with custom componentIds

Read `remotion-director` on every invocation.
```

- [ ] **Step 2: Verify `director.md`**

Run:

```bash
grep -n "remotion-best-practices" packages/agent/prompts/director.md
```

Expected output:

```
N:- **`remotion-best-practices`** — Remotion API reference; consult when assigning durations, beat timing, or working with custom componentIds
```

- [ ] **Step 3: Add remotion-best-practices to `copywriter.md` skills list**

The file currently contains this block:

```markdown
- **`scene-timing-guide`** — duration-content density rules, visual timing awareness

Read `scene-catalog` on every invocation.
```

Replace it with:

```markdown
- **`scene-timing-guide`** — duration-content density rules, visual timing awareness
- **`remotion-best-practices`** — consult `## Project-specific context` section when creating or modifying scenes with `type: "custom"` and `componentId`

Read `scene-catalog` on every invocation.
```

- [ ] **Step 4: Verify `copywriter.md`**

Run:

```bash
grep -n "remotion-best-practices" packages/agent/prompts/copywriter.md
```

Expected output:

```
N:- **`remotion-best-practices`** — consult `## Project-specific context` section when creating or modifying scenes with `type: "custom"` and `componentId`
```

- [ ] **Step 5: Commit**

```bash
git add packages/agent/prompts/director.md packages/agent/prompts/copywriter.md
git commit -m "docs(agent): wire remotion-best-practices into director and copywriter prompts"
```
