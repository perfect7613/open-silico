from datetime import UTC, datetime

from open_silico.experiment_contracts import ExperimentEnvelope
from open_silico.experiment_repository import SqliteExperimentRepository


def test_sqlite_repository_survives_a_new_adapter_instance(tmp_path) -> None:
    path = tmp_path / "experiments.sqlite3"
    repository = SqliteExperimentRepository(path)
    experiment = ExperimentEnvelope.model_validate(
        {
            "experiment_id": "experiment-1",
            "technique_id": "activation_steering",
            "started_at": datetime.now(UTC),
            "finished_at": datetime.now(UTC),
            "request": {
                "technique_id": "activation_steering",
                "input": {
                    "prompt": "Test.",
                    "positive_examples": ["cats"],
                    "negative_examples": ["dogs"],
                },
            },
            "result": {
                "model_key": "qwen3-1.7b",
                "prompt": "Test.",
                "baseline_message": "A",
                "steered_message": "B",
                "direction_norm": 1,
                "metadata": {
                    "model_id": "Qwen/Qwen3-1.7B",
                    "model_revision": "model-sha",
                    "layer": 18,
                    "strength": 1,
                    "seed": 16,
                    "max_new_tokens": 96,
                    "temperature": 0.7,
                    "top_p": 0.9,
                    "positive_count": 1,
                    "negative_count": 1,
                    "elapsed_ms": 20,
                },
            },
        }
    )
    repository.save(experiment)

    restored = SqliteExperimentRepository(path).get("experiment-1")

    assert restored == experiment

    assert SqliteExperimentRepository(path).delete("experiment-1") is True
    assert SqliteExperimentRepository(path).get("experiment-1") is None
