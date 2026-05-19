import json
import tempfile
from pathlib import Path
from types import SimpleNamespace

from src import paths as agent_paths
from src.tools import pipeline


class FakeBackend:
    def __init__(self):
        self.files: dict[str, str] = {}

    def read(self, path: str, offset: int = 0, limit: int = 2000):
        if path not in self.files:
            return SimpleNamespace(error=f"File '{path}' not found", file_data=None)
        return SimpleNamespace(error=None, file_data={"content": self.files[path], "encoding": "utf-8"})

    def upload_files(self, files: list[tuple[str, bytes]]):
        for path, content in files:
            self.files[path] = content.decode("utf-8")
        return []


def install_backend(monkeypatch):
    backend = FakeBackend()
    monkeypatch.setattr(pipeline, "_backend", lambda: backend)
    return backend


def test_create_pipeline_plan_persists_default_new_video_steps(monkeypatch):
    backend = install_backend(monkeypatch)

    result = pipeline.create_pipeline_plan("new_video", "Crear tutorial sobre DeepAgents")

    assert result["created"] is True
    assert result["planPath"] == "/pipeline/plan.json"
    assert "/pipeline/plan.json" in backend.files
    saved = json.loads(backend.files["/pipeline/plan.json"])
    assert saved["mode"] == "new_video"
    assert saved["currentStep"] == "research"
    assert [step["owner"] for step in saved["steps"][:3]] == ["researcher", "copywriter", "orchestrator"]


def test_read_pipeline_plan_missing_returns_instruction(monkeypatch, tmp_path):
    install_backend(monkeypatch)
    monkeypatch.setattr(agent_paths, "PIPELINE_STATE_FILE", tmp_path / "plan.json")

    result = pipeline.read_pipeline_plan()

    assert result["exists"] is False
    assert result["planPath"] == "/pipeline/plan.json"
    assert "create_pipeline_plan" in result["instruction"]


def test_update_pipeline_step_updates_status_summary_and_artifacts(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Crear tutorial")

    result = pipeline.update_pipeline_step(
        "research",
        "completed",
        summary="Brief listo",
        artifact_paths=["/pipeline/brief.json"],
    )

    assert result["updated"] is True
    step = result["step"]
    assert step["status"] == "completed"
    assert step["summary"] == "Brief listo"
    assert step["artifactPaths"] == ["/pipeline/brief.json"]
    assert result["plan"]["currentStep"] == "copywriting"
    assert result["plan"]["events"][-1]["type"] == "step_updated"


def test_update_pipeline_step_can_block_plan(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Crear tutorial")

    result = pipeline.update_pipeline_step("copywriting", "blocked", blockers=["Falta brief"])

    assert result["updated"] is True
    assert result["plan"]["status"] == "blocked"
    assert result["step"]["blockers"] == ["Falta brief"]


def test_record_pipeline_decision_appends_decision_and_event(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Crear tutorial")

    result = pipeline.record_pipeline_decision(
        "cp1",
        "copywriting",
        "approved",
        "Escaleta aprobada",
        {"scenes": 6},
    )

    assert result["recorded"] is True
    assert result["decision"]["payload"] == {"scenes": 6}
    assert result["plan"]["decisions"][0]["id"] == "cp1"
    assert result["plan"]["events"][-1]["type"] == "decision_recorded"


def test_get_next_step_no_plan(monkeypatch, tmp_path):
    install_backend(monkeypatch)
    monkeypatch.setattr(agent_paths, "PIPELINE_STATE_FILE", tmp_path / "plan.json")

    result = pipeline.get_next_pipeline_step()

    assert result["status"] == "no_plan"


def test_get_next_step_returns_first_pending(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Crear tutorial")

    result = pipeline.get_next_pipeline_step()

    assert result["status"] == "next_step"
    assert result["step"]["id"] == "research"
    assert result["step"]["owner"] == "researcher"
    assert result["progress"]["completed"] == 0


def test_get_next_step_skips_completed(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Crear tutorial")
    pipeline.update_pipeline_step("research", "completed", summary="Done")

    result = pipeline.get_next_pipeline_step()

    assert result["status"] == "next_step"
    assert result["step"]["id"] == "copywriting"
    assert result["progress"]["completed"] == 1
    assert "research" in result["progress"]["completedIds"]


def test_get_next_step_reports_blocked(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Crear tutorial")
    pipeline.update_pipeline_step("research", "blocked", blockers=["No internet"])

    result = pipeline.get_next_pipeline_step()

    assert result["status"] == "blocked"
    assert result["steps"][0]["id"] == "research"


def test_get_next_step_reports_in_progress(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Crear tutorial")
    pipeline.update_pipeline_step("research", "in_progress", owner="researcher")

    result = pipeline.get_next_pipeline_step()

    assert result["status"] == "in_progress"
    assert result["steps"][0]["id"] == "research"


def test_get_next_step_all_completed(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("question", "Answer user")
    pipeline.update_pipeline_step("answer", "completed", summary="Answered")

    result = pipeline.get_next_pipeline_step()

    assert result["status"] == "all_completed"
    assert result["progress"]["completed"] == 1


def test_get_next_step_skipped_counts_as_done(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("question", "Answer user")
    pipeline.update_pipeline_step("answer", "skipped")

    result = pipeline.get_next_pipeline_step()

    assert result["status"] == "all_completed"
    assert result["progress"]["completed"] == 1


def test_new_video_steps_scene_qa_after_scene_creation(monkeypatch):
    backend = install_backend(monkeypatch)
    result = pipeline.create_pipeline_plan("new_video", "Test order")
    steps = result["plan"]["steps"]
    ids = [s["id"] for s in steps]
    scene_creation_idx = ids.index("scene_creation")
    scene_qa_idx = ids.index("scene_qa")
    assert scene_qa_idx > scene_creation_idx, (
        f"scene_qa (pos {scene_qa_idx}) must come after scene_creation (pos {scene_creation_idx})"
    )


def test_get_next_step_returns_in_progress_below_stall_threshold(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Test stall")
    # Mark first step as in_progress
    pipeline.update_pipeline_step("research", "in_progress")

    # polls below threshold should still return in_progress
    for _ in range(pipeline._STALL_THRESHOLD - 1):
        result = pipeline.get_next_pipeline_step()
        assert result["status"] == "in_progress"


def test_get_next_step_returns_stalled_after_threshold(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Test stall")
    pipeline.update_pipeline_step("research", "in_progress")

    for _ in range(pipeline._STALL_THRESHOLD - 1):
        pipeline.get_next_pipeline_step()

    # threshold poll crosses → stalled
    result = pipeline.get_next_pipeline_step()
    assert result["status"] == "stalled"
    assert result["stalledStep"]["id"] == "research"
    assert result["stallCount"] == pipeline._STALL_THRESHOLD


def test_stall_counter_resets_after_step_advances(monkeypatch):
    install_backend(monkeypatch)
    pipeline.create_pipeline_plan("new_video", "Test stall reset")
    pipeline.update_pipeline_step("research", "in_progress")

    for _ in range(5):
        pipeline.get_next_pipeline_step()

    # Complete the step — counter should reset
    pipeline.update_pipeline_step("research", "completed", summary="done")

    # Mark next step in_progress; counter starts fresh
    pipeline.update_pipeline_step("copywriting", "in_progress")
    for _ in range(pipeline._STALL_THRESHOLD - 1):
        result = pipeline.get_next_pipeline_step()
        assert result["status"] == "in_progress"


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
