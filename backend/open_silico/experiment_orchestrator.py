from datetime import UTC, datetime
from uuid import uuid4

from open_silico.experiment_contracts import (
    ActivationSteeringExperimentRequest,
    ExperimentEnvelope,
    ExperimentRequest,
    JacobianLensExperimentRequest,
)
from open_silico.jlens_service import JacobianLensRunner
from open_silico.model_specs import get_model_spec
from open_silico.steering_service import ActivationSteeringRunner


class ExperimentOrchestrator:
    """Capability gate and provenance envelope around Technique runners."""

    def __init__(
        self,
        *,
        jlens_runner: JacobianLensRunner,
        steering_runner: ActivationSteeringRunner,
    ) -> None:
        self.jlens_runner = jlens_runner
        self.steering_runner = steering_runner

    def run(self, request: ExperimentRequest) -> ExperimentEnvelope:
        started_at = datetime.now(UTC)

        if isinstance(request, JacobianLensExperimentRequest):
            self._require_capability(request.input.model_key, request.technique_id)
            result = self.jlens_runner.run(request.input)
        elif isinstance(request, ActivationSteeringExperimentRequest):
            self._require_capability(request.input.model_key, request.technique_id)
            result = self.steering_runner.run(request.input)
        else:  # pragma: no cover - discriminated request validation owns this boundary
            raise TypeError(f"unsupported experiment request: {type(request).__name__}")

        return ExperimentEnvelope(
            experiment_id=str(uuid4()),
            technique_id=request.technique_id,
            started_at=started_at,
            finished_at=datetime.now(UTC),
            result=result,
        )

    @staticmethod
    def _require_capability(model_key: str, technique_id: str) -> None:
        model = get_model_spec(model_key)
        if technique_id not in model.capabilities:
            raise ValueError(f"model {model_key!r} does not support technique {technique_id!r}")
