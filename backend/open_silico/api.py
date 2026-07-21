from pathlib import Path
from secrets import compare_digest

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from open_silico import __version__
from open_silico.config import Settings, get_settings
from open_silico.experiment_contracts import (
    ExperimentEnvelope,
    ExperimentForkRequest,
    ExperimentList,
    ExperimentRequest,
)
from open_silico.experiment_orchestrator import ExperimentOrchestrator
from open_silico.experiment_repository import (
    ExperimentRepository,
    InMemoryExperimentRepository,
    SqliteExperimentRepository,
)
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
    experiment_repository: ExperimentRepository | None = None,
    static_dir: str | Path | None = None,
) -> FastAPI:
    active_settings = settings or get_settings()
    repository = experiment_repository or (
        InMemoryExperimentRepository()
        if active_settings.environment == "test"
        else SqliteExperimentRepository(active_settings.experiment_db_path)
    )
    active_jlens_runner = jlens_runner or ModalJacobianLensRunner(
        active_settings.modal_jlens_app_name
    )
    active_steering_runner = steering_runner or ModalActivationSteeringRunner(
        active_settings.modal_jlens_app_name
    )
    orchestrator = ExperimentOrchestrator(
        jlens_runner=active_jlens_runner,
        steering_runner=active_steering_runner,
        repository=repository,
    )
    app = FastAPI(
        title="Mechanoscope API",
        version=__version__,
        description="Capability catalog and experiment gateway for Mechanoscope.",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=active_settings.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization"],
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

    @app.get(
        "/api/experiments",
        response_model=ExperimentList,
        tags=["experiments"],
    )
    def list_experiments(limit: int = 25) -> ExperimentList:
        bounded_limit = max(1, min(limit, 100))
        return ExperimentList(experiments=repository.list(bounded_limit))

    @app.get(
        "/api/experiments/{experiment_id}",
        response_model=ExperimentEnvelope,
        tags=["experiments"],
    )
    def get_experiment(experiment_id: str) -> ExperimentEnvelope:
        experiment = repository.get(experiment_id)
        if experiment is None:
            raise HTTPException(status_code=404, detail="Experiment not found")
        return experiment

    @app.delete(
        "/api/experiments/{experiment_id}",
        status_code=204,
        tags=["experiments"],
    )
    def delete_experiment(
        experiment_id: str,
        authorization: str | None = Header(default=None),
    ) -> None:
        configured_token = (
            active_settings.admin_token.get_secret_value()
            if active_settings.admin_token is not None
            else None
        )
        if configured_token is None:
            if active_settings.environment not in {"development", "test"}:
                raise HTTPException(status_code=503, detail="Receipt deletion is disabled")
        else:
            scheme, _, candidate = (authorization or "").partition(" ")
            if scheme.lower() != "bearer" or not compare_digest(candidate, configured_token):
                raise HTTPException(status_code=401, detail="Owner authorization required")
        if not repository.delete(experiment_id):
            raise HTTPException(status_code=404, detail="Experiment not found")

    @app.post(
        "/api/experiments/{experiment_id}/replay",
        response_model=ExperimentEnvelope,
        tags=["experiments"],
    )
    def replay_experiment(experiment_id: str) -> ExperimentEnvelope:
        source = repository.get(experiment_id)
        if source is None:
            raise HTTPException(status_code=404, detail="Experiment not found")
        try:
            return orchestrator.run(
                source.request,
                parent_experiment_id=source.experiment_id,
                lineage_operation="replay",
            )
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
        "/api/experiments/{experiment_id}/fork",
        response_model=ExperimentEnvelope,
        tags=["experiments"],
    )
    def fork_experiment(
        experiment_id: str,
        fork: ExperimentForkRequest,
    ) -> ExperimentEnvelope:
        source = repository.get(experiment_id)
        if source is None:
            raise HTTPException(status_code=404, detail="Experiment not found")
        if fork.request.technique_id != source.technique_id:
            raise HTTPException(status_code=409, detail="A fork must retain its parent technique")
        try:
            return orchestrator.run(
                fork.request,
                parent_experiment_id=source.experiment_id,
                lineage_operation="fork",
            )
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
        try:
            return active_jlens_runner.run(request)
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
        try:
            return active_steering_runner.run(request)
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
