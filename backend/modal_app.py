import os
import time
from contextlib import contextmanager
from typing import Any

import modal
from open_silico.jlens_contracts import JacobianLensRequest, JacobianLensResponse
from open_silico.steering_contracts import (
    ActivationSteeringRequest,
    ActivationSteeringResponse,
)

APP_NAME = "open-silico-jlens"
CACHE_PATH = "/cache"
LENS_REPO = "neuronpedia/jacobian-lens"
LENS_REVISION = "a4114d7752d11eb546e6cf372213d7e75526d3a1"
JLENS_REVISION = "581d398613e5602a5af361e1c34d3a92ea82ba8e"
HF_SECRET_NAME = os.getenv("OPEN_SILICO_HF_SECRET_NAME", "huggingface-secret")

MODEL_SPECS = {
    "qwen3-1.7b": {
        "model_id": "Qwen/Qwen3-1.7B",
        "model_revision": "70d244cc86ccca08cf5af4e1e306ecf908b1ad5e",
        "lens_file": "qwen3-1.7b/jlens/Salesforce-wikitext/Qwen3-1.7B_jacobian_lens.pt",
    },
    "gemma-3-1b-it": {
        "model_id": "google/gemma-3-1b-it",
        "model_revision": "dcc83ea841ab6100d6b47a070329e1ba4cf78752",
        "lens_file": "gemma-3-1b-it/jlens/Salesforce-wikitext/gemma-3-1b-it_jacobian_lens.pt",
    },
}

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


def _decoder_layers(model: Any) -> Any:
    core = getattr(model, "model", None)
    layers = getattr(core, "layers", None)
    if layers is None:
        language_model = getattr(core, "language_model", None)
        layers = getattr(language_model, "layers", None)
    if layers is None:
        raise ValueError("model adapter could not find decoder layers")
    return layers


def _hidden_from_output(output: Any) -> Any:
    return output[0] if isinstance(output, tuple) else output


def _replace_hidden(output: Any, hidden: Any) -> Any:
    if isinstance(output, tuple):
        return (hidden, *output[1:])
    return hidden


