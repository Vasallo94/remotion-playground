# Beat Animation Sync — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix beat-offset bugs in 5 scene components and add a `calibrate_beats_from_audio` tool that back-analyzes TTS audio with Gemini to populate accurate `beat.startMs` values automatically.

**Architecture:** Two independent layers — TypeScript component fixes (Tasks 1–5) correct how beats map to visual elements; the Python calibration tool (Tasks 6–8) eliminates timing drift by replacing manually-estimated startMs with Gemini audio analysis. Either layer can be merged independently.

**Tech Stack:** TypeScript/React (Remotion), Python 3.12, google-genai SDK, pytest, `pnpm exec tsc --noEmit` for TypeScript validation.

---

## Spec correction vs. design doc

The design doc listed `BlockDiagramScene` as needing a fix. After reading the code, it is correct: blocks use `beats[i+1]` and connector arrows use `beats[i+2]` (= the target block's beat, by design). **Do not touch `BlockDiagramScene`.**

---

## File Map

| File                                                | Action | Responsibility                                        |
| --------------------------------------------------- | ------ | ----------------------------------------------------- |
| `src/.../scenes/custom/SplitScreenScene.tsx`        | Modify | Replace per-item beat indexing with per-panel beat    |
| `src/.../scenes/custom/FlowDiagramScene.tsx`        | Modify | beatOffset 2→1 in DataDrivenFlow; intro uses beats[0] |
| `src/.../scenes/custom/CodeDiffScene.tsx`           | Modify | beatOffset `title?2:1` → `title?1:0`                  |
| `src/.../scenes/custom/BrowserMockupScene.tsx`      | Modify | beatOffset `title?2:1` → `title?1:0`                  |
| `src/.../scenes/custom/ComparisonTableScene.tsx`    | Modify | Swap left=beats[1], right=beats[2] (was reversed)     |
| `packages/agent/tests/test_tools_calibrate.py`      | Create | Unit tests for calibrate tool (write first)           |
| `packages/agent/src/tools/calibrate.py`             | Create | `calibrate_beats_from_audio` function                 |
| `packages/agent/src/tools/__init__.py`              | Modify | Export `calibrate_beats_from_audio`                   |
| `packages/agent/src/subagents/voice_generator.py`   | Modify | Add calibrate tool to subagent tool list              |
| `packages/agent/prompts/orchestrator.md`            | Modify | Add `calibrate` stage description                     |
| `packages/agent/skills/scene-timing-guide/SKILL.md` | Modify | Document universal beat convention                    |

---

## Task 1: Fix SplitScreenScene — panel beats

**Files:**

- Modify: `src/compositions/ClaudeCodeTutorial/scenes/custom/SplitScreenScene.tsx:116-179`

**Problem:** `leftItemBeatStart = 2` means left items index into beats[2], beats[3], beats[4]… which don't exist. Items fall back to 450–600ms and appear in wrong order.

**Fix:** All items in the left panel share `beats[1]`; all items in the right panel share `beats[2]`.

- [ ] **Step 1: Replace the panel beat constants**

In `SplitScreenScene.tsx`, find lines 116–117:

```ts
const leftItemBeatStart = 2
const rightItemBeatStart = leftItemBeatStart + normalizedLeft.items.length
```

Replace with:

```ts
const leftPanelBeat = beats?.[1] ?? null
const rightPanelBeat = beats?.[2] ?? null
```

- [ ] **Step 2: Update left panel item beat prop**

Find the left panel's `PanelItem` render (around line 175):

```ts
                  <PanelItem
                    key={i}
                    text={item}
                    beat={beats?.[leftItemBeatStart + i] ?? null}
                    index={i}
                    accent={accent}
                    tokens={tokens}
                  />
```

Replace with:

```ts
                  <PanelItem
                    key={i}
                    text={item}
                    beat={leftPanelBeat}
                    index={i}
                    accent={accent}
                    tokens={tokens}
                  />
```

- [ ] **Step 3: Update right panel item beat prop**

Find the right panel's `PanelItem` render (around line 225):

```ts
                  <PanelItem
                    key={i}
                    text={item}
                    beat={beats?.[rightItemBeatStart + i] ?? null}
                    index={i}
                    accent={accent}
                    tokens={tokens}
                  />
```

Replace with:

```ts
                  <PanelItem
                    key={i}
                    text={item}
                    beat={rightPanelBeat}
                    index={i}
                    accent={accent}
                    tokens={tokens}
                  />
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /path/to/remotion-playground && pnpm exec tsc --noEmit
```

Expected: no errors.

---

## Task 2: Fix FlowDiagramScene — beatOffset 2→1

**Files:**

- Modify: `src/compositions/ClaudeCodeTutorial/scenes/custom/FlowDiagramScene.tsx:280–300, 336–338`

**Problem:** `DataDrivenFlow` uses `beats[2]` as visual delay anchor and `beats[i + 2]` for node cards. beats[1] is wasted. With the convention (beatOffset=1), beats[0]=intro text, beats[1]=first node.

- [ ] **Step 1: Fix visualDelay and introReveal**

In `FlowDiagramScene.tsx`, find the `DataDrivenFlow` component (around line 280):

```ts
const visualDelay = beats?.[2] ? getBeatStartFrame(beats[2], fps) : Math.ceil(fps * 0.8)
```

Replace with:

```ts
const beatOffset = 1
const visualDelay = beats?.[beatOffset] ? getBeatStartFrame(beats[beatOffset], fps) : Math.ceil(fps * 0.8)
```

- [ ] **Step 2: Fix introReveal beat**

Find (around line 288):

```ts
const introReveal = useBeatReveal({
  beat: beats?.[1] ?? undefined,
  fallbackDelayMs: 300,
  animationMs: 300,
})
```

Replace with:

```ts
const introReveal = useBeatReveal({
  beat: beats?.[0] ?? undefined,
  fallbackDelayMs: 300,
  animationMs: 300,
})
```

- [ ] **Step 3: Fix the beatOffset constant used for nodes**

Find (around line 300):

```ts
const beatOffset = 2
```

This line should now be removed — it was already added in Step 1. Verify it only appears once and the value is now `1`.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

---

## Task 3: Fix CodeDiffScene and BrowserMockupScene — beatOffset

**Files:**

- Modify: `src/compositions/ClaudeCodeTutorial/scenes/custom/CodeDiffScene.tsx:35`
- Modify: `src/compositions/ClaudeCodeTutorial/scenes/custom/BrowserMockupScene.tsx:44`

**Problem:** Both use `beatOffset = title ? 2 : 1`. With a title, the first content item gets beats[2], wasting beats[0] and beats[1]. Titles use `phase1.opacity`, not beats.

- [ ] **Step 1: Fix CodeDiffScene beatOffset**

In `CodeDiffScene.tsx`, find line 35:

```ts
const beatOffset = title ? 2 : 1
```

Replace with:

```ts
const beatOffset = title ? 1 : 0
```

- [ ] **Step 2: Fix BrowserMockupScene beatOffset**

In `BrowserMockupScene.tsx`, find line 44:

```ts
const beatOffset = title ? 2 : 1
```

Replace with:

```ts
const beatOffset = title ? 1 : 0
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

---

## Task 4: Fix ComparisonTableScene — left/right beat swap

**Files:**

- Modify: `src/compositions/ClaudeCodeTutorial/scenes/custom/ComparisonTableScene.tsx:199, 207`

**Problem:** Right column is assigned beats[1] (appears first) and left column beats[2] (appears second). This is backwards from reading order.

- [ ] **Step 1: Swap the beat assignments**

In `ComparisonTableScene.tsx`, find lines 194–210:

```tsx
<div style={{ display: "flex", width: "100%", maxWidth: 1000, gap: 40 }}>
  <ComparisonColumn
    column={leftColumn}
    accent={leftAccent}
    icon={leftIcon}
    beat={beats?.[2] ?? null}
    fallbackMs={600}
    tokens={tokens}
  />
  <ComparisonColumn
    column={rightColumn}
    accent={rightAccent}
    icon={rightIcon}
    beat={beats?.[1] ?? null}
    fallbackMs={300}
    tokens={tokens}
  />
</div>
```

Replace with:

```tsx
<div style={{ display: "flex", width: "100%", maxWidth: 1000, gap: 40 }}>
  <ComparisonColumn
    column={leftColumn}
    accent={leftAccent}
    icon={leftIcon}
    beat={beats?.[1] ?? null}
    fallbackMs={300}
    tokens={tokens}
  />
  <ComparisonColumn
    column={rightColumn}
    accent={rightAccent}
    icon={rightIcon}
    beat={beats?.[2] ?? null}
    fallbackMs={600}
    tokens={tokens}
  />
</div>
```

- [ ] **Step 2: Verify TypeScript compiles and commit all scene fixes**

```bash
pnpm exec tsc --noEmit && pnpm run lint
```

Expected: no errors, no warnings.

```bash
git add src/compositions/ClaudeCodeTutorial/scenes/custom/SplitScreenScene.tsx \
        src/compositions/ClaudeCodeTutorial/scenes/custom/FlowDiagramScene.tsx \
        src/compositions/ClaudeCodeTutorial/scenes/custom/CodeDiffScene.tsx \
        src/compositions/ClaudeCodeTutorial/scenes/custom/BrowserMockupScene.tsx \
        src/compositions/ClaudeCodeTutorial/scenes/custom/ComparisonTableScene.tsx
git commit -m "fix(scenes): standardize beat offsets — panel beats, beatOffset=1 convention"
```

---

## Task 5: Write tests for calibrate tool (TDD — write tests first)

**Files:**

- Create: `packages/agent/tests/test_tools_calibrate.py`

All tests mock the Gemini client and filesystem to stay fast and hermetic.

- [ ] **Step 1: Create the test file**

```python
# packages/agent/tests/test_tools_calibrate.py
import json
import pytest


def test_ms_from_timestamp_numeric():
    from src.tools.calibrate import _ms_from_timestamp
    assert _ms_from_timestamp(3500) == 3500
    assert _ms_from_timestamp(0) == 0


def test_ms_from_timestamp_mm_ss():
    from src.tools.calibrate import _ms_from_timestamp
    assert _ms_from_timestamp("01:23") == 83000
    assert _ms_from_timestamp("00:00") == 0
    assert _ms_from_timestamp("00:03") == 3000


def test_ms_from_timestamp_hh_mm_ss():
    from src.tools.calibrate import _ms_from_timestamp
    assert _ms_from_timestamp("00:01:30") == 90000


def test_calibrate_no_credentials(monkeypatch):
    import src.tools.calibrate as cal_mod
    monkeypatch.setattr(cal_mod, "_get_genai_client", lambda: None)

    from src.tools.calibrate import calibrate_beats_from_audio

    config = json.dumps({"id": "test", "scenes": []})
    result = calibrate_beats_from_audio(config)
    assert "error" in result.lower()
    assert "credentials" in result.lower()


def test_calibrate_skips_scenes_without_beats(tmp_path, monkeypatch):
    import src.tools.calibrate as cal_mod
    monkeypatch.setattr(cal_mod, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(cal_mod, "_get_genai_client", lambda: object())

    from src.tools.calibrate import calibrate_beats_from_audio

    config = json.dumps({
        "id": "test",
        "scenes": [{"type": "intro", "props": {"title": "Hello"}}],
    })
    result = calibrate_beats_from_audio(config)
    assert "0 scenes updated" in result


def test_calibrate_skips_scenes_without_audio_file(tmp_path, monkeypatch):
    import src.tools.calibrate as cal_mod
    monkeypatch.setattr(cal_mod, "PROJECT_ROOT", tmp_path)
    monkeypatch.setattr(cal_mod, "_get_genai_client", lambda: object())

    from src.tools.calibrate import calibrate_beats_from_audio

    config = json.dumps({
        "id": "test",
        "scenes": [{
            "type": "custom",
            "beats": [{"id": "b1", "startMs": 500, "narration": "Hola mundo"}],
        }],
    })
    result = calibrate_beats_from_audio(config)
    assert "skipped" in result


def test_calibrate_updates_startms(tmp_path, monkeypatch):
    import src.tools.calibrate as cal_mod
    monkeypatch.setattr(cal_mod, "PROJECT_ROOT", tmp_path)

    # Create the audio file
    audio_dir = tmp_path / "public" / "voiceover" / "test-vid"
    audio_dir.mkdir(parents=True)
    (audio_dir / "0.mp3").write_bytes(b"\xff\xfb\x90\x00" * 100)

    # Mock Gemini response
    gemini_reply = json.dumps([
        {"id": "b1", "startMs": 420},
        {"id": "b2", "startMs": 2750},
    ])

    class FakeResponse:
        text = gemini_reply

    class FakeModels:
        @staticmethod
        def generate_content(**kwargs):
            return FakeResponse()

    class FakeClient:
        models = FakeModels()

    monkeypatch.setattr(cal_mod, "_get_genai_client", lambda: FakeClient())

    from src.tools.calibrate import calibrate_beats_from_audio

    config = json.dumps({
        "id": "test-vid",
        "scenes": [{
            "type": "custom",
            "beats": [
                {"id": "b1", "startMs": 500, "narration": "Hola mundo"},
                {"id": "b2", "startMs": 3000, "narration": "Adios mundo"},
            ],
        }],
    })
    result = calibrate_beats_from_audio(config)
    assert "1 scenes updated" in result
    assert "420" in result
    assert "2750" in result


def test_calibrate_is_cached_on_second_call(tmp_path, monkeypatch):
    import src.tools.calibrate as cal_mod
    monkeypatch.setattr(cal_mod, "PROJECT_ROOT", tmp_path)

    audio_dir = tmp_path / "public" / "voiceover" / "test-vid"
    audio_dir.mkdir(parents=True)
    (audio_dir / "0.mp3").write_bytes(b"\xff\xfb\x90\x00" * 100)

    call_count = {"n": 0}

    gemini_reply = json.dumps([{"id": "b1", "startMs": 420}])

    class FakeResponse:
        text = gemini_reply

    class FakeModels:
        @staticmethod
        def generate_content(**kwargs):
            call_count["n"] += 1
            return FakeResponse()

    class FakeClient:
        models = FakeModels()

    monkeypatch.setattr(cal_mod, "_get_genai_client", lambda: FakeClient())

    config_str = json.dumps({
        "id": "test-vid",
        "scenes": [{
            "type": "custom",
            "beats": [{"id": "b1", "startMs": 500, "narration": "Hola"}],
        }],
    })

    from src.tools.calibrate import calibrate_beats_from_audio

    calibrate_beats_from_audio(config_str)
    calibrate_beats_from_audio(config_str)

    assert call_count["n"] == 1  # Gemini called only once; second run hits cache


def test_calibrate_skips_beats_without_narration(tmp_path, monkeypatch):
    import src.tools.calibrate as cal_mod
    monkeypatch.setattr(cal_mod, "PROJECT_ROOT", tmp_path)

    audio_dir = tmp_path / "public" / "voiceover" / "test-vid"
    audio_dir.mkdir(parents=True)
    (audio_dir / "0.mp3").write_bytes(b"\xff\xfb" * 100)

    # All beats lack narration — should skip without calling Gemini
    called = {"n": 0}

    class FakeModels:
        @staticmethod
        def generate_content(**kwargs):
            called["n"] += 1
            raise AssertionError("should not be called")

    class FakeClient:
        models = FakeModels()

    monkeypatch.setattr(cal_mod, "_get_genai_client", lambda: FakeClient())

    from src.tools.calibrate import calibrate_beats_from_audio

    config = json.dumps({
        "id": "test-vid",
        "scenes": [{
            "type": "custom",
            "beats": [{"id": "b1", "startMs": 500}],  # no narration field
        }],
    })
    result = calibrate_beats_from_audio(config)
    assert called["n"] == 0
    assert "skipped" in result
```

- [ ] **Step 2: Run tests — they must all fail with ImportError**

```bash
cd packages/agent && python -m pytest tests/test_tools_calibrate.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'src.tools.calibrate'`

---

## Task 6: Implement `calibrate_beats_from_audio`

**Files:**

- Create: `packages/agent/src/tools/calibrate.py`

- [ ] **Step 1: Create the file**

```python
# packages/agent/src/tools/calibrate.py
import hashlib
import json
from pathlib import Path
from typing import Annotated, Any

from langchain_core.tools import InjectedToolArg

from ..context import resolve_config_id
from ..paths import PROJECT_ROOT as _DEFAULT_ROOT

PROJECT_ROOT = _DEFAULT_ROOT
CALIBRATION_MODEL = "gemini-3.1-pro-preview"


def _ms_from_timestamp(ts: str | int | float) -> int:
    """Parse a timestamp to ms. Accepts MM:SS, HH:MM:SS strings, or numeric ms."""
    if isinstance(ts, (int, float)):
        return int(ts)
    ts = str(ts).strip()
    if ":" in ts:
        parts = ts.split(":")
        if len(parts) == 2:
            return (int(parts[0]) * 60 + int(parts[1])) * 1000
        if len(parts) == 3:
            return (int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])) * 1000
    return int(float(ts))


