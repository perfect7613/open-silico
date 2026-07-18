from fastapi.testclient import TestClient
from open_silico.api import create_app
from open_silico.config import Settings


def client_for(*, hf_access_configured: bool = False) -> TestClient:
    settings = Settings(
        environment="test",
        cors_origins="http://testserver",
        hf_access_configured=hf_access_configured,
        _env_file=None,
    )
    return TestClient(create_app(settings))


def test_health_reports_catalog_without_loading_gpu() -> None:
    response = client_for().get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "open-silico-api",
        "version": "0.1.0",
        "environment": "test",
        "catalog_state": "ready",
        "gpu_runtime_state": "not_loaded",
    }


def test_catalog_falls_back_to_qwen_when_gemma_access_is_missing() -> None:
    response = client_for().get("/api/models")

    assert response.status_code == 200
    payload = response.json()
    assert payload["default_model"] == "qwen3-1.7b"
    assert [model["key"] for model in payload["models"]] == ["gemma-3-1b-it", "qwen3-1.7b"]
    gemma, qwen = payload["models"]
    assert gemma["access"]["state"] == "requires_access"
    assert gemma["access"]["configured"] is False
    assert qwen["access"]["state"] == "available"
    assert {technique["id"] for technique in qwen["techniques"]} == {
        "jacobian_lens",
        "activation_steering",
    }
    assert "token" not in str(payload).lower()


def test_catalog_prefers_gemma_after_server_access_is_configured() -> None:
    response = client_for(hf_access_configured=True).get("/api/models")

    payload = response.json()
    assert payload["default_model"] == "gemma-3-1b-it"
    assert payload["models"][0]["access"] == {
        "state": "available",
        "gated": True,
        "configured": True,
        "message": "Access configured. The GPU worker will load on the first experiment.",
    }
