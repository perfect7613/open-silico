from fastapi.testclient import TestClient
from open_silico.api import create_app
from open_silico.config import Settings
from open_silico.jlens_contracts import JacobianLensRequest, JacobianLensResponse
from open_silico.steering_contracts import (
    ActivationSteeringRequest,
    ActivationSteeringResponse,
)


class JLFixtureRunner:
    def run(self, request: JacobianLensRequest) -> JacobianLensResponse:
        return JacobianLensResponse.model_validate(
            {
                "model_key": request.model_key,
                "prompt": request.prompt,
                "tokens": [],
                "rows": [],
                "metadata": {
                    "model_id": "Qwen/Qwen3-1.7B",
                    "model_revision": "model-sha",
                    "lens_repo": "neuronpedia/jacobian-lens",
                    "lens_revision": "lens-sha",
                    "lens_file": "qwen/lens.pt",
                    "jlens_revision": "code-sha",
                    "max_tokens": request.max_tokens,
                    "top_k": request.top_k,
                    "source_layers": [],
                    "elapsed_ms": 12,
                    "vocab_size": 100,
                },
            }
        )


class SteeringFixtureRunner:
    def run(self, request: ActivationSteeringRequest) -> ActivationSteeringResponse:
        return ActivationSteeringResponse.model_validate(
            {
                "model_key": request.model_key,
                "prompt": request.prompt,
                "baseline_message": "baseline",
                "steered_message": "steered",
                "direction_norm": 1.0,
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
                    "elapsed_ms": 20,
                },
            }
        )


def client() -> TestClient:
    return TestClient(
        create_app(
            Settings(environment="test", _env_file=None),
            jlens_runner=JLFixtureRunner(),
            steering_runner=SteeringFixtureRunner(),
        )
    )


def test_generic_experiment_route_dispatches_and_adds_provenance() -> None:
    response = client().post(
        "/api/experiments/run",
        json={
            "technique_id": "activation_steering",
            "input": {
                "prompt": "Tell me about a companion.",
                "positive_examples": ["cats"],
                "negative_examples": ["dogs"],
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == 1
    assert payload["technique_id"] == "activation_steering"
    assert payload["status"] == "complete"
    assert payload["experiment_id"]
    assert payload["started_at"] <= payload["finished_at"]
    assert payload["result"]["steered_message"] == "steered"


def test_generic_experiment_route_rejects_unknown_technique() -> None:
    response = client().post(
        "/api/experiments/run",
        json={"technique_id": "unknown", "input": {"prompt": "Test"}},
    )

    assert response.status_code == 422


def test_experiment_can_be_fetched_replayed_and_forked_with_lineage() -> None:
    active_client = client()
    original_response = active_client.post(
        "/api/experiments/run",
        json={
            "technique_id": "activation_steering",
            "input": {
                "prompt": "Tell me about a companion.",
                "positive_examples": ["cats"],
                "negative_examples": ["dogs"],
                "strength": 1,
            },
        },
    )
    original = original_response.json()

    fetched = active_client.get(f"/api/experiments/{original['experiment_id']}")
    listed = active_client.get("/api/experiments")
    replayed = active_client.post(f"/api/experiments/{original['experiment_id']}/replay")
    forked = active_client.post(
        f"/api/experiments/{original['experiment_id']}/fork",
        json={
            "request": {
                "technique_id": "activation_steering",
                "input": {
                    **original["request"]["input"],
                    "strength": 2,
                },
            }
        },
    )

    assert fetched.status_code == 200
    assert listed.json()["experiments"][0]["experiment_id"] == original["experiment_id"]
    assert replayed.json()["parent_experiment_id"] == original["experiment_id"]
    assert replayed.json()["lineage_operation"] == "replay"
    assert forked.json()["request"]["input"]["strength"] == 2
    assert forked.json()["parent_experiment_id"] == original["experiment_id"]
    assert forked.json()["lineage_operation"] == "fork"


def test_fork_cannot_silently_change_technique() -> None:
    active_client = client()
    original = active_client.post(
        "/api/experiments/run",
        json={
            "technique_id": "jacobian_lens",
            "input": {"prompt": "Count to five."},
        },
    ).json()

    response = active_client.post(
        f"/api/experiments/{original['experiment_id']}/fork",
        json={
            "request": {
                "technique_id": "activation_steering",
                "input": {
                    "prompt": "Count to five.",
                    "positive_examples": ["cats"],
                    "negative_examples": ["dogs"],
                },
            }
        },
    )

    assert response.status_code == 409


def test_saved_experiment_can_be_deleted_explicitly() -> None:
    active_client = client()
    experiment = active_client.post(
        "/api/experiments/run",
        json={
            "technique_id": "jacobian_lens",
            "input": {"prompt": "Delete this receipt."},
        },
    ).json()

    response = active_client.delete(f"/api/experiments/{experiment['experiment_id']}")

    assert response.status_code == 204
    assert active_client.get(f"/api/experiments/{experiment['experiment_id']}").status_code == 404
