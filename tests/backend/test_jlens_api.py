from fastapi.testclient import TestClient
from open_silico.api import create_app
from open_silico.config import Settings
from open_silico.jlens_contracts import JacobianLensRequest, JacobianLensResponse
from open_silico.jlens_service import JacobianLensExecutionError, classify_modal_error


def fixture_response(request: JacobianLensRequest) -> JacobianLensResponse:
    return JacobianLensResponse.model_validate(
        {
            "model_key": request.model_key,
            "prompt": request.prompt,
            "tokens": [{"position": 0, "token_id": 42, "text": "Test"}],
            "rows": [
                {
                    "layer": 8,
                    "kind": "jacobian_lens",
                    "positions": [
                        {
                            "position": 0,
                            "predictions": [
                                {"rank": 1, "token_id": 7, "text": "test", "score": 3.5}
                            ],
                        }
                    ],
                },
                {
                    "layer": 31,
                    "kind": "model_output",
                    "positions": [
                        {
                            "position": 0,
                            "predictions": [
                                {"rank": 1, "token_id": 8, "text": "answer", "score": 5.0}
                            ],
                        }
                    ],
                },
            ],
            "metadata": {
                "model_id": "Qwen/Qwen3-1.7B",
                "model_revision": "model-sha",
                "lens_repo": "neuronpedia/jacobian-lens",
                "lens_revision": "lens-sha",
                "lens_file": "qwen/lens.pt",
                "jlens_revision": "code-sha",
                "max_tokens": request.max_tokens,
                "top_k": request.top_k,
                "source_layers": [8],
                "elapsed_ms": 12,
                "vocab_size": 100,
            },
        }
    )


class FixtureRunner:
    def run(self, request: JacobianLensRequest) -> JacobianLensResponse:
        return fixture_response(request)


class TimeoutRunner:
    def run(self, request: JacobianLensRequest) -> JacobianLensResponse:
        raise JacobianLensExecutionError(
            "cold_start_timeout",
            "The worker did not start.",
            retryable=True,
            status_code=504,
        )


def client_for(runner: FixtureRunner | TimeoutRunner) -> TestClient:
    settings = Settings(environment="test", _env_file=None)
    return TestClient(create_app(settings, jlens_runner=runner))


def test_jlens_tracer_bullet_preserves_final_output_row_and_revisions() -> None:
    response = client_for(FixtureRunner()).post(
        "/api/jlens/run",
        json={"prompt": "Test", "max_tokens": 32, "top_k": 3},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["model_key"] == "qwen3-1.7b"
    assert payload["rows"][-1]["kind"] == "model_output"
    assert payload["metadata"]["model_revision"] == "model-sha"
    assert payload["metadata"]["lens_revision"] == "lens-sha"


def test_jlens_rejects_unbounded_or_blank_inputs() -> None:
    client = client_for(FixtureRunner())

    assert client.post("/api/jlens/run", json={"prompt": "   "}).status_code == 422
    assert (
        client.post("/api/jlens/run", json={"prompt": "valid", "max_tokens": 129}).status_code
        == 422
    )


def test_jlens_returns_structured_retryable_timeout() -> None:
    response = client_for(TimeoutRunner()).post("/api/jlens/run", json={"prompt": "Count to five."})

    assert response.status_code == 504
    assert response.json()["detail"] == {
        "code": "cold_start_timeout",
        "message": "The worker did not start.",
        "retryable": True,
    }


def test_modal_failures_are_classified_without_leaking_remote_details() -> None:
    mismatch = classify_modal_error(RuntimeError("model/lens dimension mismatch: 10 != 12"))
    invalid_layers = classify_modal_error(ValueError("layers [99] out of range"))

    assert (mismatch.code, mismatch.status_code, mismatch.retryable) == (
        "model_lens_mismatch",
        503,
        False,
    )
    assert (invalid_layers.code, invalid_layers.status_code) == ("invalid_layers", 422)
    assert "10" not in str(mismatch)
