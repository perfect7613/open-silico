from typing import Literal

from pydantic import BaseModel, ConfigDict

AccessState = Literal["available", "requires_access", "unavailable"]
RuntimeState = Literal["idle", "loading", "ready", "error"]


class TechniqueSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    label: str
    kind: Literal["observation", "intervention", "attribution", "training"]
    description: str
    requires_artifact: bool
    supports_sweeps: bool
    implementation_state: Literal["declared", "available"] = "declared"


class TechniqueCatalog(BaseModel):
    techniques: tuple[TechniqueSummary, ...]


class ModelAccess(BaseModel):
    model_config = ConfigDict(frozen=True)

    state: AccessState
    gated: bool
    configured: bool
    message: str


class ModelSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    key: str
    display_name: str
    provider: str
    model_id: str
    revision: str
    license_name: str
    access: ModelAccess
    runtime_state: RuntimeState = "idle"
    techniques: tuple[TechniqueSummary, ...]
    default_layer: int
    max_layer: int
    recommended_steering_strength: float
    parameter_count: str


class ModelCatalog(BaseModel):
    models: tuple[ModelSummary, ...]
    default_model: str


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "mechanoscope-api"
    version: str
    environment: str
    catalog_state: Literal["ready"] = "ready"
    gpu_runtime_state: Literal["not_loaded"] = "not_loaded"
