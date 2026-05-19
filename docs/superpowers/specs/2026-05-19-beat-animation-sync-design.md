# Beat Animation Sync — Design Spec

**Date:** 2026-05-19  
**Status:** Approved

## Problem

Two classes of bugs break the visual-audio sync across scene components:

1. **Beat offset bugs** — hardcoded indices in several scenes cause items to consume the wrong beats or fall through to fallback timing, producing reveals in the wrong order or at wrong times.
2. **Beat timing drift** — beat `startMs` values in configs are manually estimated by the director agent. The actual TTS audio speaks at its own pace, so cards appear seconds before or after the narration.

### Observed symptoms

- `SplitScreenScene` (Prompt Engineering slide): items 2 and 3 of the left column appear immediately (fallback ~450–600ms); item 1 appears at 7s (wrong panel beat).
- `IconGridScene` (Niveles de Abstracción): cards appear noticeably before or after the narrator mentions them.

## Acceptance Criteria

- [ ] All scene components follow the universal beat convention (see below).
- [ ] `SplitScreenScene` left-panel items all appear when beats[1] fires; right-panel items when beats[2] fires.
- [ ] `FlowDiagramScene`, `BlockDiagramScene`, `CodeDiffScene`, `BrowserMockupScene` use `beatOffset = 1` (not 2).
- [ ] `ComparisonTableScene` left column uses beats[1], right column uses beats[2] (reading order).
- [ ] New `calibrate_beats_from_audio` tool exists and updates beat `startMs` from Gemini audio analysis.
- [ ] The pipeline plan includes a `calibrate` stage after `voice_generator`.
- [ ] Director skill (`scene-timing-guide`) documents the universal beat convention.

---

## Universal Beat Convention

Every scene follows this one rule:

> **beats[0]** is reserved for the scene title / intro element (if present).  
> Scene titles already use `usePhase1Entry()` and do NOT consume a beat.  
> Therefore **beats[0]** maps to the _first named narrative moment_ in the scene.  
> Subsequent beats are sequential: beats[1], beats[2], …

For scenes with a title prop: `beatOffset = 1` — the title Phase-1 entry happens before beats[0] fires.  
For scenes without a title: `beatOffset = 0`.

### Panel-based scenes (SplitScreen, ComparisonTable)

These scenes contain _panels_ with multiple items each. All items within a panel share **one** beat (the panel beat). Items appear simultaneously when the panel beat fires.

```
beats[0] → scene intro / title area (first narration point)
beats[1] → left/first panel — ALL items appear together
beats[2] → right/second panel — ALL items appear together
```

### Per-item scenes (IconGrid, BulletSlide, StepList, Timeline)

Each item gets its own beat:

```
beats[0] → title / intro moment  (beatOffset = 1)
beats[1] → item 0
beats[2] → item 1
beats[3] → item 2
…
```

### Fixed-element scenes (BeforeAfter, StatReveal, ApiRequest)

Beats map to named visual elements defined by the scene. Convention is:

```
beats[0] → first element to reveal
beats[1] → second element
…
```

---

## Part 1 — Scene Code Fixes

### 1a. SplitScreenScene (`SplitScreenScene.tsx`)

**Current bug:** `leftItemBeatStart = 2` (hardcoded), causing items to index into non-existent beats.

**Fix:** Replace per-item beat indexing with per-panel beat assignment.

```ts
// Remove:
const leftItemBeatStart = 2
const rightItemBeatStart = leftItemBeatStart + normalizedLeft.items.length

// Add:
const leftPanelBeat = beats?.[1] ?? null
const rightPanelBeat = beats?.[2] ?? null
```

`PanelItem` receives `leftPanelBeat` for every left item and `rightPanelBeat` for every right item. Since `useBeatReveal` returns identical timing for the same beat, all items in a panel appear simultaneously.

### 1b. FlowDiagramScene (`FlowDiagramScene.tsx`)

**Current bug:** `beatOffset = 2` hardcoded. `DataDrivenFlow` uses `beats[2]` as visual delay anchor and `beats[i + 2]` for nodes.

**Fix:** Change to `beatOffset = 1`.

- `beats[0]` → intro text reveal (currently `beats[1]`)
- `beats[1]` → first node + visual delay anchor (currently `beats[2]`)
- `beats[2+]` → subsequent nodes

```ts
// DataDrivenFlow:
const beatOffset = 1
const visualDelay = beats?.[beatOffset] ? getBeatStartFrame(beats[beatOffset], fps) : Math.ceil(fps * 0.8)
const introReveal = useBeatReveal({ beat: beats?.[0] ?? undefined, ... })
// FlowNodeCard:
beat={beats?.[i + beatOffset] ?? null}
```

### 1c. BlockDiagramScene (`BlockDiagramScene.tsx`)

**Fix:** Change `beats[i + 2]` → `beats[i + 1]`.

### 1d. CodeDiffScene (`CodeDiffScene.tsx`)

**Current:** `beatOffset = title ? 2 : 1`  
**Fix:** `beatOffset = title ? 1 : 0`

With a title, the title uses Phase-1 entry; beats[0] = first diff line. Without title: beats[0] = first diff line.

### 1e. BrowserMockupScene (`BrowserMockupScene.tsx`)

**Current:** `beatOffset = title ? 2 : 1`  
**Fix:** `beatOffset = title ? 1 : 0`

### 1f. ComparisonTableScene (`ComparisonTableScene.tsx`)

**Current bug:** Left column = `beats[2]`, right column = `beats[1]` — right appears before left, reversed from reading order.  
**Fix:** Left = `beats[1]`, right = `beats[2]` (left panel appears first, matching natural reading direction).

