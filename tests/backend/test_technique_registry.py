from open_silico.config import Settings
from open_silico.model_registry import build_catalog, build_technique_catalog
from open_silico.model_specs import MODEL_SPECS
from open_silico.technique_registry import TECHNIQUE_SPECS_BY_ID


def test_model_capabilities_resolve_to_authoritative_techniques() -> None:
    for model in MODEL_SPECS:
        assert model.capabilities
        assert set(model.capabilities) <= set(TECHNIQUE_SPECS_BY_ID)


def test_catalog_exposes_platform_technique_metadata() -> None:
    catalog = build_technique_catalog()
    by_id = {technique.id: technique for technique in catalog.techniques}

    assert by_id["jacobian_lens"].kind == "observation"
    assert by_id["jacobian_lens"].requires_artifact is True
    assert by_id["activation_steering"].kind == "intervention"
    assert by_id["activation_steering"].supports_sweeps is True


def test_every_model_uses_its_explicit_capability_order() -> None:
    catalog = build_catalog(Settings(hf_access_configured=True))

    for model, spec in zip(catalog.models, MODEL_SPECS, strict=True):
        assert tuple(technique.id for technique in model.techniques) == spec.capabilities
