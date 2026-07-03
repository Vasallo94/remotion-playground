from dataclasses import fields
from src.context import PipelineContext


class TestPipelineContext:
    def test_required_fields(self):
        ctx = PipelineContext(config_id="seguro-coche-promo")
        assert ctx.config_id == "seguro-coche-promo"

    def test_defaults(self):
        ctx = PipelineContext(config_id="test")
        assert ctx.composition == ""
        assert ctx.width == 1280
        assert ctx.height == 720
        assert ctx.theme == "betelgeuse"
        assert ctx.output_dir != ""
        assert ctx.render_service_url == "http://localhost:3100"

    def test_product_short_override(self):
        ctx = PipelineContext(
            config_id="promo-movilidad",
            composition="ProductShort",
            width=1080,
            height=1920,
        )
        assert ctx.composition == "ProductShort"
        assert ctx.width == 1080
        assert ctx.height == 1920

    def test_is_dataclass(self):
        field_names = {f.name for f in fields(PipelineContext)}
        expected = {"config_id", "composition", "width", "height", "theme", "output_dir", "render_service_url"}
        assert expected == field_names
