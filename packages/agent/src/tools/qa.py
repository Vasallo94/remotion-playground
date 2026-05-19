import base64
import json
import os
import re
from pathlib import Path
from typing import Annotated, Any

import httpx
from langchain_core.messages import HumanMessage
from langchain_core.tools import InjectedToolArg

from ._checkpoint import checkpoint_interrupt
from ..context import get_pipeline_context
from .._llm import create_model

QA_MODEL = os.environ.get("SCENE_QA_MODEL", "gemini-3.1-pro-preview")

_DEFAULT_RENDER_SERVICE_URL = os.environ.get("RENDER_SERVICE_URL", "http://localhost:3100")


def render_scene_stills(
    config_json: str,
    runtime: Annotated[Any, InjectedToolArg] = None,
) -> str:
    """Render a PNG still of each scene for visual QA.

    Takes the full config JSON string (NOT a file path). Delegates to the
    render-service's /api/render-stills endpoint which runs render-scene-stills.ts
    inside the Node.js container. Returns a JSON manifest with PNG paths.

    Args:
        config_json: Full config as a JSON string.
    """
    ctx = get_pipeline_context(runtime)
    render_url = (ctx.render_service_url if ctx else None) or _DEFAULT_RENDER_SERVICE_URL

    try:
        resp = httpx.post(
            f"{render_url}/api/render-stills",
            content=config_json,
            headers={"Content-Type": "application/json"},
            timeout=180,
        )
        resp.raise_for_status()
        return resp.text
    except httpx.HTTPError as exc:
        return json.dumps({"error": str(exc)})


def _classify_position(index: int, total: int) -> str:
    if index == 0:
        return "intro"
    if index == total - 1:
        return "closing"
    mid = total / 2
    if index < mid:
        return "development"
    return "climax"


def _summarize_scene(scene: dict) -> str:
    s_type = scene.get("type", "custom")
    comp_id = scene.get("componentId", "")
    title = scene.get("title", scene.get("props", {}).get("title", ""))
    return f"{s_type}/{comp_id}: {title}" if comp_id else f"{s_type}: {title}"


def _build_context(config: dict, scene: dict, index: int, still_path: str) -> dict:
    """Build the 5-layer context payload for a single scene."""
    scenes = config.get("scenes", [])
    voiceover = config.get("voiceover", {})
    vo_scenes = voiceover.get("scenes", {}) if isinstance(voiceover, dict) else {}
    if isinstance(vo_scenes, dict):
        vo_entry = vo_scenes.get(str(index), {})
    else:
        vo_entry = next((s for s in vo_scenes if isinstance(s, dict) and s.get("sceneIndex") == index), {})

    return {
        "video_context": {
            "title": config.get("title", ""),
            "description": config.get("description", ""),
            "audience": config.get("brief", {}).get("audience", ""),
            "goal": config.get("brief", {}).get("goal", ""),
            "promise": config.get("brief", {}).get("promise", ""),
            "tone": config.get("brief", {}).get("tone", ""),
            "total_scenes": len(scenes),
        },
        "scene_audio": {
            "voiceover_text": vo_entry.get("text", "") if isinstance(vo_entry, dict) else str(vo_entry),
            "beats": [
                {"narration": b.get("narration"), "visual": b.get("visual"), "startMs": b.get("startMs")}
                for b in scene.get("beats", [])
                if isinstance(b, dict)
            ],
        },
        "scene_config": {
            "index": index,
            "type": scene.get("type", ""),
            "componentId": scene.get("componentId", ""),
            # For built-in scene types (intro, outro, benefits, callout…) data lives
            # at top level. For custom scenes it lives inside props. Merge both so
            # the QA model sees the full data regardless of scene type.
            "data": {
                k: v for k, v in scene.items()
                if k not in ("type", "componentId", "beats", "timing", "durationInSeconds")
            },
            "durationInSeconds": scene.get("durationInSeconds", 0),
        },
        "narrative_context": {
            "previous_scene": _summarize_scene(scenes[index - 1]) if index > 0 else None,
            "next_scene": _summarize_scene(scenes[index + 1]) if index < len(scenes) - 1 else None,
            "position_in_arc": _classify_position(index, len(scenes)),
        },
        "still_path": still_path,
    }


