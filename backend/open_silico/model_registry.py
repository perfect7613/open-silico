from dataclasses import dataclass

from open_silico.config import Settings
from open_silico.schemas import ModelAccess, ModelCatalog, ModelSummary, TechniqueSummary

TECHNIQUES = (
    TechniqueSummary(id="jacobian_lens", label="Jacobian Lens"),
    TechniqueSummary(id="activation_steering", label="Activation Steering"),
)


def _techniques_for(spec: "ModelSpec") -> tuple[TechniqueSummary, ...]:
    if spec.key == "qwen3.5-4b":
        return (
            TechniqueSummary(
                id="jacobian_lens",
                label="Jacobian Lens",
                implementation_state="available",
            ),
            TECHNIQUES[1],
        )
    return TECHNIQUES


@dataclass(frozen=True, slots=True)
class ModelSpec:
    key: str
    display_name: str
    provider: str
    model_id: str
    revision: str
    license_name: str
    gated: bool
    default_layer: int
    parameter_count: str


MODEL_SPECS = (
    ModelSpec(
        key="gemma-3-1b-it",
        display_name="Gemma 3 1B Instruct",
        provider="Google DeepMind",
        model_id="google/gemma-3-1b-it",
        revision="dcc83ea841ab6100d6b47a070329e1ba4cf78752",
        license_name="Gemma Terms of Use",
        gated=True,
        default_layer=18,
        parameter_count="1B",
    ),
    ModelSpec(
        key="qwen3.5-4b",
        display_name="Qwen3.5 4B",
        provider="Qwen",
        model_id="Qwen/Qwen3.5-4B",
        revision="851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a",
        license_name="Apache-2.0",
        gated=False,
        default_layer=20,
        parameter_count="4B",
    ),
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
            parameter_count=spec.parameter_count,
        )
        for spec in MODEL_SPECS
    )
    default_model = next(
        (model.key for model in models if model.key == "gemma-3-1b-it" and model.access.configured),
        "qwen3.5-4b",
    )
    return ModelCatalog(models=models, default_model=default_model)
