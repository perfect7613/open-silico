from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class JacobianLensRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str = Field(min_length=1, max_length=4000)
    model_key: Literal["qwen3-1.7b", "gemma-3-1b-it"] = "qwen3-1.7b"
    max_tokens: int = Field(default=64, ge=1, le=128)
    top_k: int = Field(default=10, ge=1, le=10)

    @field_validator("prompt")
    @classmethod
    def prompt_must_contain_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("prompt must contain non-whitespace text")
        return value


class InputToken(BaseModel):
    position: int
    token_id: int
    text: str


class TokenReadout(BaseModel):
    rank: int
    token_id: int
    text: str
    score: float | None = None


class PositionReadout(BaseModel):
    position: int
    predictions: list[TokenReadout]


class LayerReadout(BaseModel):
    layer: int
    kind: Literal["jacobian_lens", "model_output"]
    positions: list[PositionReadout]


class RankTrack(BaseModel):
    token_id: int
    text: str
    ranks: list[list[int]]


class JacobianLensMetadata(BaseModel):
    model_id: str
    model_revision: str
    lens_repo: str
    lens_revision: str
    lens_file: str
    jlens_revision: str
    max_tokens: int
    top_k: int
    source_layers: list[int]
    elapsed_ms: int
    vocab_size: int
    cache: Literal["modal_volume"] = "modal_volume"


class JacobianLensResponse(BaseModel):
    model_key: str
    prompt: str
    tokens: list[InputToken]
    rows: list[LayerReadout]
    rank_tracks: list[RankTrack] = Field(default_factory=list)
    metadata: JacobianLensMetadata


class PublicError(BaseModel):
    code: str
    message: str
    retryable: bool = False
