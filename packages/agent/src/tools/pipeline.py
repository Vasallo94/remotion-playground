from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from deepagents.backends import StateBackend
from langchain_core.tools import InjectedToolArg

PIPELINE_PLAN_PATH = "/pipeline/plan.json"
PLAN_STATUSES = {"pending", "in_progress", "completed", "blocked", "skipped", "failed"}

DEFAULT_STEPS: dict[str, list[dict[str, str]]] = {
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
    "revise_existing": [
        {"id": "target_staging", "owner": "orchestrator", "title": "Stage target config"},
        {"id": "revision_plan", "owner": "orchestrator", "title": "Approve revision plan"},
        {"id": "revision", "owner": "director", "title": "Apply approved revision"},
        {"id": "validation", "owner": "validator", "title": "Validate revised config"},
        {"id": "save", "owner": "orchestrator", "title": "Persist source config"},
        {"id": "render", "owner": "orchestrator", "title": "Render when requested"},
    ],
    "render_only": [
        {"id": "target_loading", "owner": "orchestrator", "title": "Load target config"},
        {"id": "validation", "owner": "orchestrator", "title": "Validate config"},
        {"id": "render", "owner": "orchestrator", "title": "Render video"},
    ],
    "recover_failed_render": [
        {"id": "target_staging", "owner": "orchestrator", "title": "Stage failed config"},
        {"id": "recovery_plan", "owner": "orchestrator", "title": "Approve technical recovery"},
        {"id": "repair", "owner": "validator", "title": "Repair blocking issues"},
        {"id": "validation", "owner": "orchestrator", "title": "Validate repaired config"},
        {"id": "render", "owner": "orchestrator", "title": "Render repaired config"},
    ],
    "audit_only": [
        {"id": "target_loading", "owner": "orchestrator", "title": "Load target config"},
        {"id": "audit", "owner": "validator", "title": "Audit config"},
        {"id": "report", "owner": "orchestrator", "title": "Report recommendations"},
    ],
    "variant": [
        {"id": "source_staging", "owner": "orchestrator", "title": "Stage source config"},
        {"id": "variant_plan", "owner": "orchestrator", "title": "Approve variant plan"},
        {"id": "variant_creation", "owner": "copywriter", "title": "Create derived config"},
        {"id": "validation", "owner": "validator", "title": "Validate variant"},
        {"id": "render", "owner": "orchestrator", "title": "Render when requested"},
    ],
    "asset_regeneration": [
        {"id": "target_staging", "owner": "orchestrator", "title": "Stage target config"},
        {"id": "asset_plan", "owner": "audio_planner", "title": "Plan requested asset regeneration"},
        {"id": "asset_generation", "owner": "voice_generator", "title": "Regenerate requested assets"},
        {"id": "validation", "owner": "validator", "title": "Validate regenerated assets"},
    ],
    "question": [
        {"id": "answer", "owner": "orchestrator", "title": "Answer or guide user"},
    ],
}


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _backend() -> StateBackend:
    return StateBackend()


def _read_plan(backend: Any) -> dict[str, Any] | None:
    result = backend.read(PIPELINE_PLAN_PATH)
    if getattr(result, "error", None):
        return None
    file_data = getattr(result, "file_data", None)
    if not file_data:
        return None
    content = file_data.get("content", "")
    return json.loads(content)


def _write_plan(backend: Any, plan: dict[str, Any]) -> None:
    content = json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
    backend.upload_files([(PIPELINE_PLAN_PATH, content.encode("utf-8"))])


def _default_steps(mode: str) -> list[dict[str, Any]]:
    source = DEFAULT_STEPS.get(mode, DEFAULT_STEPS["question"])
    return [{**step, "status": "pending", "summary": "", "artifactPaths": [], "blockers": []} for step in source]


def _current_step(steps: list[dict[str, Any]]) -> str:
    pending_id = ""
    for step in steps:
        st = step.get("status")
        if st == "in_progress":
            return str(step.get("id", ""))
        if st == "pending" and not pending_id:
            pending_id = str(step.get("id", ""))
    return pending_id


def create_pipeline_plan(
    mode: str,
    goal: str,
    target: dict[str, Any] | None = None,
    steps: list[dict[str, Any]] | None = None,
    runtime: Annotated[Any, InjectedToolArg] = None,
) -> dict[str, Any]:
    """Create or replace the shared pipeline plan at `/pipeline/plan.json`.

    Use this after `route_intent` and before dispatching subagents. The plan is
    the canonical coordination state for this video workflow.
    """
    planned_steps = steps if steps else _default_steps(mode)
    normalized_steps = []
    for i, step in enumerate(planned_steps):
        step_id = str(step.get("id") or step.get("name") or f"step_{i}")
        normalized_steps.append(
            {
                "id": step_id,
                "owner": str(step.get("owner", "orchestrator")),
                "title": str(step.get("title", step_id)),
                "status": str(step.get("status", "pending")),
                "summary": str(step.get("summary", "")),
                "artifactPaths": list(step.get("artifactPaths", [])),
                "blockers": list(step.get("blockers", [])),
            }
        )

    plan = {
        "schemaVersion": 1,
        "path": PIPELINE_PLAN_PATH,
        "mode": mode,
        "goal": goal,
        "target": target or {},
        "status": "in_progress",
        "currentStep": _current_step(normalized_steps),
        "steps": normalized_steps,
        "decisions": [],
        "events": [
            {
                "at": _now(),
                "type": "plan_created",
                "mode": mode,
                "summary": goal,
            }
        ],
    }
    _write_plan(_backend(), plan)
    return {"created": True, "planPath": PIPELINE_PLAN_PATH, "plan": plan}


