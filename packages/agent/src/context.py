import os
import uuid
from dataclasses import dataclass, field, fields, MISSING
from typing import Any

from .paths import PROJECT_ROOT as _PROJECT_ROOT_PATH

_PROJECT_ROOT = str(_PROJECT_ROOT_PATH)


def _generate_config_id() -> str:
    return f"video-{uuid.uuid4().hex[:8]}"


@dataclass
class PipelineContext:
    config_id: str = field(default_factory=_generate_config_id)
    composition: str = ""
    width: int = 1280
    height: int = 720
    theme: str = "betelgeuse"
    output_dir: str = field(default_factory=lambda: os.environ.get("PROJECT_ROOT", _PROJECT_ROOT))
    render_service_url: str = field(
        default_factory=lambda: os.environ.get("RENDER_SERVICE_URL", "http://localhost:3100")
    )

    def __init__(self, **kwargs: Any) -> None:
        for f in fields(self.__class__):
            if f.name in kwargs:
                setattr(self, f.name, kwargs[f.name])
            elif f.default is not MISSING:
                setattr(self, f.name, f.default)
            elif f.default_factory is not MISSING:
                setattr(self, f.name, f.default_factory())  # type: ignore[misc]


def get_pipeline_context(runtime: Any) -> "PipelineContext | None":
    return getattr(runtime, "context", None) if runtime else None


def resolve_config_id(runtime: Any, config: dict) -> str:
    config_id = config.get("id")
    if config_id:
        return config_id
    ctx = get_pipeline_context(runtime)
    return ctx.config_id if ctx else "unknown"
