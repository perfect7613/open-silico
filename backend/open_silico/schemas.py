from typing import Literal

from pydantic import BaseModel, ConfigDict

TechniqueId = Literal["jacobian_lens", "activation_steering"]
AccessState = Literal["available", "requires_access", "unavailable"]
RuntimeState = Literal["idle", "loading", "ready", "error"]


class TechniqueSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: TechniqueId
    label: str
    implementation_state: Literal["declared", "available"] = "declared"


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
    parameter_count: str


class ModelCatalog(BaseModel):
    models: tuple[ModelSummary, ...]
    default_model: str


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: str = "open-silico-api"
    version: str
    environment: str
    catalog_state: Literal["ready"] = "ready"
    gpu_runtime_state: Literal["not_loaded"] = "not_loaded"
