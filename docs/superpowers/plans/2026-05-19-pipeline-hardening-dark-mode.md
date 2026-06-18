# Pipeline Hardening + Light/Dark Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix scene_qa ordering, add zombie-queue circuit breaker, persist pipeline state to disk, and add light/dark mode toggle to the web frontend.

**Architecture:** Items 1-3 are surgical edits to `packages/agent/src/tools/pipeline.py` with corresponding test updates. Item 4 introduces a `ThemeContext` in `packages/web/src/` and updates all 24 components that currently read `theme` as a static import to call a `useAppTheme()` hook instead, enabling reactive switching.

**Tech Stack:** Python 3.12 + pytest (agent), React 18 + TypeScript + Vite (web)

---

## Task 1: Reorder `scene_qa` after `scene_creation` in DEFAULT_STEPS

**Why this matters:** QA currently runs _before_ custom scenes are created, so it can't catch regressions in the custom components that most often break.

**Files:**

- Modify: `packages/agent/src/tools/pipeline.py:14-26` (DEFAULT_STEPS["new_video"])
- Modify: `packages/agent/tests/test_tools_pipeline.py` (update step order assertion)

- [ ] **Step 1: Write a failing test for the new step order**

Open `packages/agent/tests/test_tools_pipeline.py` and add this test:

```python
def test_new_video_steps_scene_qa_after_scene_creation(monkeypatch):
    install_backend(monkeypatch)
    result = pipeline.create_pipeline_plan("new_video", "Test order")
    steps = result["plan"]["steps"]
    ids = [s["id"] for s in steps]
    scene_creation_idx = ids.index("scene_creation")
    scene_qa_idx = ids.index("scene_qa")
    assert scene_qa_idx > scene_creation_idx, (
        f"scene_qa (pos {scene_qa_idx}) must come after scene_creation (pos {scene_creation_idx})"
    )
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/agent && python -m pytest tests/test_tools_pipeline.py::test_new_video_steps_scene_qa_after_scene_creation -v
```

Expected: FAIL — `scene_qa` is currently at index 4, `scene_creation` at index 8.

- [ ] **Step 3: Reorder DEFAULT_STEPS["new_video"] in pipeline.py**

In `packages/agent/src/tools/pipeline.py`, replace the `"new_video"` entry inside `DEFAULT_STEPS`:

```python
    "new_video": [
        {"id": "research", "owner": "researcher", "title": "Research topic and audience"},
        {"id": "copywriting", "owner": "copywriter", "title": "Create escaleta and config"},
        {"id": "draft_validation", "owner": "orchestrator", "title": "Validate draft config"},
        {"id": "direction", "owner": "director", "title": "Polish timing and beats"},
        {"id": "audio_plan", "owner": "audio_planner", "title": "Plan voiceover and sound"},
        {"id": "voice_generation", "owner": "voice_generator", "title": "Generate voiceover"},
        {"id": "sound_assets", "owner": "sound_engineer", "title": "Prepare music and SFX"},
        {"id": "scene_creation", "owner": "scene_creator", "title": "Create missing custom scenes"},
        {"id": "scene_qa", "owner": "scene_qa", "title": "Review scene stills"},
        {"id": "final_validation", "owner": "validator", "title": "Validate final config and assets"},
        {"id": "render", "owner": "orchestrator", "title": "Render video"},
        {"id": "review", "owner": "reviewer", "title": "Review rendered output"},
    ],
```

- [ ] **Step 4: Update the existing step-order assertion that hard-codes position**

In `packages/agent/tests/test_tools_pipeline.py`, find the assertion:

```python
    assert [step["owner"] for step in saved["steps"][:3]] == ["researcher", "copywriter", "orchestrator"]
```

