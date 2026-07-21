from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from open_silico import __version__
from open_silico.config import Settings, get_settings
from open_silico.experiment_contracts import ExperimentEnvelope, ExperimentRequest
from open_silico.experiment_orchestrator import ExperimentOrchestrator
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
from open_silico.model_registry import build_catalog, build_technique_catalog
from open_silico.schemas import HealthResponse, ModelCatalog, TechniqueCatalog
from open_silico.steering_contracts import ActivationSteeringRequest, ActivationSteeringResponse
from open_silico.steering_service import ActivationSteeringRunner, ModalActivationSteeringRunner


def create_app(
    settings: Settings | None = None,
    *,
    jlens_runner: JacobianLensRunner | None = None,
    steering_runner: ActivationSteeringRunner | None = None,
    static_dir: str | Path | None = None,
) -> FastAPI:
    active_settings = settings or get_settings()
    app = FastAPI(
        title="Mechanoscope API",
        version=__version__,
        description="Capability catalog and experiment gateway for Mechanoscope.",
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

    @app.get("/api/techniques", response_model=TechniqueCatalog, tags=["techniques"])
    def techniques() -> TechniqueCatalog:
        return build_technique_catalog()

    @app.post(
        "/api/experiments/run",
        response_model=ExperimentEnvelope,
        responses={503: {"model": PublicError}, 504: {"model": PublicError}},
        tags=["experiments"],
    )
    def run_experiment(request: ExperimentRequest) -> ExperimentEnvelope:
        orchestrator = ExperimentOrchestrator(
            jlens_runner=jlens_runner
            or ModalJacobianLensRunner(active_settings.modal_jlens_app_name),
            steering_runner=steering_runner
            or ModalActivationSteeringRunner(active_settings.modal_jlens_app_name),
        )
        try:
            return orchestrator.run(request)
        except JacobianLensExecutionError as error:
            raise HTTPException(
                status_code=error.status_code,
                detail=PublicError(
                    code=error.code,
                    message=str(error),
                    retryable=error.retryable,
                ).model_dump(),
            ) from error

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

    @app.post(
        "/api/steer",
        response_model=ActivationSteeringResponse,
        responses={503: {"model": PublicError}, 504: {"model": PublicError}},
        tags=["activation-steering"],
    )
    def run_activation_steering(
        request: ActivationSteeringRequest,
    ) -> ActivationSteeringResponse:
        runner = steering_runner or ModalActivationSteeringRunner(
            active_settings.modal_jlens_app_name
        )
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

    if static_dir is not None:
        frontend_dir = Path(static_dir)
        if not frontend_dir.is_dir():
            raise RuntimeError(f"Frontend asset directory does not exist: {frontend_dir}")
        # Registered last so API, health, and OpenAPI routes stay authoritative.
        app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")

    return app


app = create_app()