def _calibration_fingerprint(mp3_path: Path, narrations: list[str]) -> str:
    """SHA-256 of first 8KB of audio + narration texts — used for caching."""
    audio_sample = mp3_path.read_bytes()[:8192] if mp3_path.exists() else b""
    payload = json.dumps(narrations).encode() + audio_sample
    return hashlib.sha256(payload).hexdigest()


def _get_genai_client():
    from .voice import _get_genai_client as _voice_client
    return _voice_client()


def _calibrate_scene(client, mp3_path: Path, beats: list[dict]) -> list[dict]:
    """Ask Gemini to find start timestamps of each beat's narration in the audio."""
    items_with_narration = [
        {"index": i, "id": b.get("id", str(i)), "narration": b["narration"]}
        for i, b in enumerate(beats)
        if b.get("narration")
    ]
    if not items_with_narration:
        return beats

    from google.genai import types

    lines = [
        "This is a Spanish voiceover audio clip. Identify the start time in MILLISECONDS"
        " (integer) where each labeled phrase begins. Return ONLY a JSON array, no other text.\n"
    ]
    for item in items_with_narration:
        lines.append(f'[{item["index"]}] id="{item["id"]}" → "{item["narration"]}"')
    lines.append('\nReturn: [{"id": "<id>", "startMs": <integer_ms>}, ...]')
    prompt = "\n".join(lines)

    audio_bytes = mp3_path.read_bytes()
    response = client.models.generate_content(
        model=CALIBRATION_MODEL,
        contents=[
            types.Part(inline_data=types.Blob(mime_type="audio/mp3", data=audio_bytes)),
            types.Part(text=prompt),
        ],
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )

    parsed = json.loads(response.text.strip())
    updates = {
        item["id"]: _ms_from_timestamp(item["startMs"])
        for item in parsed
        if "id" in item and "startMs" in item
    }

    return [{**beat, "startMs": updates[beat.get("id", "")]} if beat.get("id", "") in updates else beat for beat in beats]