def _build_qa_prompt(context: dict) -> str:
    vc = context["video_context"]
    sc = context["scene_config"]
    nc = context["narrative_context"]
    sa = context["scene_audio"]

    beats_lines = []
    for b in sa.get("beats", []):
        beats_lines.append(
            f"  - [{b.get('startMs', '?')}ms] visual: {b.get('visual', '-')} | narration: {b.get('narration', '-')}"
        )
    beats_formatted = "\n".join(beats_lines) if beats_lines else "(no beats defined)"

    return f"""You are a creative director reviewing a scene from an educational video.

## Video Context
- Title: {vc.get('title', '')}
- Audience: {vc.get('audience', '')}
- Goal: {vc.get('goal', '')}
- Promise: {vc.get('promise', '')}

## This Scene ({sc['index']}/{vc['total_scenes']})
- Type: {sc['type']} / {sc.get('componentId', '')}
- Duration: {sc['durationInSeconds']}s
- Position: {nc['position_in_arc']}
- Previous scene: {nc.get('previous_scene', 'none')}
- Next scene: {nc.get('next_scene', 'none')}

## What the voiceover says during this scene:
\"{sa.get('voiceover_text', '')}\"

## Beat-by-beat direction:
{beats_formatted}

## Scene data (what the component renders from):
{json.dumps(sc.get('data', {}), indent=2, ensure_ascii=False)}

## The rendered frame is attached.

Evaluate this scene on these criteria:

1. **Visual-Audio Coherence**: Does the visual match what the voiceover is explaining?
2. **Topic Relevance**: Is the content specific to this video's topic, or could it belong to any video?
3. **Educational Value**: Does this scene teach the viewer something concrete?
4. **Data Quality**: Are the labels, titles, descriptions specific and meaningful (not generic)?
5. **Narrative Flow**: Does it connect well with the previous and next scenes?

Respond in this exact JSON format:
{{
  "verdict": "PASS" | "MINOR_FIX" | "MAJOR_ISSUE",
  "score": 1-10,
  "issues": ["issue 1", "issue 2"],
  "suggested_changes": {{
    "props": {{}},
    "voiceover": "suggested voiceover text if it should change",
    "reasoning": "why these changes improve the scene"
  }}
}}"""


def qa_scenes(
    config_json: str,
    stills_manifest_json: str,
    runtime: Annotated[Any, InjectedToolArg] = None,
) -> str:
    """Evaluate each scene's visual quality using a multimodal LLM.

    Sends each scene's rendered still + full context payload to the LLM.
    Returns structured QA results with verdict, score, issues, and suggestions.

    Args:
        config_json: Full config as a JSON string.
        stills_manifest_json: JSON string from render_scene_stills output.
    """
    config = json.loads(config_json)
    manifest = json.loads(stills_manifest_json)
    scenes = config.get("scenes", [])
    stills = {s["index"]: s["path"] for s in manifest.get("scenes", [])}

    results = []
    model = None

    for index, scene in enumerate(scenes):
        still_path = stills.get(index)
        if not still_path or not Path(still_path).exists():
            results.append({"index": index, "verdict": "SKIP", "reason": "No still available"})
            continue

        if model is None:
            model = create_model(QA_MODEL)
        context = _build_context(config, scene, index, still_path)
        image_data = base64.b64encode(Path(still_path).read_bytes()).decode("utf-8")
        prompt = _build_qa_prompt(context)

        message = HumanMessage(content=[
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}},
        ])

        response = model.invoke([message])
        content = response.content
        if isinstance(content, list):
            raw = next((c["text"] for c in content if isinstance(c, dict) and c.get("type") == "text"), str(content))
        else:
            raw = str(content)
        raw = re.sub(r"```(?:json)?\s*|\s*```", "", raw).strip()
        try:
            parsed = json.loads(raw)
            parsed["index"] = index
            results.append(parsed)
        except (json.JSONDecodeError, TypeError):
            results.append({
                "index": index,
                "verdict": "ERROR",
                "raw_response": raw[:500],
            })

    return json.dumps({"scenes": results})


def present_qa_report(report_json: str) -> str:
    """Present QA report to user when major issues are found.

    Uses checkpoint_interrupt to pause the pipeline and show
    the QA findings with suggested fixes for human decision.

    Args:
        report_json: JSON string with QA results and suggested changes.
    """
    report = json.loads(report_json)
    return checkpoint_interrupt(
        data={"type": "qa_report_checkpoint", **report},
        approved_msg="QA report approved. Proceeding with audio planning.",
        retry_msg="Review the feedback and re-dispatch the relevant agent.",
    )
