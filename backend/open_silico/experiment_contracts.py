from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

from open_silico.jlens_contracts import JacobianLensRequest, JacobianLensResponse
from open_silico.steering_contracts import (
    ActivationSteeringRequest,
    ActivationSteeringResponse,
)


class JacobianLensExperimentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    technique_id: Literal["jacobian_lens"]
    input: JacobianLensRequest


class ActivationSteeringExperimentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    technique_id: Literal["activation_steering"]
    input: ActivationSteeringRequest


ExperimentRequest = Annotated[
    JacobianLensExperimentRequest | ActivationSteeringExperimentRequest,
    Field(discriminator="technique_id"),
]


class ExperimentEnvelope(BaseModel):
    schema_version: Literal[1] = 1
    experiment_id: str
    technique_id: str
    status: Literal["complete"] = "complete"
    started_at: datetime
    finished_at: datetime
    request: ExperimentRequest
    result: JacobianLensResponse | ActivationSteeringResponse
    parent_experiment_id: str | None = None
    lineage_operation: Literal["replay", "fork"] | None = None


class ExperimentList(BaseModel):
    experiments: list[ExperimentEnvelope]


class ExperimentForkRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request: ExperimentRequest
