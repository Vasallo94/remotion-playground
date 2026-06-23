import os
from pathlib import Path

from deepagents import create_deep_agent
from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend, StoreBackend
from deepagents.middleware.skills import SkillsMiddleware
from langgraph.checkpoint.memory import MemorySaver  # used when running standalone

from ._llm import create_model

from .tools.render import check_render_status, submit_render
from .tools.validation import audit_content_quality, validate_config
from .modes import get_mode_contract, list_mode_contracts, route_intent
from .tools.interactions import ask_user_interaction
from .tools.configs import (
    list_video_configs,
    load_video_config,
    present_revision_plan,
    present_target_selection,
    present_variant_plan,
    save_pipeline_config_to_source,
    stage_existing_config,
)
from .tools.pipeline import (
    create_pipeline_plan,
    get_next_pipeline_step,
    read_pipeline_plan,
    record_pipeline_decision,
    update_pipeline_step,
)

from .auto_resume import PipelineAutoResumeMiddleware
from .config import PROJECT_ROOT
from .context import PipelineContext

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"
SKILLS_DIR = Path(__file__).parent.parent / "skills"

MODEL_PRO   = os.environ.get("LLM_MODEL_PRO",   "gemini-3.5-flash")
MODEL_FLASH = os.environ.get("LLM_MODEL_FLASH",  "gemini-3.5-flash")
DEFAULT_MODEL = MODEL_PRO


def load_prompt(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")


def create_agent_backend() -> CompositeBackend:
    return CompositeBackend(
        default=StateBackend(),
        routes={
            "/skills/": FilesystemBackend(root_dir=str(SKILLS_DIR), virtual_mode=True),
            "/memories/": StoreBackend(
                namespace=lambda rt: ("video-orchestrator",),
            ),
        },
    )


def create_skills_middleware(backend=None) -> SkillsMiddleware:
    # Skills must use the same virtual path space exposed by FilesystemMiddleware.
    # The model sees /skills/... in the prompt and can later read those files with read_file.
    return SkillsMiddleware(
        backend=backend or create_agent_backend(),
        sources=["/skills/"],
    )



def create_video_orchestrator(*, checkpointer=None):
    """Create the multi-agent video orchestrator with 3 subgraphs."""
    from .subagents import (
        create_audio_planner,
        create_copywriter,
        create_director,
        create_researcher,
        create_reviewer,
        create_scene_creator,
        create_scene_qa,
        create_sound_engineer,
        create_validator,
        create_voice_generator,
    )

    model = create_model()

    backend = create_agent_backend()

    subagents = [
        create_researcher(),
        create_copywriter(),
        create_director(),
        create_scene_qa(),
        create_audio_planner(),
        create_voice_generator(),
        create_sound_engineer(),
        create_scene_creator(),
        create_validator(),
        create_reviewer(),
    ]

    system_prompt = load_prompt("orchestrator")

    middleware: list = [create_skills_middleware(backend), PipelineAutoResumeMiddleware()]
    try:
        from deepagents.middleware.summarization import create_summarization_tool_middleware
        middleware.append(create_summarization_tool_middleware(model, StateBackend))
    except ImportError:
        pass

    kwargs: dict = {
        "model": model,
        "tools": [
            route_intent,
            get_mode_contract,
            list_mode_contracts,
            ask_user_interaction,
            create_pipeline_plan,
            read_pipeline_plan,
            update_pipeline_step,
            record_pipeline_decision,
            get_next_pipeline_step,
            list_video_configs,
            load_video_config,
            stage_existing_config,
            save_pipeline_config_to_source,
            present_revision_plan,
            present_variant_plan,
            present_target_selection,
            submit_render,
            check_render_status,
            validate_config,
            audit_content_quality,
        ],
        "system_prompt": system_prompt,
        "subagents": subagents,
        "backend": backend,
        "middleware": middleware,
        "memory": ["/memories/AGENTS.md"],
        "name": "video-orchestrator",
        "context_schema": PipelineContext,
    }
    if checkpointer is not None:
        kwargs["checkpointer"] = checkpointer

    return create_deep_agent(**kwargs)
