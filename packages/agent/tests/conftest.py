import pytest
from src import paths as agent_paths


@pytest.fixture(autouse=True)
def _isolate_pipeline_state_file(monkeypatch, tmp_path):
    """Route disk writes from pipeline.py to tmp_path instead of the real .generated/ directory."""
    monkeypatch.setattr(agent_paths, "PIPELINE_STATE_FILE", tmp_path / "pipeline" / "plan.json")
