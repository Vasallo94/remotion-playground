"""Middleware that auto-resumes the pipeline when the LLM stalls.

When Gemini Flash outputs text instead of calling get_next_pipeline_step(),
the model-tools loop ends and the LangGraph run completes prematurely.
This middleware's after_agent hook detects remaining pipeline steps and
uses jump_to="model" to re-enter the loop with a continuation message.
"""

import json
import logging
from typing import Any

from langchain.agents.middleware.types import AgentMiddleware, hook_config
from langchain_core.messages import HumanMessage

from .paths import PIPELINE_STATE_FILE

logger = logging.getLogger(__name__)

_MAX_AUTO_RESUMES = 25
_MAX_STALL_RESUMES = 3

_CONTINUE_MSG = (
    "The pipeline has remaining steps. Call `get_next_pipeline_step()` immediately. "
    "Do NOT respond with text — call the tool now."
)


class PipelineAutoResumeMiddleware(AgentMiddleware):
    """Re-enters the model node when the pipeline has remaining steps."""

    def __init__(self) -> None:
        self._resume_count = 0
        self._last_completed_count = -1
        self._stall_count = 0

    @hook_config(can_jump_to=["model"])
    def after_agent(self, state: Any, runtime: Any) -> dict[str, Any] | None:
        plan = self._read_plan()
        if plan is None:
            return None

        status = plan.get("status", "")
        if status in ("completed", "failed"):
            logger.info("Pipeline %s — no auto-resume needed", status)
            self._reset()
            return None

        steps = plan.get("steps", [])
        completed = sum(1 for s in steps if s.get("status") in ("completed", "skipped"))
        remaining = sum(1 for s in steps if s.get("status") not in ("completed", "skipped"))

        if remaining == 0:
            self._reset()
            return None

        if self._resume_count >= _MAX_AUTO_RESUMES:
            logger.warning("Auto-resume hard limit reached (%d)", _MAX_AUTO_RESUMES)
            self._reset()
            return None

        if completed == self._last_completed_count:
            self._stall_count += 1
            if self._stall_count >= _MAX_STALL_RESUMES:
                logger.warning(
                    "Stall detected: %d consecutive resumes without progress",
                    self._stall_count,
                )
                self._reset()
                return None
        else:
            self._stall_count = 0

        self._last_completed_count = completed
        self._resume_count += 1

        logger.info(
            "Auto-resuming pipeline (resume #%d, %d/%d steps done, %d remaining)",
            self._resume_count,
            completed,
            len(steps),
            remaining,
        )

        return {
            "jump_to": "model",
            "messages": [HumanMessage(content=_CONTINUE_MSG)],
        }

    def _read_plan(self) -> dict | None:
        if not PIPELINE_STATE_FILE.exists():
            return None
        try:
            return json.loads(PIPELINE_STATE_FILE.read_text())
        except (json.JSONDecodeError, OSError):
            return None

    def _reset(self) -> None:
        self._resume_count = 0
        self._last_completed_count = -1
        self._stall_count = 0
