# E2E Pipeline Bug Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 4 bugs found during E2E testing — pipeline tracker stuck, download 404, false friend in config, scene QA false positive on theme.

**Architecture:** All fixes are surgical edits to existing files. No new files, no architectural changes. Two are in the agent layer (prompt + Python tool), one in the render service (TypeScript endpoint), one is a data fix in a generated config.

**Tech Stack:** TypeScript (Express 5), Python (LangGraph agent prompts/tools), JSON config

---

### Task 1: Fix video download endpoint 404 (Bug 2 — HIGH)

**Files:**

- Modify: `packages/render-service/src/server.ts:344-359`

- [ ] **Step 1: Replace `res.download()` with `res.sendFile()` plus Content-Disposition header**

The streaming endpoint at line 341 works because it passes `{ dotfiles: "allow" }` to `sendFile`. The download endpoint at line 358 uses `res.download()` which doesn't pass that option in Express 5.2.1. Replace the download endpoint body to use the same pattern as the streaming endpoint, adding the `Content-Disposition: attachment` header for download behavior.

In `packages/render-service/src/server.ts`, replace lines 344-359:

```typescript
// GET /api/render/:id/download — download rendered video
app.get("/api/render/:id/download", (req, res) => {
  const job = getJob(req.params.id)
  const filePath = resolveOutputPath(req.params.id)
  if (job && job.status !== "done") {
    res.status(404).json({ error: "Video not available" })
    return
  }
  try {
    statSync(filePath)
  } catch {
    res.status(job ? 410 : 404).json({ error: job ? "Video file deleted" : "Video not available" })
    return
  }
  const filename = `${job?.config_id || req.params.id}.mp4`
  res.sendFile(filePath, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
    dotfiles: "allow",
  })
})
```

- [ ] **Step 2: Verify the fix with curl**

Run from the host (requires a completed render job — use job ID from the E2E test):

```bash
curl -s -o /dev/null -w "%{http_code} %{size_download}" http://localhost:3100/api/render/4fafea67-eea7-4ea9-9e82-eb89cf37413f/download
```

Expected: `200 4440911` (HTTP 200, 4.4MB file). Previously returned `404`.

If the render service needs a restart after the code change:

```bash
docker compose restart render-service
```

Then re-run the curl command.

- [ ] **Step 3: Commit**

```bash
git add packages/render-service/src/server.ts
git commit -m "fix(render-service): use sendFile with dotfiles option in download endpoint

Express 5.2.1's res.download() passes through send module without
dotfiles: 'allow', causing NotFoundError on valid absolute paths.
Use res.sendFile() with explicit Content-Disposition header instead,
consistent with the working streaming endpoint."
```

---

### Task 2: Fix pipeline tracker stuck on render/report steps (Bug 1 — HIGH)

**Files:**

- Modify: `packages/agent/prompts/orchestrator.md:238-247`

- [ ] **Step 1: Add `update_pipeline_step` instructions to the STOP CONDITIONS section**

The orchestrator owns the `render` and `report` pipeline steps but never calls `update_pipeline_step` for them. Subagents manage their own steps (line 137), but these two are orchestrator-owned. The frontend reads plan.json to determine step status, so if these steps never reach `"completed"`, the tracker stays stuck.

In `packages/agent/prompts/orchestrator.md`, replace lines 238-247 (the `## STOP CONDITIONS — CRITICAL` section) with:

```markdown
## STOP CONDITIONS — CRITICAL

- After the `review` step completes (reviewer approval), call `update_pipeline_step` to mark the `report` step as `"completed"`, then report the result to the user. YOUR JOB IS DONE. Do NOT dispatch any more agents.
- Each agent should be dispatched ONCE per pipeline run.
- EXCEPTION: If a checkpoint is REJECTED with feedback, re-dispatch that same agent with the user's feedback appended to the task description. Only re-dispatch the agent that owns the rejected checkpoint — never skip ahead.
- Forward relevant feedback to downstream agents when it affects their scope (e.g., if the user says "add audio" during CP2, mention it in the audio_planner's task description).
- After `check_render_status` returns `status="done"`, call `update_pipeline_step` to mark the `render` step as `"completed"` before proceeding to reviewer dispatch.
- If `check_render_status` returns `status="error"`, call `update_pipeline_step` to mark the `render` step as `"failed"`, report the error to the user and STOP.
- If validator reports blocking errors, inform the user and STOP.
- If ANY subagent returns an error, inform the user and STOP. Do not retry or restart the pipeline.
- **VALIDATION RETRY LIMIT**: If you have already re-dispatched an agent **twice** for the same set of validation errors, STOP and report the unresolved errors to the user. Do NOT loop. The submit_render tool auto-fixes common issues (emphasis enums, terminal line format, duration clamping); if errors persist after that, there is a structural issue that requires human guidance.
```

