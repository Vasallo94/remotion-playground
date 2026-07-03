from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal, TypedDict

ModeName = Literal[
    "new_video",
    "revise_existing",
    "render_only",
    "recover_failed_render",
    "audit_only",
    "variant",
    "asset_regeneration",
    "question",
    "self_improve",
]


class ActiveVideoTarget(TypedDict, total=False):
    configPath: str
    configId: str
    jobId: str
    composition: str
    title: str


@dataclass(frozen=True)
class ModeContract:
    mode: ModeName
    description: str
    requires_target: bool
    can_write_files: bool
    can_render: bool
    allowed_agents: tuple[str, ...]
    forbidden_agents: tuple[str, ...] = ()
    checkpoints: tuple[str, ...] = ()
    rules: tuple[str, ...] = ()

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class IntentDecision:
    mode: ModeName
    confidence: float
    requires_target: bool
    target: ActiveVideoTarget | None
    agent_scope: tuple[str, ...]
    requires_checkpoint: bool
    can_write_files: bool
    can_render: bool
    rationale: str
    missing_target: bool = False
    forbidden_agents: tuple[str, ...] = field(default_factory=tuple)
    checkpoints: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict:
        data = asdict(self)
        data["agent_scope"] = list(self.agent_scope)
        data["forbidden_agents"] = list(self.forbidden_agents)
        data["checkpoints"] = list(self.checkpoints)
        return data


ALL_MODES: tuple[ModeName, ...] = (
    "new_video",
    "revise_existing",
    "render_only",
    "recover_failed_render",
    "audit_only",
    "variant",
    "asset_regeneration",
    "question",
    "self_improve",
)

MODE_CONTRACTS: dict[ModeName, ModeContract] = {
    "new_video": ModeContract(
        mode="new_video",
        description="Create a new video config and optionally render it through the full creative pipeline.",
        requires_target=False,
        can_write_files=True,
        can_render=True,
        allowed_agents=(
            "researcher",
            "copywriter",
            "director",
            "audio_planner",
            "voice_generator",
            "sound_engineer",
            "scene_creator",
            "validator",
            "reviewer",
        ),
        checkpoints=(
            "escaleta_checkpoint",
            "direction_checkpoint",
            "audio_chart_checkpoint",
            "validation_report",
            "review_checkpoint",
        ),
        rules=(
            "Use the existing full pipeline.",
            'Default tutorial theme is "betelgeuse" unless the user explicitly requests another theme.',
            "Do not write config.json until the escaleta has explicit human approval.",
        ),
    ),
    "revise_existing": ModeContract(
        mode="revise_existing",
        description="Patch an existing config with the smallest change that satisfies the user request.",
        requires_target=True,
        can_write_files=True,
        can_render=True,
        allowed_agents=("director", "audio_planner", "voice_generator", "sound_engineer", "scene_creator", "validator", "reviewer"),
        forbidden_agents=("researcher", "copywriter"),
        checkpoints=("revision_plan_checkpoint", "direction_checkpoint", "audio_chart_checkpoint", "validation_report"),
        rules=(
            "Load and stage the target config before dispatching agents.",
            "Present a revision plan and wait for approval before modifying files.",
            "Preserve id, composition, and scene structure unless the user explicitly asks to change them.",
            "Never create a new config when the user asked to revise an existing one.",
        ),
    ),
    "render_only": ModeContract(
        mode="render_only",
        description="Validate and render an existing config without changing content.",
        requires_target=True,
        can_write_files=False,
        can_render=True,
        allowed_agents=("validator", "reviewer"),
        forbidden_agents=("researcher", "copywriter", "director", "audio_planner", "voice_generator", "sound_engineer", "scene_creator"),
        checkpoints=("validation_report",),
        rules=(
            "Do not modify config, assets, copy, direction, or audio.",
            "If validation fails, stop and suggest recover_failed_render instead of patching automatically.",
        ),
    ),
    "recover_failed_render": ModeContract(
        mode="recover_failed_render",
        description="Fix concrete validation or render failures in an existing config.",
        requires_target=True,
        can_write_files=True,
        can_render=True,
        allowed_agents=("scene_creator", "validator", "reviewer"),
        forbidden_agents=("researcher", "copywriter"),
        checkpoints=("revision_plan_checkpoint", "validation_report"),
        rules=(
            "Only touch fields or assets needed to unblock validation/render.",
            "Do not rewrite the creative concept, scene order, or copy unless required by the error.",
        ),
    ),
    "audit_only": ModeContract(
        mode="audit_only",
        description="Analyze a target config or topic and answer with recommendations only.",
        requires_target=True,
        can_write_files=False,
        can_render=False,
        allowed_agents=("validator", "reviewer"),
        forbidden_agents=(
            "researcher",
            "copywriter",
            "director",
            "audio_planner",
            "voice_generator",
            "sound_engineer",
            "scene_creator",
        ),
        checkpoints=(),
        rules=("Do not write files, generate assets, or render.", "Return findings and proposed improvements only."),
    ),
    "variant": ModeContract(
        mode="variant",
        description="Create a new config derived from an existing one.",
        requires_target=True,
        can_write_files=True,
        can_render=True,
        allowed_agents=("director", "audio_planner", "voice_generator", "sound_engineer", "scene_creator", "validator", "reviewer"),
        forbidden_agents=("researcher",),
        checkpoints=("variant_plan_checkpoint", "direction_checkpoint", "audio_chart_checkpoint", "validation_report"),
        rules=(
            "Never overwrite the source config.",
            "Create a new config with a new id and derivedFrom pointing at the source id/path.",
            "Present a variant plan and wait for approval before creating files.",
        ),
    ),
    "asset_regeneration": ModeContract(
        mode="asset_regeneration",
        description="Regenerate or copy only voiceover, music, SFX, or media assets for an existing config.",
        requires_target=True,
        can_write_files=True,
        can_render=False,
        allowed_agents=("audio_planner", "voice_generator", "sound_engineer", "validator"),
        forbidden_agents=("researcher", "copywriter", "director", "scene_creator", "reviewer"),
        checkpoints=("audio_chart_checkpoint", "validation_report"),
        rules=(
            "Do not change scene copy, timing, composition, or config identity unless required for asset paths.",
            "Limit work to the requested asset category.",
        ),
    ),
    "question": ModeContract(
        mode="question",
        description="Answer directly without dispatching creative or production agents.",
        requires_target=False,
        can_write_files=False,
        can_render=False,
        allowed_agents=(),
        forbidden_agents=(
            "researcher",
            "copywriter",
            "director",
            "audio_planner",
            "voice_generator",
            "sound_engineer",
            "scene_creator",
            "validator",
            "reviewer",
        ),
        rules=("Answer the question directly.", "Do not call render, validation, or file-writing tools."),
    ),
    "self_improve": ModeContract(
        mode="self_improve",
        description="Review accumulated friction (AFP drafts) and ship improvements to Claqueta's own creative code as GitHub PRs for human review.",
        requires_target=False,
        can_write_files=True,
        can_render=True,
        allowed_agents=("improver",),
        forbidden_agents=(
            "researcher",
            "copywriter",
            "director",
            "audio_planner",
            "voice_generator",
            "sound_engineer",
            "scene_creator",
            "validator",
            "reviewer",
        ),
        checkpoints=("improvement_plan_approval",),
        rules=(
            "Read the friction backlog before proposing anything.",
            "Present an improvement plan and wait for explicit human approval before touching any code.",
            "All changes go to an improve/* branch and a GitHub PR — never commit to main.",
            "Only edit files inside the write allowlist (custom scenes, agent skills/prompts, content configs).",
            "If a change touches scenes, render a sample video as PR evidence; if the render fails, do not open the PR.",
        ),
    ),
}