This still passes (first 3 steps didn't change). But also update any assertion that checked `scene_qa` position explicitly (search for `"scene_qa"` in the file). There is one assertion in `test_create_pipeline_plan_persists_default_new_video_steps` that checks `steps[:3]`—that's fine. No other hard-coded position tests exist, so no further changes needed.

- [ ] **Step 5: Run all pipeline tests**

```bash
cd packages/agent && python -m pytest tests/test_tools_pipeline.py -v
```

Expected: all pass including the new ordering test.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/tools/pipeline.py packages/agent/tests/test_tools_pipeline.py
git commit -m "fix(pipeline): move scene_qa after scene_creation in new_video steps"
```

---

## Task 2: Circuit Breaker — Stall Detection in `get_next_pipeline_step`

**Why this matters:** When a subagent exits without calling `update_pipeline_step`, the plan stays `in_progress` forever and the orchestrator enters a tight poll loop (218+ calls, burning tokens). The circuit breaker detects this and surfaces a `stalled` status so the orchestrator can intervene.

**Mechanism:** Each call to `get_next_pipeline_step` that finds an `in_progress` step for the _same step id_ increments a `stallCount` field stored in the plan. When `stallCount` ≥ 10 the tool returns `status: "stalled"` instead of `status: "in_progress"`.

**Files:**

- Modify: `packages/agent/src/tools/pipeline.py` — `get_next_pipeline_step` function
- Modify: `packages/agent/tests/test_tools_pipeline.py` — add stall tests

- [ ] **Step 1: Write failing tests for stall detection**

Add to `packages/agent/tests/test_tools_pipeline.py`:

```python
def test_get_next_step_returns_in_progress_below_stall_threshold(monkeypatch):
    backend = install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Test stall")
    # Mark first step as in_progress
    pipeline.update_pipeline_step("research", "in_progress")

    # 9 polls should still return in_progress
    for _ in range(9):
        result = pipeline.get_next_pipeline_step()
        assert result["status"] == "in_progress"


def test_get_next_step_returns_stalled_after_threshold(monkeypatch):
    backend = install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Test stall")
    pipeline.update_pipeline_step("research", "in_progress")

    for _ in range(9):
        pipeline.get_next_pipeline_step()

    # 10th poll crosses threshold → stalled
    result = pipeline.get_next_pipeline_step()
    assert result["status"] == "stalled"
    assert result["stalledStep"]["id"] == "research"
    assert "stallCount" in result


def test_stall_counter_resets_after_step_advances(monkeypatch):
    backend = install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Test stall reset")
    pipeline.update_pipeline_step("research", "in_progress")

    for _ in range(5):
        pipeline.get_next_pipeline_step()

    # Complete the step — counter should reset
    pipeline.update_pipeline_step("research", "completed", summary="done")

    # Mark next step in_progress; counter starts fresh
    pipeline.update_pipeline_step("copywriting", "in_progress")
    for _ in range(9):
        result = pipeline.get_next_pipeline_step()
        assert result["status"] == "in_progress"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/agent && python -m pytest tests/test_tools_pipeline.py::test_get_next_step_returns_stalled_after_threshold -v
```

Expected: FAIL — `get_next_pipeline_step` returns `in_progress`, not `stalled`.

- [ ] **Step 3: Implement stall detection in `get_next_pipeline_step`**

In `packages/agent/src/tools/pipeline.py`, replace the `get_next_pipeline_step` function body (the part that handles `in_progress`):

```python
def get_next_pipeline_step(
    runtime: Annotated[Any, InjectedToolArg] = None,
) -> dict[str, Any]:
    """Return the next actionable step from `/pipeline/plan.json`.

    Reads the plan and returns the pipeline's current state:
    - `"next_step"`: a pending step is ready to execute.
    - `"in_progress"`: one or more steps are already running (below stall threshold).
    - `"stalled"`: an in_progress step has been polled ≥10 times without advancing.
    - `"blocked"`: a step is blocked and needs resolution.
    - `"all_completed"`: every step is completed or skipped.
    - `"no_plan"`: no plan exists yet.
    """
    _STALL_THRESHOLD = 10

    backend = _backend()
    plan = _read_plan(backend)
    if plan is None:
        return {
            "status": "no_plan",
            "instruction": "Call create_pipeline_plan after route_intent.",
        }

    steps = plan.get("steps", [])
    completed, blocked, in_progress, pending = [], [], [], []
    for s in steps:
        st = s.get("status")
        if st in ("completed", "skipped"):
            completed.append(s)
        elif st == "blocked":
            blocked.append(s)
        elif st == "in_progress":
            in_progress.append(s)
        elif st == "pending":
            pending.append(s)

    progress = {
        "completed": len(completed),
        "total": len(steps),
        "completedIds": [s["id"] for s in completed],
    }

    if blocked:
        return {
            "status": "blocked",
            "steps": blocked,
            "reason": f"Step '{blocked[0]['id']}' is blocked: {blocked[0].get('blockers', [])}",
            "progress": progress,
        }

    if in_progress:
        stalled_step = in_progress[0]
        current_stall_id = plan.get("_stallStepId")
        stall_count = plan.get("_stallCount", 0)

        if current_stall_id == stalled_step["id"]:
            stall_count += 1
        else:
            stall_count = 1

        plan["_stallStepId"] = stalled_step["id"]
        plan["_stallCount"] = stall_count
        _write_plan(backend, plan)

        if stall_count >= _STALL_THRESHOLD:
            return {
                "status": "stalled",
                "stalledStep": stalled_step,
                "stallCount": stall_count,
                "reason": (
                    f"Step '{stalled_step['id']}' has been in_progress for {stall_count} consecutive polls. "
                    "The owning subagent likely exited without calling update_pipeline_step. "
                    "Call update_pipeline_step to mark it failed or completed, then proceed."
                ),
                "progress": progress,
            }

        return {
            "status": "in_progress",
            "steps": in_progress,
            "reason": f"Step '{stalled_step['id']}' is being executed by {stalled_step.get('owner', '?')}",
            "progress": progress,
        }

    if not pending:
        return {
            "status": "all_completed",
            "reason": "All steps are completed or skipped.",
            "progress": progress,
        }

    next_step = pending[0]
    # Clear stall tracking when advancing to next step
    plan.pop("_stallStepId", None)
    plan.pop("_stallCount", None)
    _write_plan(backend, plan)

    return {
        "status": "next_step",
        "step": next_step,
        "progress": progress,
        "instruction": f"Dispatch '{next_step['owner']}' to execute step '{next_step['id']}'.",
    }
```

Note: The original function ended with the `next_step` return — restore the `"instruction"` field from the original if it was there, or add it as shown.

- [ ] **Step 4: Run all three stall tests**

```bash
cd packages/agent && python -m pytest tests/test_tools_pipeline.py -k "stall" -v
```

Expected: 3 tests pass.

- [ ] **Step 5: Run full pipeline test suite**

```bash
cd packages/agent && python -m pytest tests/test_tools_pipeline.py -v
```

Expected: all existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/tools/pipeline.py packages/agent/tests/test_tools_pipeline.py
git commit -m "feat(pipeline): add circuit breaker — stall detection after 10 consecutive in_progress polls"
```

---

## Task 3: Persist `plan.json` to Disk on Every Write

**Why this matters:** `StateBackend` is LangGraph's in-memory thread store — it evaporates on container restart. The plan must survive restarts so the frontend can always poll `/pipeline/plan.json` and operators can debug failed runs.

**Approach:** Add a secondary disk write alongside the existing `StateBackend` write. The disk path is `PROJECT_ROOT/.generated/pipeline/plan.json` — the `.generated/` directory is already bind-mounted in `docker-compose.yml`. On startup, `_read_plan` falls back to the disk file if the in-memory store is empty.

**Files:**

- Modify: `packages/agent/src/tools/pipeline.py` — `_write_plan` and `_read_plan`
- Modify: `packages/agent/src/paths.py` — add `PIPELINE_STATE_FILE` constant
- Modify: `packages/agent/tests/test_tools_pipeline.py` — tests for disk fallback

- [ ] **Step 1: Add `PIPELINE_STATE_FILE` to `paths.py`**

In `packages/agent/src/paths.py`, add after the existing `AUDIO_BASE_DIR` line:

```python
PIPELINE_STATE_FILE = PROJECT_ROOT / ".generated" / "pipeline" / "plan.json"
```

- [ ] **Step 2: Write failing tests for disk persistence**

Add to `packages/agent/tests/test_tools_pipeline.py`:

```python
import tempfile
from pathlib import Path
from src import paths as agent_paths


def test_plan_is_written_to_disk(monkeypatch, tmp_path):
    install_backend(monkeypatch)
    disk_path = tmp_path / "pipeline" / "plan.json"
    monkeypatch.setattr(agent_paths, "PIPELINE_STATE_FILE", disk_path)

    pipeline.create_pipeline_plan("new_video", "Test disk write")

    assert disk_path.exists(), "plan.json was not written to disk"
    saved = json.loads(disk_path.read_text())
    assert saved["mode"] == "new_video"


def test_read_plan_falls_back_to_disk_when_store_empty(monkeypatch, tmp_path):
    install_backend(monkeypatch)  # fresh empty store
    disk_path = tmp_path / "pipeline" / "plan.json"
    monkeypatch.setattr(agent_paths, "PIPELINE_STATE_FILE", disk_path)

    # Manually write a plan to disk (simulating recovery after restart)
    disk_path.parent.mkdir(parents=True)
    disk_path.write_text(json.dumps({"mode": "new_video", "steps": [], "status": "pending"}))

    result = pipeline.read_pipeline_plan()

    assert result["exists"] is True
    assert result["plan"]["mode"] == "new_video"
```

- [ ] **Step 3: Run failing tests**

```bash
cd packages/agent && python -m pytest tests/test_tools_pipeline.py -k "disk" -v
```

Expected: both fail.

- [ ] **Step 4: Update `_write_plan` to write to disk**

In `packages/agent/src/tools/pipeline.py`, replace the `_write_plan` function:

```python
def _write_plan(backend: Any, plan: dict[str, Any]) -> None:
    content = json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
    # Primary: in-memory StateBackend (used by frontend's /pipeline/plan.json endpoint)
    backend.upload_files([(PIPELINE_PLAN_PATH, content.encode("utf-8"))])
    # Secondary: disk for restart recovery (PROJECT_ROOT/.generated/pipeline/plan.json)
    from .paths import PIPELINE_STATE_FILE  # noqa: PLC0415
    PIPELINE_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    PIPELINE_STATE_FILE.write_text(content, encoding="utf-8")
```

Wait — `pipeline.py` is in `packages/agent/src/tools/pipeline.py` and `paths.py` is in `packages/agent/src/paths.py`. The import should be:

```python
from ..paths import PIPELINE_STATE_FILE
```

Add this to the top-level imports of `pipeline.py` instead of a local import:

```python
from ..paths import PIPELINE_STATE_FILE
```

Then the `_write_plan` function becomes:

```python
def _write_plan(backend: Any, plan: dict[str, Any]) -> None:
    content = json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
    backend.upload_files([(PIPELINE_PLAN_PATH, content.encode("utf-8"))])
    PIPELINE_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    PIPELINE_STATE_FILE.write_text(content, encoding="utf-8")
```

- [ ] **Step 5: Update `_read_plan` to fall back to disk**

Replace `_read_plan`:

```python
def _read_plan(backend: Any) -> dict[str, Any] | None:
    result = backend.read(PIPELINE_PLAN_PATH)
    if not getattr(result, "error", None):
        file_data = getattr(result, "file_data", None)
        if file_data:
            return json.loads(file_data.get("content", ""))

    # Fallback: disk recovery (survives container restart)
    from ..paths import PIPELINE_STATE_FILE  # already imported at module level
    if PIPELINE_STATE_FILE.exists():
        try:
            return json.loads(PIPELINE_STATE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None

    return None
```

Since we're importing `PIPELINE_STATE_FILE` at top-level now, remove the local import inside `_read_plan` and just reference it directly.

Final `_read_plan`:

```python
def _read_plan(backend: Any) -> dict[str, Any] | None:
    result = backend.read(PIPELINE_PLAN_PATH)
    if not getattr(result, "error", None):
        file_data = getattr(result, "file_data", None)
        if file_data:
            return json.loads(file_data.get("content", ""))

    if PIPELINE_STATE_FILE.exists():
        try:
            return json.loads(PIPELINE_STATE_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return None
    return None
```

- [ ] **Step 6: Run disk tests**

```bash
cd packages/agent && python -m pytest tests/test_tools_pipeline.py -k "disk" -v
```

Expected: both pass.

- [ ] **Step 7: Run full test suite**

```bash
cd packages/agent && python -m pytest tests/ -v
```

Expected: all tests pass (the `PIPELINE_STATE_FILE.parent.mkdir` call in tests may create a real directory — the `tmp_path` fixture handles cleanup).

- [ ] **Step 8: Commit**

```bash
git add packages/agent/src/tools/pipeline.py packages/agent/src/paths.py packages/agent/tests/test_tools_pipeline.py
git commit -m "feat(pipeline): persist plan.json to disk for restart recovery"
```

---

## Task 4: Light/Dark Mode — Frontend Theme Toggle

**Why this matters:** The UI is hardcoded dark. Adding a toggle lets users switch to light mode (useful for screen recordings in bright environments) and persists the preference across sessions.

**Approach:**

1. Add `darkTheme` / `lightTheme` exports to `theme.ts`
2. Create `hooks/useAppTheme.ts` — React context + `useAppTheme()` hook + `localStorage` persistence
3. Wrap `<App>` with `<ThemeProvider>` in `main.tsx`
4. Update all 24 components to call `useAppTheme()` instead of importing `theme` statically
5. Add toggle button to `Header`
6. Update `App.css` light-mode body background

### Sub-task 4a: Define both themes in `theme.ts`

**Files:**

- Modify: `packages/web/src/theme.ts`

- [ ] **Step 1: Replace `theme.ts` with dual exports**

```typescript
const shared = {
  fonts: {
    sans: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    mono: "'JetBrains Mono', 'Cascadia Code', monospace",
  },
  radius: { sm: 4, md: 8, lg: 12, xl: 16 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
} as const

export const darkTheme = {
  ...shared,
  colors: {
    bg: {
      primary: "#0D0D0D",
      secondary: "#141414",
      elevated: "#1A1A1A",
      hover: "#242424",
    },
    accent: {
      primary: "#CC3333",
      primaryHover: "#E63939",
      primaryMuted: "rgba(204, 51, 51, 0.15)",
      primaryGlow: "rgba(204, 51, 51, 0.3)",
    },
    text: {
      primary: "#E8E8E8",
      secondary: "#888888",
      muted: "#555555",
      inverse: "#0D0D0D",
    },
    border: {
      default: "#2A2A2A",
      accent: "#CC3333",
      subtle: "#1E1E1E",
    },
    status: {
      success: "#22C55E",
      warning: "#F59E0B",
      error: "#EF4444",
    },
  },
} as const

export const lightTheme = {
  ...shared,
  colors: {
    bg: {
      primary: "#F5F5F5",
      secondary: "#FFFFFF",
      elevated: "#EBEBEB",
      hover: "#E0E0E0",
    },
    accent: {
      primary: "#CC3333",
      primaryHover: "#B02828",
      primaryMuted: "rgba(204, 51, 51, 0.10)",
      primaryGlow: "rgba(204, 51, 51, 0.20)",
    },
    text: {
      primary: "#141414",
      secondary: "#555555",
      muted: "#999999",
      inverse: "#F5F5F5",
    },
    border: {
      default: "#D8D8D8",
      accent: "#CC3333",
      subtle: "#E8E8E8",
    },
    status: {
      success: "#16A34A",
      warning: "#D97706",
      error: "#DC2626",
    },
  },
} as const

// Keep default export for any file that hasn't migrated yet (remove once all use hook)
export const theme = darkTheme
export type AppTheme = typeof darkTheme
```

### Sub-task 4b: Create `useAppTheme` hook

**Files:**

- Create: `packages/web/src/hooks/useAppTheme.ts`

- [ ] **Step 2: Create the theme context and hook**

```typescript
import { createContext, useContext, useState, useEffect, type ReactNode, createElement } from "react"
import { darkTheme, lightTheme, type AppTheme } from "../theme"

type ThemeMode = "dark" | "light"

interface ThemeContextValue {
  theme: AppTheme
  mode: ThemeMode
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: darkTheme,
  mode: "dark",
  toggle: () => {},
})

const STORAGE_KEY = "video-gen-theme"

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === "light" ? "light" : "dark"
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode)
    document.documentElement.setAttribute("data-theme", mode)
  }, [mode])

  const toggle = () => setMode((m) => (m === "dark" ? "light" : "dark"))
  const theme = mode === "dark" ? darkTheme : lightTheme

  return createElement(ThemeContext.Provider, { value: { theme, mode, toggle } }, children)
}

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}
```

### Sub-task 4c: Wrap App with ThemeProvider

**Files:**

- Modify: `packages/web/src/main.tsx`

- [ ] **Step 3: Wrap root with ThemeProvider**

```typescript
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { ThemeProvider } from "./hooks/useAppTheme"
import App from "./App"
import "./App.css"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
```

### Sub-task 4d: Update `App.css` for light-mode body background

**Files:**

- Modify: `packages/web/src/App.css`

- [ ] **Step 4: Add light-mode root overrides to App.css**

After the existing `:root { ... }` block, add:

```css
:root[data-theme="light"] {
  --bg-primary: #f5f5f5;
  --bg-secondary: #ffffff;
  --bg-elevated: #ebebeb;
  --bg-hover: #e0e0e0;
  --text-primary: #141414;
  --text-secondary: #555555;
  --text-muted: #999999;
  --border: #d8d8d8;
  --border-subtle: #e8e8e8;
}
```

The `body` background already uses `var(--bg-primary)` so light mode will automatically apply.

### Sub-task 4e: Add theme toggle to `Header`

**Files:**

- Modify: `packages/web/src/components/Header.tsx`

- [ ] **Step 5: Replace static `theme` import with hook + add toggle button**

```typescript
import { useAppTheme } from "../hooks/useAppTheme"
import type { ActiveVideoTarget, StoredVideoArtifact } from "../types"

interface Props {
  artifacts?: StoredVideoArtifact[]
  activeTarget?: ActiveVideoTarget | null
  onSelectTarget?: (target: StoredVideoArtifact | null) => void
}

export function Header({ artifacts = [], activeTarget, onSelectTarget }: Props) {
  const { theme, mode, toggle } = useAppTheme()

  return (
    <header
      style={{
        padding: "14px 20px",
        borderBottom: `1px solid ${theme.colors.border.default}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexShrink: 0,
      }}
    >
      <div style={{ width: 3, height: 20, backgroundColor: theme.colors.accent.primary, borderRadius: 2 }} />
      <span style={{ fontSize: 16, fontWeight: 600, color: theme.colors.text.primary, letterSpacing: "-0.01em" }}>
        Video Generator
      </span>
      <span style={{ fontSize: 12, color: theme.colors.text.muted, fontFamily: theme.fonts.mono, marginLeft: 4 }}>
        mission control
      </span>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: theme.colors.text.muted, fontFamily: theme.fonts.mono }}>target</span>
        <select
          value={activeTarget?.configPath ?? ""}
          onChange={(event) => {
            const selected = artifacts.find((artifact) => artifact.configPath === event.target.value)
            onSelectTarget?.(selected ?? null)
          }}
          style={{
            minWidth: 220,
            maxWidth: 360,
            backgroundColor: theme.colors.bg.elevated,
            color: theme.colors.text.secondary,
            border: `1px solid ${theme.colors.border.default}`,
            borderRadius: theme.radius.sm,
            padding: "6px 8px",
            fontSize: 12,
            fontFamily: theme.fonts.mono,
          }}
        >
          <option value="">Sin target activo</option>
          {artifacts.map((artifact) => (
            <option key={artifact.id} value={artifact.configPath}>
              {artifact.source === "render" ? "render · " : ""}
              {artifact.title || artifact.configId || artifact.configPath}
            </option>
          ))}
        </select>
        <button
          onClick={toggle}
          title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            background: "none",
            border: `1px solid ${theme.colors.border.default}`,
            borderRadius: theme.radius.sm,
            padding: "6px 10px",
            cursor: "pointer",
            color: theme.colors.text.secondary,
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          {mode === "dark" ? "☀" : "◑"}
        </button>
      </div>
    </header>
  )
}
```

### Sub-task 4f: Update all remaining components to use `useAppTheme()`

**Why:** All 23 remaining components use `import { theme } from "../theme"` and read it as a module-level constant. They need to call `useAppTheme()` inside the component body instead.

**The pattern for each file** — change two things:

1. Replace `import { theme } from "../theme"` with `import { useAppTheme } from "../hooks/useAppTheme"`
2. Add `const { theme } = useAppTheme()` as the first line inside the component function

**Files to update** (23 components — `Header` already done in Step 5):

```
packages/web/src/components/ChatThread.tsx
packages/web/src/components/CheckpointCard.tsx
packages/web/src/components/DirectionCard.tsx
packages/web/src/components/ErrorBanner.tsx
packages/web/src/components/EventLog.tsx
packages/web/src/components/GenericCheckpointCard.tsx
packages/web/src/components/InputBar.tsx
packages/web/src/components/InteractionRequestCard.tsx
packages/web/src/components/MessageBubble.tsx
packages/web/src/components/PipelineStepper.tsx
packages/web/src/components/RenderProgress.tsx
packages/web/src/components/RevisionPlanCard.tsx
packages/web/src/components/Sidebar.tsx
packages/web/src/components/SoundChartCard.tsx
packages/web/src/components/SubagentBadge.tsx
packages/web/src/components/SubagentCard.tsx
packages/web/src/components/TargetSelectionCard.tsx
packages/web/src/components/ThreadList.tsx
packages/web/src/components/ValidationReportCard.tsx
packages/web/src/components/VariantPlanCard.tsx
packages/web/src/components/VideoPlayer.tsx
packages/web/src/components/VideoResultCard.tsx
packages/web/src/components/WorkingIndicator.tsx
```

- [ ] **Step 6: Update ChatThread.tsx**

Find: `import { theme } from "../theme"`  
Replace with: `import { useAppTheme } from "../hooks/useAppTheme"`

Add as first line inside the component function (find the function signature and add inside):  
`const { theme } = useAppTheme()`

- [ ] **Step 7: Update CheckpointCard.tsx** (same pattern)
- [ ] **Step 8: Update DirectionCard.tsx** (same pattern)
- [ ] **Step 9: Update ErrorBanner.tsx** (same pattern)
- [ ] **Step 10: Update EventLog.tsx** (same pattern)
- [ ] **Step 11: Update GenericCheckpointCard.tsx** (same pattern)
- [ ] **Step 12: Update InputBar.tsx** (same pattern)
- [ ] **Step 13: Update InteractionRequestCard.tsx** (same pattern)
- [ ] **Step 14: Update MessageBubble.tsx** (same pattern)
- [ ] **Step 15: Update PipelineStepper.tsx** (same pattern)
- [ ] **Step 16: Update RenderProgress.tsx** (same pattern)
- [ ] **Step 17: Update RevisionPlanCard.tsx** (same pattern)
- [ ] **Step 18: Update Sidebar.tsx** (same pattern)
- [ ] **Step 19: Update SoundChartCard.tsx** (same pattern)
- [ ] **Step 20: Update SubagentBadge.tsx** (same pattern)
- [ ] **Step 21: Update SubagentCard.tsx** (same pattern)
- [ ] **Step 22: Update TargetSelectionCard.tsx** (same pattern)
- [ ] **Step 23: Update ThreadList.tsx** (same pattern)
- [ ] **Step 24: Update ValidationReportCard.tsx** (same pattern)
- [ ] **Step 25: Update VariantPlanCard.tsx** (same pattern)
- [ ] **Step 26: Update VideoPlayer.tsx** (same pattern)
- [ ] **Step 27: Update VideoResultCard.tsx** (same pattern)
- [ ] **Step 28: Update WorkingIndicator.tsx** (same pattern)

- [ ] **Step 29: TypeScript check**

```bash
cd packages/web && pnpm run lint
```

Expected: no errors. Fix any type errors (likely from components that have multiple exported functions — add `const { theme } = useAppTheme()` to each function that uses `theme`).

- [ ] **Step 30: Start dev server and verify in browser**

```bash
pnpm run dev
```

Open `http://localhost:5173`. Verify:

- Dark mode is default (or persisted mode from localStorage)
- Click the ☀ button in the header — page switches to light mode
- Reload page — light mode persists (localStorage)
- Click ◑ button — switches back to dark
- All UI elements (cards, bubbles, sidebar, input bar) change colors correctly

- [ ] **Step 31: Commit**

```bash
git add packages/web/src/
git commit -m "feat(web): add light/dark mode toggle with localStorage persistence"
```

---

## Self-Review Checklist

**Spec coverage:**

- [x] scene_qa after scene_creation — Task 1
- [x] Circuit breaker / zombie queue — Task 2
- [x] Disk persistence of plan.json — Task 3
- [x] Light + dark mode frontend — Task 4

**Placeholder scan:**

- No TBD/TODO in task steps
- All code blocks are complete and concrete
- File paths are exact

**Type consistency:**

- `AppTheme` type exported from `theme.ts` — used as return type context in `useAppTheme`
- `ThemeContextValue.theme: AppTheme` matches `darkTheme` / `lightTheme` shape (both `as const` with same structure)
- `_write_plan(backend, plan)` signature unchanged — Task 2 and Task 3 both call it correctly
- `PIPELINE_STATE_FILE` imported at top of `pipeline.py` — used in both `_write_plan` and `_read_plan`
