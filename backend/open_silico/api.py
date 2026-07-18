from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from open_silico import __version__
from open_silico.config import Settings, get_settings
from open_silico.jlens_contracts import (
    JacobianLensRequest,
    JacobianLensResponse,
    PublicError,
)
from open_silico.jlens_service import (
    JacobianLensExecutionError,
    JacobianLensRunner,
    ModalJacobianLensRunner,
)
from open_silico.model_registry import build_catalog
from open_silico.schemas import HealthResponse, ModelCatalog


def create_app(
    settings: Settings | None = None,
    *,
    jlens_runner: JacobianLensRunner | None = None,
) -> FastAPI:
    active_settings = settings or get_settings()
    app = FastAPI(
        title="Open Silico API",
        version=__version__,
        description="Capability catalog and experiment gateway for Open Silico.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.get("/health", response_model=HealthResponse, tags=["system"])
    def health() -> HealthResponse:
        return HealthResponse(version=__version__, environment=active_settings.environment)

    @app.get("/api/models", response_model=ModelCatalog, tags=["models"])
    def models() -> ModelCatalog:
        return build_catalog(active_settings)

    @app.post(
        "/api/jlens/run",
        response_model=JacobianLensResponse,
        responses={503: {"model": PublicError}, 504: {"model": PublicError}},
        tags=["jacobian-lens"],
    )
    def run_jacobian_lens(request: JacobianLensRequest) -> JacobianLensResponse:
        runner = jlens_runner or ModalJacobianLensRunner(active_settings.modal_jlens_app_name)
        try:
            return runner.run(request)
        except JacobianLensExecutionError as error:
            raise HTTPException(
                status_code=error.status_code,
                detail=PublicError(
                    code=error.code,
                    message=str(error),
                    retryable=error.retryable,
                ).model_dump(),
            ) from error

    return app


app = create_app()
