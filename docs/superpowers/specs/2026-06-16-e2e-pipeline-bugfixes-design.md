# E2E Pipeline Bug Fixes

**Date:** 2026-06-16
**Scope:** 4 bugs found during E2E test of `/resume` tutorial video pipeline

## Context

During a full E2E pipeline test generating a tutorial video about Claude Code's `/resume` command, 6 bugs were identified. 4 have clear root causes and are addressed here. The other 2 (second interrupt UI not rendering, malformed JSON in validation) need deeper investigation and are deferred.

## Bug 1: Pipeline tracker stuck on step_11 (HIGH)

**Symptom:** UI pipeline tracker shows step_11 (render) as "en curso..." indefinitely. Send button stays disabled. The video rendered successfully (status: done, 100%, output.mp4 exists).

**Root cause:** The orchestrator calls `submit_render` and `check_render_status` for the render step, and dispatches the reviewer for the report step. Both are orchestrator-owned steps (line 137 of orchestrator.md: "Subagents manage their own `update_pipeline_step` calls. The orchestrator only marks orchestrator-owned steps."). But the orchestrator never calls `update_pipeline_step` for either step.

The frontend reads plan.json to determine step status (`packages/web/src/lib/planState.ts` line 95). If the render step stays `"in_progress"`, `allDone` is never true, and the "Completado" banner never appears (PipelineStepper.tsx line 161-174).

**Fix:** Add explicit instructions in `orchestrator.md` to call `update_pipeline_step` after:

1. `check_render_status` returns `status="done"` → mark render step as `"completed"`
2. `check_render_status` returns `status="error"` → mark render step as `"failed"`
3. Reviewer approval (CP6) completes → mark report step as `"completed"`

**File:** `packages/agent/prompts/orchestrator.md`

## Bug 2: Video download endpoint 404 (HIGH)

**Symptom:** `GET /api/render/:id/download` throws `NotFoundError` from Express 5.2.1's `send` module. The file exists (`statSync` passes at line 353) but `res.download()` fails at line 358.

**Root cause:** Express 5.2.1's `res.download()` wraps `res.sendFile()` differently than Express 4. The streaming endpoint (line 341) uses `res.sendFile(filePath, { headers, dotfiles: "allow" })` and works. The download endpoint uses `res.download(filePath, filename)` which passes through `send` module without the `dotfiles: "allow"` option, causing the path to be rejected.

**Fix:** Replace `res.download()` with `res.sendFile()` plus explicit `Content-Disposition: attachment` header, consistent with the working streaming endpoint pattern.

**File:** `packages/render-service/src/server.ts` (lines 345-359)

## Bug 3: "Resumir" false friend in config (LOW)

**Symptom:** Scene 2 title reads "Continuar vs. Resumir" — implies English "resume" = "resumir" (to summarize). Correct translation is "reanudar" (to pick up where you left off). The narration body uses "reanudas" correctly.

**Fix:** Change title from `"Continuar vs. Resumir"` to `"Continuar vs. Reanudar"` in the rendered config.json.

**File:** `.generated/renders/4fafea67-eea7-4ea9-9e82-eb89cf37413f/config.json` (inside Docker container, shared volume)

## Bug 4: Scene QA false positive on Linea Directa theme (LOW)

**Symptom:** scene_qa flagged Linea Directa branding elements (red accents, PhoneMascot) as "MAJOR_ISSUE" (score 4), calling them "unrelated to developers". The linea-directa theme is the default per CLAUDE.md.

**Root cause:** `_build_qa_prompt()` in `qa.py` (lines 118-175) doesn't include the config's `theme` field in the context sent to the multimodal LLM. The model sees corporate branding in the still but has no context that it's intentional.

**Fix:** Add theme information to the `video_context` dict in `_build_context()` (line 78-87). Include theme name and a note that theme-specific branding is intentional.

**File:** `packages/agent/src/tools/qa.py` (line 78-87)

## Out of scope

- Bug 3 (second interrupt UI not rendering) — requires investigation into LangGraph stream re-attachment after checkpoint rejection
- Bug 4 (malformed JSON in validation) — requires investigation into which agent produces invalid JSON and why
