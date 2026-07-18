from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from open_silico import __version__
from open_silico.config import Settings, get_settings
from open_silico.model_registry import build_catalog
from open_silico.schemas import HealthResponse, ModelCatalog


def create_app(settings: Settings | None = None) -> FastAPI:
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

    return app


app = create_app()