```ts
<ComparisonColumn beat={beats?.[1] ?? null} ... />  {/* left */}
<ComparisonColumn beat={beats?.[2] ?? null} ... />  {/* right */}
```

---

## Part 2 — `calibrate_beats_from_audio` Tool

### Location

`packages/agent/src/tools/calibrate.py`

### Function

```python
def calibrate_beats_from_audio(config_json: str, runtime=None) -> str:
    """Analyze generated voiceover audio and rewrite beat.startMs to match real timing."""
```

### Algorithm

For each scene in the config that has **both** a `beats` array and a generated MP3 at `public/voiceover/{config_id}/{scene_index}.mp3`:

1. Read the MP3 as base64 bytes.
2. Build a Gemini multimodal request (`gemini-3.1-pro-preview`) with the audio inline and a structured prompt:

```
This is a Spanish voiceover audio clip. Identify the start time in milliseconds
of each labeled narration phrase. Return ONLY a JSON array.

Phrases:
[0] id="<beat.id>" → "<beat.narration>"
[1] id="<beat.id>" → "<beat.narration>"
...

Return: [{"id": "<id>", "startMs": <integer>}, ...]
```

3. Parse the JSON response. Convert any MM:SS timestamps to ms if needed.
4. For each returned `{id, startMs}`, find the matching beat by `id` and update `startMs`.
5. Write the updated config back to disk.
6. Return a summary: `scene {idx}: calibrated {n} beats (was: [old...] → now: [new...])`.

### Caching

Skip a scene if the MP3 fingerprint (SHA-256) + beat narration texts are unchanged since last calibration. Store fingerprint in a sidecar file `{scene_index}.calibration.json` next to the audio.

### Error handling

- If Gemini returns a phrase it cannot locate (no timestamp), keep the original `startMs` and log a warning.
- If the audio file does not exist, skip the scene.
- If all beats lack narration text, skip the scene.

### Registration

Add `calibrate_beats_from_audio` to:

- `packages/agent/src/tools/__init__.py`
- `packages/agent/src/subagents/voice_generator.py` tool list

---

## Part 3 — Pipeline Integration

### New stage: `calibrate`

Add a `calibrate` stage to the pipeline plan, between `voice_generator` and `sound_engineer`:

```
research → copywriter → director → scene_qa → audio_planner →
voice_generator → calibrate → sound_engineer → validator →
render_stills → final_validator → render_video
```

The `calibrate` stage is handled by the `voice_generator` subagent (same agent, new tool). No new subagent needed.

### Orchestrator prompt update

Add to `packages/agent/prompts/orchestrator.md`:

```markdown
## calibrate (after voice_generator)

Run `calibrate_beats_from_audio` on the current config. This rewrites beat.startMs
values using Gemini audio analysis of the generated MP3s, replacing manual estimates
with real timing. The updated config is saved to disk before sound design begins.
Skip if voiceover is disabled.
```

---

## Part 4 — Director Skill Update

Update `packages/agent/skills/scene-timing-guide/SKILL.md` to document the universal beat convention (see above). Key rules to add:

- **All scenes**: `beatOffset = 1` when title present (title uses Phase-1, not a beat).
- **Panel scenes** (split-screen, comparison-table): one beat per panel; all items in panel appear simultaneously.
- **Per-item scenes** (icon-grid, bullet-slide, step-list, timeline): one beat per item after the title beat.
- **beats[0]** is always the first narration moment; never leave it unused.

---

## Files to Create / Modify

| File                                                                         | Action                             |
| ---------------------------------------------------------------------------- | ---------------------------------- |
| `src/compositions/ClaudeCodeTutorial/scenes/custom/SplitScreenScene.tsx`     | Fix panel beat assignment          |
| `src/compositions/ClaudeCodeTutorial/scenes/custom/FlowDiagramScene.tsx`     | Fix beatOffset 2→1                 |
| `src/compositions/ClaudeCodeTutorial/scenes/custom/BlockDiagramScene.tsx`    | Fix beats[i+2]→beats[i+1]          |
| `src/compositions/ClaudeCodeTutorial/scenes/custom/CodeDiffScene.tsx`        | Fix beatOffset 2→1                 |
| `src/compositions/ClaudeCodeTutorial/scenes/custom/BrowserMockupScene.tsx`   | Fix beatOffset 2→1                 |
| `src/compositions/ClaudeCodeTutorial/scenes/custom/ComparisonTableScene.tsx` | Fix left/right swap                |
| `packages/agent/src/tools/calibrate.py`                                      | Create new tool                    |
| `packages/agent/src/tools/__init__.py`                                       | Register tool                      |
| `packages/agent/src/subagents/voice_generator.py`                            | Add calibrate tool to tool list    |
| `packages/agent/prompts/orchestrator.md`                                     | Add calibrate stage                |
| `packages/agent/skills/scene-timing-guide/SKILL.md`                          | Document universal beat convention |

## Test Cases

- `SplitScreenScene` with 3 beats: left items all appear at beats[1].startMs, right items at beats[2].startMs. No item appears at fallback if its panel beat is set.
- `ComparisonTableScene` with 3 beats: left column at beats[1], right at beats[2] (left first).
- `FlowDiagramScene` with 4 nodes + beats: node 0 appears at beats[1], node 1 at beats[2], etc.
- `calibrate_beats_from_audio`: updates startMs values; second call on same audio is a no-op (cached).
- `calibrate_beats_from_audio`: skips scenes with no audio file gracefully.