Key changes:

- Line 1 (review/report): added `call update_pipeline_step to mark the report step as "completed"` before "report the result to the user".
- New line after CP rejection rules: explicit instruction to mark render step as `"completed"` after `check_render_status` returns `status="done"`.
- Modified error line: added `call update_pipeline_step to mark the render step as "failed"` before the existing "report the error" instruction.

- [ ] **Step 2: Commit**

```bash
git add packages/agent/prompts/orchestrator.md
git commit -m "fix(agent): mark render/report pipeline steps as completed

The orchestrator owns the render and report steps but never called
update_pipeline_step for them. The frontend reads plan.json to show
pipeline progress, so these steps stayed stuck as in_progress."
```

---

### Task 3: Fix "Resumir" false friend in rendered config (Bug 3 — LOW)

**Files:**

- Modify: `.generated/renders/4fafea67-eea7-4ea9-9e82-eb89cf37413f/config.json` (Docker shared volume)

- [ ] **Step 1: Fix the scene 2 title in the generated config**

The config is in a Docker shared volume. Edit from the host:

```bash
sed -i '' 's/"Continuar vs. Resumir"/"Continuar vs. Reanudar"/' .generated/renders/4fafea67-eea7-4ea9-9e82-eb89cf37413f/config.json
```

- [ ] **Step 2: Verify the change**

```bash
grep "Reanudar" .generated/renders/4fafea67-eea7-4ea9-9e82-eb89cf37413f/config.json
```

Expected output should contain: `"Continuar vs. Reanudar"`

- [ ] **Step 3: No commit needed**

This file is in `.generated/` which is gitignored. No commit required. The fix only affects this specific render output. To re-render with the corrected title, run:

```bash
curl -X POST http://localhost:3100/api/render \
  -H "Content-Type: application/json" \
  -d @.generated/renders/4fafea67-eea7-4ea9-9e82-eb89cf37413f/config.json
```

---

### Task 4: Fix scene QA false positive on Linea Directa theme (Bug 4 — LOW)

**Files:**

- Modify: `packages/agent/src/tools/qa.py:78-87` (`_build_context` function)
- Modify: `packages/agent/src/tools/qa.py:131-137` (`_build_qa_prompt` function)

- [ ] **Step 1: Add theme to `video_context` in `_build_context()`**

In `packages/agent/src/tools/qa.py`, replace lines 78-87:

```python
    return {
        "video_context": {
            "title": config.get("title", ""),
            "description": config.get("description", ""),
            "audience": config.get("brief", {}).get("audience", ""),
            "goal": config.get("brief", {}).get("goal", ""),
            "promise": config.get("brief", {}).get("promise", ""),
            "tone": config.get("brief", {}).get("tone", ""),
            "total_scenes": len(scenes),
            "theme": config.get("theme", "default"),
        },
```

Only change: added `"theme": config.get("theme", "default"),` after `total_scenes`.

- [ ] **Step 2: Include theme in the QA prompt**

In `packages/agent/src/tools/qa.py`, replace lines 131-137 (the Video Context section of the prompt):

```python
    return f"""You are a creative director reviewing a scene from an educational video.

## Video Context
- Title: {vc.get('title', '')}
- Audience: {vc.get('audience', '')}
- Goal: {vc.get('goal', '')}
- Promise: {vc.get('promise', '')}
- Theme: {vc.get('theme', 'default')} (brand-specific visual elements like colors, logos, and mascots are intentional — do not flag them as irrelevant)
```

Only change: added the `- Theme:` line with the parenthetical note telling the model not to flag brand elements.

- [ ] **Step 3: Verify syntax**

```bash
cd packages/agent && python3 -c "import src.tools.qa; print('OK')"
```

Expected: `OK` (module imports without syntax errors).

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/tools/qa.py
git commit -m "fix(agent): pass theme context to scene QA to prevent false positives

The QA model flagged Linea Directa branding (red accents, PhoneMascot)
as irrelevant because it had no context that the theme was intentional.
Now video_context includes the theme name and the prompt tells the model
that brand-specific visual elements are by design."
```
