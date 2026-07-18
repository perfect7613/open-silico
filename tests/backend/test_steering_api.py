from fastapi.testclient import TestClient
from open_silico.api import create_app
from open_silico.config import Settings
from open_silico.steering_contracts import (
    ActivationSteeringRequest,
    ActivationSteeringResponse,
)


class FixtureRunner:
    def run(self, request: ActivationSteeringRequest) -> ActivationSteeringResponse:
        baseline = "A measured answer."
        return ActivationSteeringResponse.model_validate(
            {
                "model_key": request.model_key,
                "prompt": request.prompt,
                "baseline_message": baseline,
                "steered_message": baseline if request.strength == 0 else "A feline answer.",
                "direction_norm": 12.5,
                "metadata": {
                    "model_id": "Qwen/Qwen3-1.7B",
                    "model_revision": "model-sha",
                    "layer": request.layer,
                    "strength": request.strength,
                    "seed": request.seed,
                    "max_new_tokens": request.max_new_tokens,
                    "temperature": request.temperature,
                    "top_p": request.top_p,
                    "positive_count": len(request.positive_examples),
                    "negative_count": len(request.negative_examples),
                    "elapsed_ms": 30,
                },
                "warnings": ["Interventions do not establish monosemanticity."],
            }
        )


def client_for() -> TestClient:
    settings = Settings(environment="test", _env_file=None)
    return TestClient(create_app(settings, steering_runner=FixtureRunner()))


def test_activation_steering_returns_matched_experiment_metadata() -> None:
    response = client_for().post(
        "/api/steer",
        json={
            "prompt": "Tell me about a companion.",
            "positive_examples": ["cats", "felines"],
            "negative_examples": ["dogs", "canines"],
            "layer": 18,
            "strength": 1.5,
            "seed": 16,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["baseline_message"] != payload["steered_message"]
    assert payload["direction_norm"] == 12.5
    assert payload["metadata"]["seed"] == 16
    assert payload["metadata"]["positive_count"] == 2
    assert payload["metadata"]["negative_count"] == 2


def test_strength_zero_is_exposed_as_a_control() -> None:
    response = client_for().post(
        "/api/steer",
        json={
            "prompt": "Control run.",
            "positive_examples": ["formal"],
            "negative_examples": ["casual"],
            "strength": 0,
        },
    )

    payload = response.json()
    assert payload["baseline_message"] == payload["steered_message"]
    assert payload["metadata"]["strength"] == 0


def test_activation_steering_rejects_blank_examples() -> None:
    response = client_for().post(
        "/api/steer",
        json={
            "prompt": "Test.",
            "positive_examples": [""],
            "negative_examples": ["nonempty"],
        },
    )

    assert response.status_code == 422
