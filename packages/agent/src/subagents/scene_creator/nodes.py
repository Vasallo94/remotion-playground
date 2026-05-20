import subprocess
from typing import TypedDict

from ...paths import PROJECT_ROOT, SCENE_REGISTRY as REGISTRY_PATH


class SceneCreatorState(TypedDict):
    component_id: str
    code: str
    attempt: int
    max_attempts: int
    lint_error: str
    bundle_error: str
    status: str  # "generating" | "linting" | "registering" | "validating" | "done" | "error"


def init_node(state: SceneCreatorState) -> dict:
    return {
        "attempt": state.get("attempt", 0),
        "max_attempts": state.get("max_attempts", 3),
        "lint_error": state.get("lint_error", ""),
        "bundle_error": state.get("bundle_error", ""),
    }


def lint_node(state: SceneCreatorState) -> dict:
    """Run ESLint on the generated scene file."""
    from .tools import SCENES_DIR, _component_id_to_class_name

    class_name = _component_id_to_class_name(state["component_id"])
    file_path = SCENES_DIR / f"{class_name}.tsx"

    result = subprocess.run(
        ["npx", "eslint", str(file_path)],
        capture_output=True,
        text=True,
        timeout=30,
        cwd=str(PROJECT_ROOT),
    )

    if result.returncode != 0:
        return {
            "lint_error": result.stdout + result.stderr,
            "status": "generating",
            "attempt": state["attempt"] + 1,
        }
    return {"lint_error": "", "status": "registering"}


def register_node(state: SceneCreatorState) -> dict:
    """Add the new scene to customSceneRegistry.ts."""
    from .tools import _component_id_to_class_name

    component_id = state["component_id"]
    class_name = _component_id_to_class_name(component_id)

    registry_content = REGISTRY_PATH.read_text(encoding="utf-8")

    # Use class_name (PascalCase) for the idempotency check — more precise than
    # component_id (kebab-case) which could match substrings in comments/descriptions.
    if class_name in registry_content:
        return {"status": "validating"}

    import_line = f'import {{ {class_name} }} from "./scenes/custom/{class_name}"'
    # Register under both keys so the renderer finds it regardless of whether
    # config.json uses componentId "hook-architecture" or "HookArchitectureScene".
    entry_kebab = f'  "{component_id}": {class_name},'
    entry_pascal = f'  {class_name}: {class_name},'

    lines = registry_content.split("\n")
    last_import_idx = 0
    for idx, line in enumerate(lines):
        if line.startswith("import "):
            last_import_idx = idx
    lines.insert(last_import_idx + 1, import_line)

    # Add both entries before closing brace (insert in reverse so order is preserved)
    for idx in range(len(lines) - 1, -1, -1):
        if lines[idx].strip() == "}":
            lines.insert(idx, entry_pascal)
            lines.insert(idx, entry_kebab)
            break

    REGISTRY_PATH.write_text("\n".join(lines), encoding="utf-8")
    return {"status": "validating"}


def validate_node(state: SceneCreatorState) -> dict:
    """Verify the Remotion bundle compiles with the new scene."""
    result = subprocess.run(
        ["npx", "remotion", "bundle", "--log=error"],
        capture_output=True,
        text=True,
        timeout=120,
        cwd=str(PROJECT_ROOT),
    )

    if result.returncode != 0:
        return {
            "bundle_error": result.stderr,
            "status": "generating",
            "attempt": state["attempt"] + 1,
        }
    return {"bundle_error": "", "status": "done"}


def should_retry(state: SceneCreatorState) -> str:
    """Router: check if we should retry, are done, or should error out."""
    if state["status"] == "done":
        return "done"
    if state["status"] == "generating" and state["attempt"] < state["max_attempts"]:
        return "retry"
    return "error"
