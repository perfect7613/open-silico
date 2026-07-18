import os
import time
from typing import Any

import modal
from open_silico.jlens_contracts import JacobianLensRequest, JacobianLensResponse

APP_NAME = "open-silico-jlens"
CACHE_PATH = "/cache"
MODEL_ID = "Qwen/Qwen3.5-4B"
MODEL_REVISION = "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a"
LENS_REPO = "neuronpedia/jacobian-lens"
LENS_REVISION = "16a01f309fcec900fdcec3f4cd5b64f3d00e4d5a"
LENS_FILE = "qwen3.5-4b/jlens/Salesforce-wikitext/Qwen3.5-4B_jacobian_lens_n1000.pt"
JLENS_REVISION = "581d398613e5602a5af361e1c34d3a92ea82ba8e"

app = modal.App(APP_NAME)
artifact_cache = modal.Volume.from_name("open-silico-artifacts", create_if_missing=True)

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


def _decode(tokenizer: Any, token_id: int) -> str:
    text = tokenizer.decode([token_id], clean_up_tokenization_spaces=False)
    return text.replace("\n", "↵").replace("\t", "⇥") or "∅"


@app.cls(
    image=gpu_image,
    gpu="L40S",
    volumes={CACHE_PATH: artifact_cache},
    timeout=600,
    scaledown_window=300,
)
@modal.concurrent(max_inputs=1)
class QwenJacobianLens:
    @modal.enter()
    def load(self) -> None:
        os.environ["HF_HOME"] = f"{CACHE_PATH}/huggingface"
        os.environ["HF_HUB_CACHE"] = f"{CACHE_PATH}/huggingface/hub"

        import jlens
        import torch
        import transformers

        self.torch = torch
        self.tokenizer = transformers.AutoTokenizer.from_pretrained(
            MODEL_ID,
            revision=MODEL_REVISION,
        )
        hf_model = transformers.AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            revision=MODEL_REVISION,
            dtype=torch.bfloat16,
        ).cuda()
        self.model = jlens.from_hf(hf_model, self.tokenizer)
        self.lens = jlens.JacobianLens.from_pretrained(
            LENS_REPO,
            filename=LENS_FILE,
            revision=LENS_REVISION,
        )
        if self.lens.d_model != self.model.d_model:
            raise ValueError(
                "model/lens dimension mismatch: "
                f"model={self.model.d_model}, lens={self.lens.d_model}"
            )
        artifact_cache.commit()

    @modal.method()
    def run(self, raw_request: dict[str, Any]) -> dict[str, Any]:
        request = JacobianLensRequest.model_validate(raw_request)
        started = time.perf_counter()
        available_layers = self.lens.source_layers
        if request.layers is None:
            stride = max(1, len(available_layers) // 8)
            layers = available_layers[::stride][:8]
        else:
            layers = request.layers

        lens_logits, model_logits, input_ids = self.lens.apply(
            self.model,
            request.prompt,
            layers=layers,
            max_seq_len=request.max_tokens,
        )
        ids = input_ids[0].detach().cpu().tolist()
        tokens = [
            {"position": position, "token_id": token_id, "text": _decode(self.tokenizer, token_id)}
            for position, token_id in enumerate(ids)
        ]

        def position_readouts(logits: Any) -> list[dict[str, Any]]:
            values, indices = self.torch.topk(logits, k=request.top_k, dim=-1)
            return [
                {
                    "position": position,
                    "predictions": [
                        {
                            "rank": rank + 1,
                            "token_id": int(token_id),
                            "text": _decode(self.tokenizer, int(token_id)),
                            "score": float(score),
                        }
                        for rank, (score, token_id) in enumerate(
                            zip(
                                values[position].tolist(),
                                indices[position].tolist(),
                                strict=True,
                            )
                        )
                    ],
                }
                for position in range(len(ids))
            ]

        rows = [
            {
                "layer": layer,
                "kind": "jacobian_lens",
                "positions": position_readouts(lens_logits[layer]),
            }
            for layer in layers
        ]
        rows.append(
            {
                "layer": self.model.n_layers - 1,
                "kind": "model_output",
                "positions": position_readouts(model_logits),
            }
        )
        response = JacobianLensResponse.model_validate(
            {
                "model_key": request.model_key,
                "prompt": request.prompt,
                "tokens": tokens,
                "rows": rows,
                "metadata": {
                    "model_id": MODEL_ID,
                    "model_revision": MODEL_REVISION,
                    "lens_repo": LENS_REPO,
                    "lens_revision": LENS_REVISION,
                    "lens_file": LENS_FILE,
                    "jlens_revision": JLENS_REVISION,
                    "max_tokens": request.max_tokens,
                    "top_k": request.top_k,
                    "source_layers": layers,
                    "elapsed_ms": round((time.perf_counter() - started) * 1000),
                },
            }
        )
        return response.model_dump()


api_image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install(
        "fastapi>=0.116,<1",
        "pydantic>=2.11,<3",
        "pydantic-settings>=2.10,<3",
    )
    .add_local_python_source("open_silico")
)


@app.function(image=api_image)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def api():
    from open_silico.api import create_app
    from open_silico.jlens_service import JacobianLensRunner, classify_modal_error

    class DeployedRunner(JacobianLensRunner):
        def run(self, request: JacobianLensRequest) -> JacobianLensResponse:
            try:
                payload = QwenJacobianLens().run.remote(request.model_dump())
                return JacobianLensResponse.model_validate(payload)
            except Exception as error:
                raise classify_modal_error(error) from error

    return create_app(jlens_runner=DeployedRunner())
