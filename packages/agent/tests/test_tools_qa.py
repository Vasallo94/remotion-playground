import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


class TestRenderSceneStills:
    def test_returns_manifest_on_success(self):
        manifest = {"scenes": [{"index": 0, "path": "/tmp/scene-0.png", "frameNumber": 54}]}
        mock_resp = MagicMock()
        mock_resp.text = json.dumps(manifest)
        mock_resp.raise_for_status = MagicMock()

        with patch("src.tools.qa.httpx.post", return_value=mock_resp):
            from src.tools.qa import render_scene_stills

            result = json.loads(render_scene_stills('{"id": "test", "scenes": []}'))
            assert "scenes" in result
            assert result["scenes"][0]["index"] == 0

    def test_returns_error_on_failure(self):
        import httpx

        with patch("src.tools.qa.httpx.post", side_effect=httpx.HTTPError("Connection refused")):
            from src.tools.qa import render_scene_stills

            result = json.loads(render_scene_stills('{"id": "test", "scenes": []}'))
            assert "error" in result
            assert "Connection refused" in result["error"]

    def test_uses_pipeline_context_render_url(self):
        manifest = {"scenes": []}
        mock_resp = MagicMock()
        mock_resp.text = json.dumps(manifest)
        mock_resp.raise_for_status = MagicMock()

        runtime = MagicMock()
        from src.context import PipelineContext
        runtime.context = PipelineContext(config_id="ctx-video")

        with patch("src.tools.qa.httpx.post", return_value=mock_resp) as mock_post:
            from src.tools.qa import render_scene_stills

            render_scene_stills('{"scenes": []}', runtime=runtime)
            assert mock_post.called


class TestContextBuilder:
    def test_builds_five_layer_context(self):
        from src.tools.qa import _build_context

        config = {
            "title": "Test Video",
            "description": "A test",
            "brief": {
                "audience": "developers",
                "goal": "teach testing",
                "promise": "learn TDD",
                "tone": "technical",
            },
            "voiceover": {
                "enabled": True,
                "scenes": {"0": {"text": "Welcome to testing"}},
            },
            "scenes": [
                {"type": "hero", "title": "Hero", "durationInSeconds": 5, "beats": []},
                {"type": "callout", "text": "Point", "durationInSeconds": 4, "beats": []},
            ],
        }
        scene = config["scenes"][0]
        ctx = _build_context(config, scene, 0, "/tmp/scene-0.png")

        assert ctx["video_context"]["title"] == "Test Video"
        assert ctx["video_context"]["audience"] == "developers"
        assert ctx["scene_audio"]["voiceover_text"] == "Welcome to testing"
        assert ctx["scene_config"]["index"] == 0
        assert ctx["scene_config"]["type"] == "hero"
        assert ctx["narrative_context"]["previous_scene"] is None
        assert ctx["narrative_context"]["next_scene"] is not None
        assert ctx["narrative_context"]["position_in_arc"] == "intro"
        assert ctx["still_path"] == "/tmp/scene-0.png"

    def test_classify_position(self):
        from src.tools.qa import _classify_position

        assert _classify_position(0, 10) == "intro"
        assert _classify_position(9, 10) == "closing"
        assert _classify_position(3, 10) == "development"
        assert _classify_position(7, 10) == "climax"

    def test_summarize_scene(self):
        from src.tools.qa import _summarize_scene

        scene = {"type": "custom", "componentId": "flow-diagram", "props": {"title": "Architecture"}}
        assert "flow-diagram" in _summarize_scene(scene)
        assert "Architecture" in _summarize_scene(scene)


class TestQaScenes:
    def test_skips_scenes_without_stills(self):
        from src.tools.qa import qa_scenes

        config = json.dumps({
            "scenes": [{"type": "hero", "title": "Test", "durationInSeconds": 5}],
            "brief": {},
        })
        manifest = json.dumps({"scenes": []})

        result = json.loads(qa_scenes(config, manifest))
        assert result["scenes"][0]["verdict"] == "SKIP"

    def test_returns_structured_result_on_llm_success(self, tmp_path):
        still = tmp_path / "scene-0.png"
        still.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

        config = json.dumps({
            "title": "Test",
            "brief": {"audience": "devs", "goal": "teach", "promise": "learn", "tone": "tech"},
            "scenes": [{"type": "hero", "title": "Intro", "durationInSeconds": 5, "beats": []}],
        })
        manifest = json.dumps({"scenes": [{"index": 0, "path": str(still), "frameNumber": 90}]})

        llm_response = MagicMock()
        llm_response.content = json.dumps({
            "verdict": "PASS",
            "score": 8,
            "issues": [],
            "suggested_changes": {},
        })

        with patch("src.tools.qa.create_model") as MockCreateModel:
            MockCreateModel.return_value.invoke.return_value = llm_response

            from src.tools.qa import qa_scenes
            result = json.loads(qa_scenes(config, manifest))

            assert result["scenes"][0]["verdict"] == "PASS"
            assert result["scenes"][0]["score"] == 8
            assert result["scenes"][0]["index"] == 0

    def test_handles_unparseable_llm_response(self, tmp_path):
        still = tmp_path / "scene-0.png"
        still.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

        config = json.dumps({
            "title": "Test",
            "brief": {},
            "scenes": [{"type": "hero", "title": "Intro", "durationInSeconds": 5, "beats": []}],
        })
        manifest = json.dumps({"scenes": [{"index": 0, "path": str(still), "frameNumber": 90}]})

        llm_response = MagicMock()
        llm_response.content = "I think this scene looks great!"

        with patch("src.tools.qa.create_model") as MockCreateModel:
            MockCreateModel.return_value.invoke.return_value = llm_response

            from src.tools.qa import qa_scenes
            result = json.loads(qa_scenes(config, manifest))

            assert result["scenes"][0]["verdict"] == "ERROR"
            assert "raw_response" in result["scenes"][0]


class TestPresentQaReport:
    def test_uses_checkpoint_interrupt(self):
        import inspect
        from src.tools.qa import present_qa_report

        source = inspect.getsource(present_qa_report)
        assert "checkpoint_interrupt" in source

    def test_returns_approved(self, monkeypatch):
        import src.tools._checkpoint as cp_mod
        monkeypatch.setattr(cp_mod, "interrupt", lambda v: {"approved": True})

        from src.tools.qa import present_qa_report

        report = json.dumps({
            "summary": {"total": 5, "pass": 5, "minor_fix": 0, "major_issue": 0},
            "scenes": [],
        })
        result = present_qa_report(report)
        assert "APPROVED" in result

    def test_returns_feedback(self, monkeypatch):
        import src.tools._checkpoint as cp_mod
        monkeypatch.setattr(cp_mod, "interrupt", lambda v: {"approved": False, "feedback": "Fix scene 3"})

        from src.tools.qa import present_qa_report

        report = json.dumps({"scenes": [{"index": 3, "verdict": "MAJOR_ISSUE"}]})
        result = present_qa_report(report)
        assert "CHANGES REQUESTED" in result
        assert "Fix scene 3" in result
