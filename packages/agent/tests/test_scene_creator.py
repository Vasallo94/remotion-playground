def test_scene_creator_tools():
    from src.subagents.scene_creator.tools import read_scene, write_scene

    assert callable(write_scene)
    assert callable(read_scene)


def test_component_id_to_class_name():
    from src.subagents.scene_creator.tools import _component_id_to_class_name

    assert _component_id_to_class_name("block-diagram") == "BlockDiagramScene"
    assert _component_id_to_class_name("code-block") == "CodeBlockScene"
    assert _component_id_to_class_name("timeline") == "TimelineScene"


def test_write_scene_creates_file(tmp_path, monkeypatch):
    from src.subagents.scene_creator import tools

    monkeypatch.setattr(tools, "SCENES_DIR", tmp_path)
    code = "export const TestWidgetScene = () => <div>test</div>"
    result = tools.write_scene("test-widget", code)
    expected_file = tmp_path / "TestWidgetScene.tsx"
    assert expected_file.exists()
    assert expected_file.read_text() == code
    assert "TestWidgetScene.tsx" in result


def test_read_scene_returns_content(tmp_path, monkeypatch):
    from src.subagents.scene_creator import tools

    monkeypatch.setattr(tools, "SCENES_DIR", tmp_path)
    scene_file = tmp_path / "BlockDiagramScene.tsx"
    scene_file.write_text("export const BlockDiagramScene = () => <div />;")
    result = tools.read_scene("block-diagram")
    assert "BlockDiagramScene" in result


def test_read_scene_not_found(tmp_path, monkeypatch):
    from src.subagents.scene_creator import tools

    monkeypatch.setattr(tools, "SCENES_DIR", tmp_path)
    result = tools.read_scene("nonexistent")
    assert "not found" in result


def test_scene_creator_graph_compiles():
    from src.subagents.scene_creator.graph import create_scene_creator_graph

    graph = create_scene_creator_graph()
    assert graph is not None


def test_scene_creator_definition():
    from src.subagents.scene_creator.graph import create_scene_creator

    defn = create_scene_creator()
    assert defn["name"] == "scene_creator"
    assert "graph" in defn
    assert "tools" in defn
    tool_names = [t.__name__ for t in defn["tools"]]
    assert "write_scene" in tool_names
    assert "read_scene" in tool_names
    assert "present_custom_scene" in tool_names
    assert len(defn["tools"]) == 6


# Minimal registry stub that register_node can parse
_REGISTRY_STUB = """\
import { ExistingScene } from "./scenes/custom/ExistingScene"

export const customSceneRegistry: Record<string, unknown> = {
  "existing-scene": ExistingScene,
}
"""


def test_register_node_adds_both_keys(tmp_path, monkeypatch):
    """register_node must add kebab-case AND PascalCase entries for the new scene."""
    from src.subagents.scene_creator import nodes

    registry_file = tmp_path / "customSceneRegistry.ts"
    registry_file.write_text(_REGISTRY_STUB, encoding="utf-8")
    monkeypatch.setattr(nodes, "REGISTRY_PATH", registry_file)

    state = {"component_id": "auto-repair-loop", "code": "", "attempt": 0, "max_attempts": 3, "lint_error": "", "bundle_error": "", "status": "registering"}
    nodes.register_node(state)

    content = registry_file.read_text()
    assert 'import { AutoRepairLoopScene }' in content
    assert '"auto-repair-loop": AutoRepairLoopScene' in content
    assert "AutoRepairLoopScene: AutoRepairLoopScene" in content


def test_register_node_idempotent(tmp_path, monkeypatch):
    """Calling register_node twice must not duplicate entries."""
    from src.subagents.scene_creator import nodes

    registry_file = tmp_path / "customSceneRegistry.ts"
    registry_file.write_text(_REGISTRY_STUB, encoding="utf-8")
    monkeypatch.setattr(nodes, "REGISTRY_PATH", registry_file)

    state = {"component_id": "auto-repair-loop", "code": "", "attempt": 0, "max_attempts": 3, "lint_error": "", "bundle_error": "", "status": "registering"}
    nodes.register_node(state)
    nodes.register_node(state)

    content = registry_file.read_text()
    assert content.count("AutoRepairLoopScene: AutoRepairLoopScene") == 1
