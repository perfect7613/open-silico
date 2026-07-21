import sqlite3
from pathlib import Path
from typing import Protocol

from open_silico.experiment_contracts import ExperimentEnvelope


class ExperimentRepository(Protocol):
    def save(self, experiment: ExperimentEnvelope) -> None: ...

    def get(self, experiment_id: str) -> ExperimentEnvelope | None: ...

    def list(self, limit: int = 25) -> list[ExperimentEnvelope]: ...

    def delete(self, experiment_id: str) -> bool: ...


class InMemoryExperimentRepository:
    def __init__(self) -> None:
        self._experiments: dict[str, ExperimentEnvelope] = {}

    def save(self, experiment: ExperimentEnvelope) -> None:
        self._experiments[experiment.experiment_id] = experiment

    def get(self, experiment_id: str) -> ExperimentEnvelope | None:
        return self._experiments.get(experiment_id)

    def list(self, limit: int = 25) -> list[ExperimentEnvelope]:
        return sorted(
            self._experiments.values(),
            key=lambda experiment: experiment.finished_at,
            reverse=True,
        )[:limit]

    def delete(self, experiment_id: str) -> bool:
        return self._experiments.pop(experiment_id, None) is not None


class SqliteExperimentRepository:
    """Small durable record store; scientific execution remains outside this adapter."""

    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.execute("PRAGMA journal_mode=WAL")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS experiments (
                    experiment_id TEXT PRIMARY KEY,
                    finished_at TEXT NOT NULL,
                    payload TEXT NOT NULL
                )
                """
            )

    def save(self, experiment: ExperimentEnvelope) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR REPLACE INTO experiments (experiment_id, finished_at, payload)
                VALUES (?, ?, ?)
                """,
                (
                    experiment.experiment_id,
                    experiment.finished_at.isoformat(),
                    experiment.model_dump_json(),
                ),
            )

    def get(self, experiment_id: str) -> ExperimentEnvelope | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload FROM experiments WHERE experiment_id = ?",
                (experiment_id,),
            ).fetchone()
        return ExperimentEnvelope.model_validate_json(row[0]) if row else None

    def list(self, limit: int = 25) -> list[ExperimentEnvelope]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT payload FROM experiments ORDER BY finished_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [ExperimentEnvelope.model_validate_json(row[0]) for row in rows]

    def delete(self, experiment_id: str) -> bool:
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM experiments WHERE experiment_id = ?",
                (experiment_id,),
            )
        return cursor.rowcount > 0