def get_mode_contract(mode: ModeName) -> dict:
    """Return the contract for a video-orchestrator mode."""
    return MODE_CONTRACTS[mode].to_dict()


def list_mode_contracts() -> dict:
    """Return all available mode contracts keyed by mode name."""
    return {mode: contract.to_dict() for mode, contract in MODE_CONTRACTS.items()}


def route_intent(
    mode: ModeName,
    user_request: str,
    rationale: str = "",
    active_target: ActiveVideoTarget | None = None,
) -> dict:
    """Confirm a mode selection and return the full contract.

    The orchestrator decides the mode based on its understanding of the
    user's message, then calls this tool to get the contract and log
    the decision.  No regex classification — the LLM is the classifier.

    Args:
        mode: The mode the orchestrator chose for this request.
        user_request: Latest user message (used for target extraction).
        rationale: Brief reason the orchestrator chose this mode.
        active_target: Optional selected video artifact from the UI.
    """
    if mode not in MODE_CONTRACTS:
        return {"error": f"Unknown mode: {mode}. Valid: {', '.join(ALL_MODES)}"}

    request = user_request.strip()
    parsed_target = active_target or _extract_target_from_request(request)
    contract = MODE_CONTRACTS[mode]
    missing_target = contract.requires_target and not parsed_target

    decision = IntentDecision(
        mode=mode,
        confidence=1.0,
        requires_target=contract.requires_target,
        target=parsed_target,
        agent_scope=contract.allowed_agents,
        requires_checkpoint=bool(contract.checkpoints),
        can_write_files=contract.can_write_files,
        can_render=contract.can_render,
        rationale=rationale or f"Orchestrator selected {mode}.",
        missing_target=missing_target,
        forbidden_agents=contract.forbidden_agents,
        checkpoints=contract.checkpoints,
    )
    return decision.to_dict()


def _extract_target_from_request(request: str) -> ActiveVideoTarget | None:
    marker = "ACTIVE_VIDEO_TARGET:"
    if marker not in request:
        return None

    raw = request.split(marker, 1)[1].strip()
    if not raw:
        return None

    import json

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None

    if not isinstance(data, dict):
        return None

    target: ActiveVideoTarget = {}
    for key in ("configPath", "configId", "jobId", "composition", "title"):
        value = data.get(key)
        if isinstance(value, str) and value:
            target[key] = value
    return target or None