def calibrate_beats_from_audio(
    config_json: str,
    runtime: Annotated[Any, InjectedToolArg] = None,
) -> str:
    """Analyze generated voiceover audio and rewrite beat.startMs to match real timing.

    For each scene with beats and a generated MP3, sends the audio inline to Gemini
    multimodal and asks it to identify the start time of each narrated phrase.
    Updates beat.startMs with real timestamps and writes the config back to disk.

    Args:
        config_json: The full video config as a JSON string. Do not pass a file path.
    """
    try:
        config = json.loads(config_json)
    except (json.JSONDecodeError, TypeError):
        return "Error: config_json must be a valid JSON string."

    client = _get_genai_client()
    if not client:
        return "Error: no Google credentials found. Set GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_AI_API_KEY."

    config_id = resolve_config_id(runtime, config)
    voiceover_dir = PROJECT_ROOT / "public" / "voiceover" / config_id

    scenes = config.get("scenes", [])
    results: list[str] = []
    calibrated_count = 0

    for i, scene in enumerate(scenes):
        beats = scene.get("beats")
        if not beats:
            continue

        mp3_path = voiceover_dir / f"{i}.mp3"
        if not mp3_path.exists():
            results.append(f"scene {i}: skipped (no audio file at {mp3_path})")
            continue

        narrations = [b.get("narration", "") for b in beats]
        if not any(narrations):
            results.append(f"scene {i}: skipped (no narration text in beats)")
            continue

        fingerprint = _calibration_fingerprint(mp3_path, narrations)
        cache_path = voiceover_dir / f"{i}.calibration.json"

        if cache_path.exists():
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            if cached.get("fingerprint") == fingerprint:
                results.append(f"scene {i}: skipped (cached)")
                continue

        try:
            original_ms = [b.get("startMs") for b in beats]
            updated_beats = _calibrate_scene(client, mp3_path, beats)
            new_ms = [b.get("startMs") for b in updated_beats]

            config["scenes"][i] = {**scene, "beats": updated_beats}
            cache_path.write_text(json.dumps({"fingerprint": fingerprint}), encoding="utf-8")
            calibrated_count += 1
            results.append(f"scene {i}: calibrated {len(beats)} beats ({original_ms} → {new_ms})")
        except Exception as e:
            results.append(f"scene {i}: ERROR — {e}")

    # Write updated config back to disk
    from .configs import _resolve_config_path
    try:
        config_file = _resolve_config_path(config_id)
        config_file.write_text(json.dumps(config, indent=2, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        results.append(f"Warning: could not write config back to disk — {e}")

    summary = "\n".join(results)
    return f"Beat calibration complete. {calibrated_count} scenes updated.\n{summary}"
```

- [ ] **Step 2: Run the tests — they must all pass**

```bash
cd packages/agent && python -m pytest tests/test_tools_calibrate.py -v
```

Expected: all 8 tests PASS.

- [ ] **Step 3: Run the full test suite**

```bash
python -m pytest tests/ -v --tb=short 2>&1 | tail -20
```

Expected: all existing tests still pass (no regressions).

---

## Task 7: Register calibrate tool and update subagent

**Files:**

- Modify: `packages/agent/src/tools/__init__.py`
- Modify: `packages/agent/src/subagents/voice_generator.py`

- [ ] **Step 1: Export from tools **init**.py**

In `packages/agent/src/tools/__init__.py`, add to the end of existing imports:

```python
from .calibrate import calibrate_beats_from_audio
```

The full file should look like:

```python
from .catalog import query_scene_catalog
from .configs import (
    list_video_configs,
    load_video_config,
    present_revision_plan,
    present_target_selection,
    present_variant_plan,
    save_pipeline_config_to_source,
    stage_existing_config,
)
from .pipeline import create_pipeline_plan, get_next_pipeline_step, read_pipeline_plan, record_pipeline_decision, update_pipeline_step
from .qa import present_qa_report, qa_scenes, render_scene_stills
from .render import check_render_status, present_escaleta, submit_render
from .research import scrape_product, web_fetch, web_search
from .sound import list_audio_library
from .calibrate import calibrate_beats_from_audio
```

- [ ] **Step 2: Add tool to voice_generator subagent**

In `packages/agent/src/subagents/voice_generator.py`:

```python
from ..orchestrator import MODEL_FLASH, create_model, create_skills_middleware, load_prompt
from ..tools.pipeline import read_pipeline_plan, update_pipeline_step
from ..tools.voice import generate_voiceover
from ..tools.calibrate import calibrate_beats_from_audio


def create_voice_generator() -> dict:
    """Create the voice generator SubAgent definition."""
    return {
        "name": "voice_generator",
        "description": "Generates voiceover audio via Gemini TTS for each scene, then calibrates beat timings from the audio.",
        "system_prompt": load_prompt("voice_generator"),
        "model": create_model(MODEL_FLASH),
        "tools": [read_pipeline_plan, update_pipeline_step, generate_voiceover, calibrate_beats_from_audio],
        "middleware": [create_skills_middleware()],
    }
```

- [ ] **Step 3: Verify import chain works**

```bash
cd packages/agent && python -c "from src.tools import calibrate_beats_from_audio; print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Run full test suite**

```bash
python -m pytest tests/ -v --tb=short 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/agent/src/tools/calibrate.py \
        packages/agent/src/tools/__init__.py \
        packages/agent/src/subagents/voice_generator.py \
        packages/agent/tests/test_tools_calibrate.py
git commit -m "feat(agent): add calibrate_beats_from_audio tool — auto-populate beat.startMs from TTS audio"
```

---

## Task 8: Update pipeline docs and director skill

**Files:**

- Modify: `packages/agent/prompts/orchestrator.md`
- Modify: `packages/agent/skills/scene-timing-guide/SKILL.md`

- [ ] **Step 1: Add calibrate stage to orchestrator.md**

Open `packages/agent/prompts/orchestrator.md`. Find the section describing pipeline stages (likely a list like `voice_generator → sound_engineer`). Add a `calibrate` stage between `voice_generator` and `sound_engineer`:

```markdown
## calibrate (stage after voice_generator)

**Agent:** voice_generator (same subagent, extra tool)  
**Tool:** `calibrate_beats_from_audio(config_json)`  
**When to run:** After `generate_voiceover` succeeds and before `sound_engineer` starts. Skip if voiceover is disabled.  
**What it does:** Sends each scene's generated MP3 to Gemini multimodal, asks it to identify the real start time of each beat's narration phrase, and updates `beat.startMs` in the config. Eliminates the gap between manually-estimated startMs and what the TTS actually produces.  
**Output:** Updated `config.json` on disk with accurate beat timestamps.
```

- [ ] **Step 2: Document the universal beat convention in scene-timing-guide SKILL.md**

Open `packages/agent/skills/scene-timing-guide/SKILL.md`. Add (or update) a section titled "Universal Beat Convention":

```markdown
## Universal Beat Convention

Every scene follows one indexing rule. **beats[0] = first narration moment** (the first thing the narrator says that has a matching visual reveal). Scene titles use `usePhase1Entry()` and do NOT consume a beat.

### beatOffset rule

- Scenes **with** a `title` prop: `beatOffset = 1` (title appears at Phase 1, so beats[0] = first content item)
- Scenes **without** a title: `beatOffset = 0`

### Panel-based scenes (split-screen, comparison-table)

Author **one beat per panel**. All items within a panel appear simultaneously when that beat fires.
```

beats[0] → first narration moment after title
beats[1] → left/first panel (all items appear together)
beats[2] → right/second panel (all items appear together)

```

### Per-item scenes (icon-grid, bullet-slide, step-list, timeline)
Author **one beat per item**:
```

beats[0] → first item (beatOffset = 1 if title present, else 0)
beats[1] → second item
…

```

### Never leave beats[0] unused
The first beat in every scene must have a valid `startMs` that matches the first moment in the narration audio where something visual changes. The `calibrate_beats_from_audio` tool will overwrite `startMs` values with real measured times after TTS generation.
```

- [ ] **Step 3: Commit**

```bash
git add packages/agent/prompts/orchestrator.md \
        packages/agent/skills/scene-timing-guide/SKILL.md
git commit -m "docs(agent): document universal beat convention and calibrate pipeline stage"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All spec items covered. BlockDiagramScene excluded (correctly implemented per code audit).
- [x] **Placeholders:** None — all steps include full code.
- [x] **Type consistency:** `_ms_from_timestamp` defined in Task 6, used in tests from Task 5 (import path consistent). `calibrate_beats_from_audio` signature identical in tests and implementation.
- [x] **TDD order:** Tests written in Task 5 before implementation in Task 6.
- [x] **Independence:** Tasks 1–4 (TypeScript) are fully independent of Tasks 5–8 (Python). Either can be merged alone.
- [x] **Config write-back:** Tool imports `_resolve_config_path` from `tools.configs` — private function but same module. If this import breaks, add a `resolve_config_path` public alias in `configs.py` and update the import.
