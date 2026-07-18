from typing import Protocol

import modal

from open_silico.jlens_contracts import JacobianLensRequest, JacobianLensResponse


class JacobianLensExecutionError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        retryable: bool = False,
        status_code: int = 503,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable
        self.status_code = status_code


def classify_modal_error(error: Exception) -> JacobianLensExecutionError:
    error_name = type(error).__name__.lower()
    error_message = str(error).lower()
    if "dimension mismatch" in error_message:
        return JacobianLensExecutionError(
            "model_lens_mismatch",
            "The deployed model and lens dimensions do not match.",
            status_code=503,
        )
    if "not in source_layers" in error_message or "out of range" in error_message:
        return JacobianLensExecutionError(
            "invalid_layers",
            "One or more requested layers are unavailable for this fitted lens.",
            status_code=422,
        )
    if "timeout" in error_name or "timeout" in error_message:
        return JacobianLensExecutionError(
            "cold_start_timeout",
            "The GPU worker did not become ready in time. Try once more.",
            retryable=True,
            status_code=504,
        )
    return JacobianLensExecutionError(
        "runtime_unavailable",
        "The Jacobian Lens worker is unavailable. Confirm that the Modal app is deployed.",
        retryable=True,
        status_code=503,
    )


class JacobianLensRunner(Protocol):
    def run(self, request: JacobianLensRequest) -> JacobianLensResponse: ...


class ModalJacobianLensRunner:
    def __init__(self, app_name: str) -> None:
        self.app_name = app_name

    def run(self, request: JacobianLensRequest) -> JacobianLensResponse:
        try:
            worker_cls = modal.Cls.from_name(self.app_name, "QwenJacobianLens")
            payload = worker_cls().run.remote(request.model_dump())
            return JacobianLensResponse.model_validate(payload)
        except JacobianLensExecutionError:
            raise
        except Exception as error:
            raise classify_modal_error(error) from error
