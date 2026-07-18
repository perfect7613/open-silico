from typing import Protocol

import modal

from open_silico.jlens_service import JacobianLensExecutionError, classify_modal_error
from open_silico.steering_contracts import ActivationSteeringRequest, ActivationSteeringResponse


class ActivationSteeringRunner(Protocol):
    def run(self, request: ActivationSteeringRequest) -> ActivationSteeringResponse: ...


class ModalActivationSteeringRunner:
    def __init__(self, app_name: str) -> None:
        self.app_name = app_name

    def run(self, request: ActivationSteeringRequest) -> ActivationSteeringResponse:
        try:
            worker_cls = modal.Cls.from_name(self.app_name, "OpenSilicoModel")
            payload = worker_cls(model_key=request.model_key).steer.remote(request.model_dump())
            return ActivationSteeringResponse.model_validate(payload)
        except JacobianLensExecutionError:
            raise
        except Exception as error:
            raise classify_modal_error(error) from error
