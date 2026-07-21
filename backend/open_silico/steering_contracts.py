from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from open_silico.model_specs import validate_model_key


class ActivationSteeringRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_key: str = "qwen3-1.7b"
    prompt: str = Field(min_length=1, max_length=4000)
    positive_examples: list[str] = Field(min_length=1, max_length=8)
    negative_examples: list[str] = Field(min_length=1, max_length=8)
    layer: int = Field(default=18, ge=0, le=128)
    strength: float = Field(default=1.0, ge=-100, le=100)
    max_new_tokens: int = Field(default=96, ge=1, le=128)
    temperature: float = Field(default=0.7, ge=0, le=2)
    top_p: float = Field(default=0.9, gt=0, le=1)
    seed: int = Field(default=16, ge=0, le=2**31 - 1)

    _model_must_be_registered = field_validator("model_key")(validate_model_key)

    @field_validator("prompt")
    @classmethod
    def prompt_must_contain_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("prompt must contain non-whitespace text")
        return value

    @field_validator("positive_examples", "negative_examples")
    @classmethod
    def examples_must_contain_text(cls, values: list[str]) -> list[str]:
        if any(not value.strip() for value in values):
            raise ValueError("examples must contain non-whitespace text")
        return values


class ActivationSteeringMetadata(BaseModel):
    model_id: str
    model_revision: str
    layer: int
    strength: float
    seed: int
    max_new_tokens: int
    temperature: float
    top_p: float
    positive_count: int
    negative_count: int
    elapsed_ms: int
    cache: Literal["modal_volume"] = "modal_volume"


class ActivationSteeringResponse(BaseModel):
    model_key: str
    prompt: str
    baseline_message: str
    steered_message: str
    direction_norm: float
    metadata: ActivationSteeringMetadata
    warnings: list[str] = Field(default_factory=list)
