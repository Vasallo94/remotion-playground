from ..orchestrator import MODEL_PRO, create_model, create_skills_middleware, load_prompt
from ..tools.pipeline import read_pipeline_plan, record_pipeline_decision, update_pipeline_step
from ..tools.render import present_direction
from ..tools.validation import audit_content_quality


def create_director() -> dict:
    """Create the director SubAgent definition."""
    model = create_model(MODEL_PRO)
    middleware = [create_skills_middleware()]
    try:
        from deepagents.middleware.summarization import create_summarization_tool_middleware
        from deepagents.backends import StateBackend
        middleware.append(create_summarization_tool_middleware(model, StateBackend))
    except ImportError:
        pass
    return {
        "name": "director",
        "description": "Polishes timing, narrative beats, and audio/visual synchronization with human approval.",
        "system_prompt": load_prompt("director"),
        "model": model,
        "tools": [read_pipeline_plan, update_pipeline_step, record_pipeline_decision, present_direction, audit_content_quality],
        "middleware": middleware,
    }
