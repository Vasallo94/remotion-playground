import os
from pathlib import Path

PROJECT_ROOT = Path(os.environ.get("PROJECT_ROOT", str(Path(__file__).resolve().parent.parent.parent.parent)))

# --- Agent reads (static assets, catalogs) ---
SCENE_CATALOG = PROJECT_ROOT / "src" / "shared" / "scene-catalog.json"
CUSTOM_SCENES_DIR = PROJECT_ROOT / "src" / "compositions" / "ClaudeCodeTutorial" / "scenes" / "custom"
SCENE_REGISTRY = PROJECT_ROOT / "src" / "compositions" / "ClaudeCodeTutorial" / "customSceneRegistry.ts"
AUDIO_LIBRARY_DIR = PROJECT_ROOT / "public" / "audio" / "library"

# --- Agent writes (generated outputs) ---
VOICEOVER_BASE_DIR = PROJECT_ROOT / "public" / "voiceover"
AUDIO_BASE_DIR = PROJECT_ROOT / "public" / "audio"


def voiceover_dir(config_id: str) -> Path:
    d = VOICEOVER_BASE_DIR / config_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def audio_dir(config_id: str) -> Path:
    d = AUDIO_BASE_DIR / config_id
    d.mkdir(parents=True, exist_ok=True)
    return d


PIPELINE_STATE_FILE = PROJECT_ROOT / ".generated" / "pipeline" / "plan.json"
