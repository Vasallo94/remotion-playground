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