@app.cls(
    image=gpu_image,
    gpu="L40S",
    volumes={CACHE_PATH: artifact_cache},
    secrets=[modal.Secret.from_name(HF_SECRET_NAME)],
    timeout=600,
    scaledown_window=300,
)
@modal.concurrent(max_inputs=1)
class OpenSilicoModel:
    model_key: str = modal.parameter(default="qwen3-1.7b")

    @modal.enter()
    def load(self) -> None:
        os.environ["HF_HOME"] = f"{CACHE_PATH}/huggingface"
        os.environ["HF_HUB_CACHE"] = f"{CACHE_PATH}/huggingface/hub"

        import jlens
        import torch
        import transformers

        if self.model_key not in MODEL_SPECS:
            raise ValueError(f"unsupported model key: {self.model_key}")
        self.spec = MODEL_SPECS[self.model_key]
        self.tokenizer = transformers.AutoTokenizer.from_pretrained(
            self.spec["model_id"],
            revision=self.spec["model_revision"],
        )
        hf_model = transformers.AutoModelForCausalLM.from_pretrained(
            self.spec["model_id"],
            revision=self.spec["model_revision"],
            dtype=torch.bfloat16,
        ).cuda()
        hf_model.eval()
        self.hf_model = hf_model
        self.model = jlens.from_hf(hf_model, self.tokenizer)
        self.lens = jlens.JacobianLens.from_pretrained(
            LENS_REPO,
            filename=self.spec["lens_file"],
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
        from jlens.vis import compute_slice

        layer_stride = max(1, len(self.lens.source_layers) // 10)
        slice_data = compute_slice(
            self.model,
            self.lens,
            request.prompt,
            top_n=request.top_k,
            max_tracked=128,
            layer_stride=layer_stride,
            last_n_tokens=request.max_tokens,
            max_seq_len=request.max_tokens,
            mask_display=True,
        )
        ids = slice_data.context_token_ids[slice_data.ctx_offset :]
        tokens = [
            {"position": position, "token_id": token_id, "text": _decode(self.tokenizer, token_id)}
            for position, token_id in enumerate(ids)
        ]

        def position_readouts(layer_index: int) -> list[dict[str, Any]]:
            return [
                {
                    "position": position,
                    "predictions": [
                        {
                            "rank": int(slice_data.top_ranks[position, layer_index, rank]) + 1,
                            "token_id": int(token_id),
                            "text": _decode(self.tokenizer, int(token_id)),
                        }
                        for rank, token_id in enumerate(
                            slice_data.top_ids[position, layer_index].tolist()
                        )
                    ],
                }
                for position in range(len(ids))
            ]

        rows = [
            {
                "layer": layer,
                "kind": "model_output" if layer == self.model.n_layers - 1 else "jacobian_lens",
                "positions": position_readouts(layer_index),
            }
            for layer_index, layer in enumerate(slice_data.layers)
        ]
        rank_tracks = [
            {
                "token_id": token_id,
                "text": _decode(self.tokenizer, token_id),
                "ranks": [
                    [
                        int(slice_data.rank_tensor[position, layer_index, track_index]) + 1
                        for position in range(slice_data.seq_len)
                    ]
                    for layer_index in range(len(slice_data.layers))
                ],
            }
            for track_index, token_id in enumerate(slice_data.tracked_token_ids)
        ]
        response = JacobianLensResponse.model_validate(
            {
                "model_key": request.model_key,
                "prompt": request.prompt,
                "tokens": tokens,
                "rows": rows,
                "rank_tracks": rank_tracks,
                "metadata": {
                    "model_id": self.spec["model_id"],
                    "model_revision": self.spec["model_revision"],
                    "lens_repo": LENS_REPO,
                    "lens_revision": LENS_REVISION,
                    "lens_file": self.spec["lens_file"],
                    "jlens_revision": JLENS_REVISION,
                    "max_tokens": request.max_tokens,
                    "top_k": request.top_k,
                    "source_layers": slice_data.layers,
                    "elapsed_ms": round((time.perf_counter() - started) * 1000),
                    "vocab_size": slice_data.vocab_size,
                },
            }
        )
        return response.model_dump()

    @modal.method()
    def steer(self, raw_request: dict[str, Any]) -> dict[str, Any]:
        request = ActivationSteeringRequest.model_validate(raw_request)
        started = time.perf_counter()

        import torch
        import transformers

        layers = _decoder_layers(self.hf_model)
        if request.layer >= len(layers):
            raise ValueError(
                f"layer {request.layer} out of range for model with {len(layers)} layers"
            )
        target_layer = layers[request.layer]

        def activation_for(text: str) -> Any:
            encoded = self.tokenizer(text, return_tensors="pt").to("cuda")
            captured: dict[str, Any] = {}

            def record(_module: Any, _inputs: Any, output: Any) -> None:
                captured["activation"] = _hidden_from_output(output)[0, -1].detach().float()

            handle = target_layer.register_forward_hook(record)
            try:
                with torch.inference_mode():
                    self.hf_model(**encoded, use_cache=False)
            finally:
                handle.remove()
            return captured["activation"]

        positive = torch.stack(
            [activation_for(example) for example in request.positive_examples]
        ).mean(dim=0)
        negative = torch.stack(
            [activation_for(example) for example in request.negative_examples]
        ).mean(dim=0)
        direction = positive - negative
        direction_norm = float(direction.norm().item())

        messages = [{"role": "user", "content": request.prompt}]
        if self.tokenizer.chat_template:
            template_options: dict[str, Any] = {}
            if self.model_key == "qwen3-1.7b":
                template_options["enable_thinking"] = False
            rendered = self.tokenizer.apply_chat_template(
                messages,
                tokenize=False,
                add_generation_prompt=True,
                **template_options,
            )
        else:
            rendered = request.prompt
        encoded_prompt = self.tokenizer(rendered, return_tensors="pt").to("cuda")
        prompt_length = encoded_prompt["input_ids"].shape[1]

        generation_settings: dict[str, Any] = {
            "max_new_tokens": request.max_new_tokens,
            "pad_token_id": self.tokenizer.pad_token_id or self.tokenizer.eos_token_id,
        }
        if request.temperature > 0:
            generation_settings.update(
                do_sample=True,
                temperature=request.temperature,
                top_p=request.top_p,
            )
        else:
            generation_settings["do_sample"] = False

        def generate() -> str:
            transformers.set_seed(request.seed)
            with torch.inference_mode():
                output_ids = self.hf_model.generate(**encoded_prompt, **generation_settings)
            return self.tokenizer.decode(
                output_ids[0, prompt_length:],
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            ).strip()

        baseline_message = generate()

        @contextmanager
        def steering_hook():
            def add_direction(_module: Any, _inputs: Any, output: Any) -> Any:
                hidden = _hidden_from_output(output)
                delta = direction.to(device=hidden.device, dtype=hidden.dtype)
                steered = hidden + request.strength * delta.view(1, 1, -1)
                return _replace_hidden(output, steered)

            handle = target_layer.register_forward_hook(add_direction)
            try:
                yield
            finally:
                handle.remove()

        with steering_hook():
            steered_message = generate()

        response = ActivationSteeringResponse.model_validate(
            {
                "model_key": request.model_key,
                "prompt": request.prompt,
                "baseline_message": baseline_message,
                "steered_message": steered_message,
                "direction_norm": direction_norm,
                "metadata": {
                    "model_id": self.spec["model_id"],
                    "model_revision": self.spec["model_revision"],
                    "layer": request.layer,
                    "strength": request.strength,
                    "seed": request.seed,
                    "max_new_tokens": request.max_new_tokens,
                    "temperature": request.temperature,
                    "top_p": request.top_p,
                    "positive_count": len(request.positive_examples),
                    "negative_count": len(request.negative_examples),
                    "elapsed_ms": round((time.perf_counter() - started) * 1000),
                },
                "warnings": [
                    "A behavioral change is evidence of a causal intervention, not proof that "
                    "the direction has one clean human meaning."
                ],
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
    from open_silico.config import Settings
    from open_silico.jlens_service import JacobianLensRunner, classify_modal_error
    from open_silico.steering_contracts import (
        ActivationSteeringRequest,
        ActivationSteeringResponse,
    )
    from open_silico.steering_service import ActivationSteeringRunner

    class DeployedRunner(JacobianLensRunner):
        def run(self, request: JacobianLensRequest) -> JacobianLensResponse:
            try:
                payload = OpenSilicoModel(model_key=request.model_key).run.remote(
                    request.model_dump()
                )
                return JacobianLensResponse.model_validate(payload)
            except Exception as error:
                raise classify_modal_error(error) from error

    class DeployedSteeringRunner(ActivationSteeringRunner):
        def run(self, request: ActivationSteeringRequest) -> ActivationSteeringResponse:
            try:
                payload = OpenSilicoModel(model_key=request.model_key).steer.remote(
                    request.model_dump()
                )
                return ActivationSteeringResponse.model_validate(payload)
            except Exception as error:
                raise classify_modal_error(error) from error

    return create_app(
        Settings(
            environment="modal",
            hf_access_configured=True,
            _env_file=None,
        ),
        jlens_runner=DeployedRunner(),
        steering_runner=DeployedSteeringRunner(),
    )
