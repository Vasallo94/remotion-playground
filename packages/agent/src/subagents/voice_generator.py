from ..orchestrator import MODEL_FLASH, create_model, create_skills_middleware, load_prompt
from ..tools.calibrate import calibrate_beats_from_audio
from ..tools.pipeline import read_pipeline_plan, update_pipeline_step
from ..tools.voice import generate_voiceover


def create_voice_generator() -> dict:
    """Create the voice generator SubAgent definition."""
    return {
        "name": "voice_generator",
        "description": "Generates voiceover audio via Gemini TTS for each scene, then calibrates beat timings from the audio.",
        "system_prompt": load_prompt("voice_generator"),
        "model": create_model(MODEL_FLASH),
        "tools": [read_pipeline_plan, update_pipeline_step, generate_voiceover, calibrate_beats_from_audio],
        "middleware": [create_skills_middleware()],
    }
