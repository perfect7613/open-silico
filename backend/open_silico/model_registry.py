from open_silico.config import Settings
from open_silico.model_specs import MODEL_SPECS, ModelSpec
from open_silico.schemas import (
    ModelAccess,
    ModelCatalog,
    ModelSummary,
    TechniqueCatalog,
    TechniqueSummary,
)
from open_silico.technique_registry import TECHNIQUE_SPECS, TECHNIQUE_SPECS_BY_ID

TECHNIQUES = tuple(
    TechniqueSummary(
        id=spec.id,
        label=spec.label,
        kind=spec.kind,
        description=spec.description,
        requires_artifact=spec.requires_artifact,
        supports_sweeps=spec.supports_sweeps,
    )
    for spec in TECHNIQUE_SPECS
)


def _techniques_for(spec: "ModelSpec") -> tuple[TechniqueSummary, ...]:
    return tuple(
        TechniqueSummary(
            id=technique_spec.id,
            label=technique_spec.label,
            kind=technique_spec.kind,
            description=technique_spec.description,
            requires_artifact=technique_spec.requires_artifact,
            supports_sweeps=technique_spec.supports_sweeps,
            implementation_state="available",
        )
        for technique_id in spec.capabilities
        for technique_spec in (TECHNIQUE_SPECS_BY_ID[technique_id],)
    )


def _access_for(spec: ModelSpec, settings: Settings) -> ModelAccess:
    if spec.gated and not settings.hf_access_configured:
        return ModelAccess(
            state="requires_access",
            gated=True,
            configured=False,
            message=(
                "Accept the model license on Hugging Face and configure the "
                f"{settings.hf_secret_name!r} Modal Secret."
            ),
        )

    return ModelAccess(
        state="available",
        gated=spec.gated,
        configured=True,
        message="Access configured. The GPU worker will load on the first experiment.",
    )


def build_catalog(settings: Settings) -> ModelCatalog:
    models = tuple(
        ModelSummary(
            key=spec.key,
            display_name=spec.display_name,
            provider=spec.provider,
            model_id=spec.model_id,
            revision=spec.revision,
            license_name=spec.license_name,
            access=_access_for(spec, settings),
            techniques=_techniques_for(spec),
            default_layer=spec.default_layer,
            max_layer=spec.max_layer,
            recommended_steering_strength=spec.recommended_steering_strength,
            parameter_count=spec.parameter_count,
        )
        for spec in MODEL_SPECS
    )
    default_model = next(
        (model.key for model in models if model.key == "gemma-3-1b-it" and model.access.configured),
        "qwen3-1.7b",
    )
    return ModelCatalog(models=models, default_model=default_model)


def build_technique_catalog() -> TechniqueCatalog:
    return TechniqueCatalog(techniques=TECHNIQUES)
