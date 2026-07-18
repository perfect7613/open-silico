from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration safe to consume outside the GPU worker."""

    model_config = SettingsConfigDict(
        env_file=("backend/.env", ".env"),
        env_prefix="OPEN_SILICO_",
        extra="ignore",
    )

    environment: str = "development"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    hf_access_configured: bool = False
    hf_secret_name: str = "huggingface-secret"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
