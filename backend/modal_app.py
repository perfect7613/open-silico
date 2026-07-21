import os
import subprocess
from typing import Any

import modal
from open_silico.jlens_contracts import JacobianLensRequest, JacobianLensResponse
from open_silico.remote_runtime import RemoteModelRuntime
from open_silico.steering_contracts import (
    ActivationSteeringRequest,
    ActivationSteeringResponse,
)
from open_silico.techniques.activation_steering import ActivationSteeringEngine
from open_silico.techniques.jacobian_lens import JLENS_REVISION, JacobianLensEngine

APP_NAME = "mechanoscope"
CACHE_PATH = "/cache"
DATA_PATH = "/data"
HF_SECRET_NAME = os.getenv("MECHANOSCOPE_HF_SECRET_NAME", "").strip()
DEPLOYED_API_URL = os.getenv(
    "MECHANOSCOPE_DEPLOYED_API_URL",
    "https://ameymuke252003--mechanoscope-api.modal.run",
)

app = modal.App(APP_NAME)
artifact_cache = modal.Volume.from_name("open-silico-artifacts", create_if_missing=True)
experiment_store = modal.Volume.from_name("mechanoscope-experiments", create_if_missing=True)
hf_secrets = [modal.Secret.from_name(HF_SECRET_NAME)] if HF_SECRET_NAME else []

gpu_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git")
    .uv_pip_install(
        "torch>=2.9,<3",
        "transformers>=5.5,<6",
        "huggingface-hub>=1.4,<2",
        "pydantic>=2.11,<3",
        f"git+https://github.com/anthropics/jacobian-lens.git@{JLENS_REVISION}",
    )
    .add_local_python_source("open_silico")
)


@app.cls(
    image=gpu_image,
    gpu="L40S",
    volumes={CACHE_PATH: artifact_cache},
    secrets=hf_secrets,
    timeout=600,
    scaledown_window=300,
)
@modal.concurrent(max_inputs=1)
class ModelSubjectWorker:
    """Modal lifecycle Adapter around the Runtime and scientific Technique Engines."""

    model_key: str = modal.parameter(default="qwen3-1.7b")

    @modal.enter()
    def load(self) -> None:
        self.runtime = RemoteModelRuntime(self.model_key, CACHE_PATH).load()
        self.jlens_engine = JacobianLensEngine(self.runtime).load()
        self.steering_engine = ActivationSteeringEngine(self.runtime)
        artifact_cache.commit()

    @modal.method()
    def run(self, raw_request: dict[str, Any]) -> dict[str, Any]:
        request = JacobianLensRequest.model_validate(raw_request)
        return self.jlens_engine.run(request).model_dump()

    @modal.method()
    def steer(self, raw_request: dict[str, Any]) -> dict[str, Any]:
        request = ActivationSteeringRequest.model_validate(raw_request)
        return self.steering_engine.run(request).model_dump()


api_image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install(
        "fastapi>=0.116,<1",
        "pydantic>=2.11,<3",
        "pydantic-settings>=2.10,<3",
    )
    .add_local_python_source("open_silico")
    .add_local_dir("frontend/dist", remote_path="/assets")
)

mcp_image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("nodejs", "npm")
    .uv_pip_install("pydantic>=2.11,<3")
    .add_local_python_source("open_silico", copy=True)
    .add_local_dir(
        "mcp-server",
        remote_path="/mcp",
        copy=True,
        ignore=["node_modules", "dist"],
    )
    .run_commands(
        "cd /mcp && npm ci && npm run build && npm prune --omit=dev",
    )
)


@app.function(
    image=api_image,
    volumes={DATA_PATH: experiment_store},
    env={"MECHANOSCOPE_HF_ACCESS_CONFIGURED": str(bool(HF_SECRET_NAME)).lower()},
    max_containers=1,
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def api():
    from open_silico.api import create_app
    from open_silico.config import Settings
    from open_silico.experiment_repository import SqliteExperimentRepository
    from open_silico.jlens_service import JacobianLensRunner, classify_modal_error
    from open_silico.steering_service import ActivationSteeringRunner

    class DeployedRunner(JacobianLensRunner):
        def run(self, request: JacobianLensRequest) -> JacobianLensResponse:
            try:
                payload = ModelSubjectWorker(model_key=request.model_key).run.remote(
                    request.model_dump()
                )
                return JacobianLensResponse.model_validate(payload)
            except Exception as error:
                raise classify_modal_error(error) from error

    class DeployedSteeringRunner(ActivationSteeringRunner):
        def run(self, request: ActivationSteeringRequest) -> ActivationSteeringResponse:
            try:
                payload = ModelSubjectWorker(model_key=request.model_key).steer.remote(
                    request.model_dump()
                )
                return ActivationSteeringResponse.model_validate(payload)
            except Exception as error:
                raise classify_modal_error(error) from error

    return create_app(
        Settings(
            environment="modal",
            hf_access_configured=(
                os.getenv("MECHANOSCOPE_HF_ACCESS_CONFIGURED", "false") == "true"
            ),
            experiment_db_path=f"{DATA_PATH}/experiments.sqlite3",
            _env_file=None,
        ),
        jlens_runner=DeployedRunner(),
        steering_runner=DeployedSteeringRunner(),
        experiment_repository=SqliteExperimentRepository(
            f"{DATA_PATH}/experiments.sqlite3",
            on_write=experiment_store.commit,
        ),
        static_dir="/assets",
    )


@app.function(
    image=mcp_image,
    env={
        "MECHANOSCOPE_API_URL": DEPLOYED_API_URL,
        "MECHANOSCOPE_APP_URL": DEPLOYED_API_URL,
        "PORT": "8787",
    },
    max_containers=1,
    scaledown_window=300,
)
@modal.web_server(port=8787, startup_timeout=30)
def mcp():
    """Public Apps SDK Adapter; scientific execution stays behind the API Seam."""
    subprocess.Popen(["node", "/mcp/dist/server.js"])
