import hashlib
import json
from pathlib import Path
from typing import Annotated, Any

from langchain_core.tools import InjectedToolArg

from ..context import resolve_config_id
from ..paths import PROJECT_ROOT as _DEFAULT_ROOT

PROJECT_ROOT = _DEFAULT_ROOT
CALIBRATION_MODEL = "gemini-3.5-flash"


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
    import os
    from google import genai

    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if api_key:
        return genai.Client(api_key=api_key)

    from google.oauth2 import service_account
    creds_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if not creds_path:
        return None
    from pathlib import Path as _Path
    p = _Path(creds_path)
    if not p.is_file():
        return None
    credentials = service_account.Credentials.from_service_account_file(
        str(p), scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    project = os.environ.get("GOOGLE_CLOUD_PROJECT", "vertexlda")
    location = os.environ.get("GOOGLE_CLOUD_LOCATION", "global")
    return genai.Client(vertexai=True, project=project, location=location, credentials=credentials)


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

    return [
        {**beat, "startMs": updates[beat.get("id", "")]}
        if beat.get("id", "") in updates
        else beat
        for beat in beats
    ]


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
    if not config_id or config_id == "unknown":
        return "Error: config must have an 'id' field, or a pipeline runtime must be provided."
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
