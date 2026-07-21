from dataclasses import dataclass

from open_silico.technique_registry import TECHNIQUE_SPECS_BY_ID


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
    max_layer: int
    recommended_steering_strength: float
    parameter_count: str
    lens_file: str
    capabilities: tuple[str, ...]
    chat_template_options: tuple[tuple[str, bool], ...] = ()

    def template_options(self) -> dict[str, bool]:
        return dict(self.chat_template_options)


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
        max_layer=25,
        recommended_steering_strength=0.3,
        parameter_count="1B",
        lens_file="gemma-3-1b-it/jlens/Salesforce-wikitext/gemma-3-1b-it_jacobian_lens.pt",
        capabilities=("jacobian_lens", "activation_steering"),
    ),
    ModelSpec(
        key="qwen3-1.7b",
        display_name="Qwen3 1.7B",
        provider="Qwen",
        model_id="Qwen/Qwen3-1.7B",
        revision="70d244cc86ccca08cf5af4e1e306ecf908b1ad5e",
        license_name="Apache-2.0",
        gated=False,
        default_layer=18,
        max_layer=27,
        recommended_steering_strength=1.0,
        parameter_count="1.7B",
        lens_file="qwen3-1.7b/jlens/Salesforce-wikitext/Qwen3-1.7B_jacobian_lens.pt",
        capabilities=("jacobian_lens", "activation_steering"),
        chat_template_options=(("enable_thinking", False),),
    ),
)

MODEL_SPECS_BY_KEY = {spec.key: spec for spec in MODEL_SPECS}

for model_spec in MODEL_SPECS:
    unknown_capabilities = set(model_spec.capabilities) - set(TECHNIQUE_SPECS_BY_ID)
    if unknown_capabilities:
        unknown = ", ".join(sorted(unknown_capabilities))
        raise ValueError(f"model {model_spec.key!r} declares unknown techniques: {unknown}")


def get_model_spec(model_key: str) -> ModelSpec:
    try:
        return MODEL_SPECS_BY_KEY[model_key]
    except KeyError as error:
        supported = ", ".join(MODEL_SPECS_BY_KEY)
        raise ValueError(
            f"unsupported model key {model_key!r}; expected one of: {supported}"
        ) from error


def validate_model_key(model_key: str) -> str:
    get_model_spec(model_key)
    return model_key