def read_pipeline_plan(runtime: Annotated[Any, InjectedToolArg] = None) -> dict[str, Any]:
    """Read the shared pipeline plan from `/pipeline/plan.json`."""
    plan = _read_plan(_backend())
    if plan is None:
        return {
            "exists": False,
            "planPath": PIPELINE_PLAN_PATH,
            "instruction": "Call create_pipeline_plan after route_intent before dispatching subagents.",
        }
    return {"exists": True, "planPath": PIPELINE_PLAN_PATH, "plan": plan}


def update_pipeline_step(
    step_id: str,
    status: Literal["pending", "in_progress", "completed", "blocked", "skipped", "failed"],
    summary: str = "",
    owner: str = "",
    artifact_paths: list[str] | None = None,
    blockers: list[str] | None = None,
    runtime: Annotated[Any, InjectedToolArg] = None,
) -> dict[str, Any]:
    """Update one step in `/pipeline/plan.json`.

    Agents should call this when starting or completing their owned step.
    """
    if status not in PLAN_STATUSES:
        return {"updated": False, "error": f"Invalid status '{status}'", "allowed": sorted(PLAN_STATUSES)}

    backend = _backend()
    plan = _read_plan(backend)
    if plan is None:
        return {
            "updated": False,
            "error": f"No pipeline plan found at {PIPELINE_PLAN_PATH}",
            "instruction": "The orchestrator must call create_pipeline_plan first.",
        }

    steps = plan.setdefault("steps", [])
    step = next((item for item in steps if item.get("id") == step_id), None)
    if step is None:
        step = {
            "id": step_id,
            "owner": owner or "orchestrator",
            "title": step_id.replace("_", " ").title(),
            "status": "pending",
            "summary": "",
            "artifactPaths": [],
            "blockers": [],
        }
        steps.append(step)

    if owner:
        step["owner"] = owner
    step["status"] = status
    if summary:
        step["summary"] = summary
    if artifact_paths is not None:
        step["artifactPaths"] = artifact_paths
    if blockers is not None:
        step["blockers"] = blockers

    plan["currentStep"] = _current_step(steps)
    if all(item.get("status") in ("completed", "skipped") for item in steps):
        plan["status"] = "completed"
    elif status in ("blocked", "failed"):
        plan["status"] = status
    else:
        plan["status"] = "in_progress"

    event = {
        "at": _now(),
        "type": "step_updated",
        "stepId": step_id,
        "status": status,
    }
    if summary:
        event["summary"] = summary
    plan.setdefault("events", []).append(event)

    _write_plan(backend, plan)
    return {"updated": True, "planPath": PIPELINE_PLAN_PATH, "step": step, "plan": plan}


def get_next_pipeline_step(
    runtime: Annotated[Any, InjectedToolArg] = None,
) -> dict[str, Any]:
    """Return the next actionable step from `/pipeline/plan.json`.

    Reads the plan and returns the pipeline's current state:
    - `"next_step"`: a pending step is ready to execute.
    - `"in_progress"`: one or more steps are already running.
    - `"blocked"`: a step is blocked and needs resolution.
    - `"all_completed"`: every step is completed or skipped.
    - `"no_plan"`: no plan exists yet.
    """
    plan = _read_plan(_backend())
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
        return {
            "status": "in_progress",
            "steps": in_progress,
            "reason": f"Step '{in_progress[0]['id']}' is being executed by {in_progress[0].get('owner', '?')}",
            "progress": progress,
        }

    if not pending:
        return {
            "status": "all_completed",
            "reason": "All steps are completed or skipped.",
            "progress": progress,
        }

    next_step = pending[0]
    return {
        "status": "next_step",
        "step": next_step,
        "reason": f"Previous steps done: {[s['id'] for s in completed]}",
        "progress": progress,
    }


def record_pipeline_decision(
    decision_id: str,
    step_id: str,
    status: Literal["approved", "changes_requested", "rejected", "not_required"],
    summary: str,
    payload: dict[str, Any] | None = None,
    runtime: Annotated[Any, InjectedToolArg] = None,
) -> dict[str, Any]:
    """Record a human checkpoint or important orchestration decision in the shared plan."""
    backend = _backend()
    plan = _read_plan(backend)
    if plan is None:
        return {
            "recorded": False,
            "error": f"No pipeline plan found at {PIPELINE_PLAN_PATH}",
            "instruction": "The orchestrator must call create_pipeline_plan first.",
        }

    decision = {
        "id": decision_id,
        "stepId": step_id,
        "status": status,
        "summary": summary,
        "payload": payload or {},
        "at": _now(),
    }
    plan.setdefault("decisions", []).append(decision)
    plan.setdefault("events", []).append(
        {
            "at": decision["at"],
            "type": "decision_recorded",
            "decisionId": decision_id,
            "stepId": step_id,
            "status": status,
            "summary": summary,
        }
    )
    _write_plan(backend, plan)
    return {"recorded": True, "planPath": PIPELINE_PLAN_PATH, "decision": decision, "plan": plan}
