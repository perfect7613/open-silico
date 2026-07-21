from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class TechniqueSpec:
    id: str
    label: str
    kind: str
    description: str
    requires_artifact: bool
    supports_sweeps: bool


TECHNIQUE_SPECS = (
    TechniqueSpec(
        id="jacobian_lens",
        label="Jacobian Lens",
        kind="observation",
        description=(
            "Inspect how intermediate representations are transported toward the "
            "model's final output basis across layers and token positions."
        ),
        requires_artifact=True,
        supports_sweeps=False,
    ),
    TechniqueSpec(
        id="activation_steering",
        label="Activation Steering",
        kind="intervention",
        description=(
            "Derive a contrast direction from examples and causally intervene on a "
            "selected residual-stream layer during generation."
        ),
        requires_artifact=False,
        supports_sweeps=True,
    ),
)

TECHNIQUE_SPECS_BY_ID = {spec.id: spec for spec in TECHNIQUE_SPECS}


def get_technique_spec(technique_id: str) -> TechniqueSpec:
    try:
        return TECHNIQUE_SPECS_BY_ID[technique_id]
    except KeyError as error:
        supported = ", ".join(TECHNIQUE_SPECS_BY_ID)
        raise ValueError(
            f"unsupported technique {technique_id!r}; expected one of: {supported}"
        ) from error
