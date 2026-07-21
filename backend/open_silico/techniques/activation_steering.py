import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from open_silico.remote_runtime import RemoteModelRuntime
from open_silico.steering_contracts import (
    ActivationSteeringRequest,
    ActivationSteeringResponse,
)


class ActivationSteeringEngine:
    """Technique Module for contrast-vector construction and causal intervention."""

    def __init__(self, runtime: RemoteModelRuntime) -> None:
        self.runtime = runtime

    def run(self, request: ActivationSteeringRequest) -> ActivationSteeringResponse:
        import torch
        import transformers

        started = time.perf_counter()
        layers = self.runtime.decoder_layers()
        if request.layer >= len(layers):
            raise ValueError(
                f"layer {request.layer} out of range for model with {len(layers)} layers"
            )
        target_layer = layers[request.layer]

        def activation_for(text: str) -> Any:
            encoded = self.runtime.tokenizer(text, return_tensors="pt").to("cuda")
            captured: dict[str, Any] = {}

            def record(_module: Any, _inputs: Any, output: Any) -> None:
                hidden = self.runtime.hidden_from_output(output)
                captured["activation"] = hidden[0, -1].detach().float()

            handle = target_layer.register_forward_hook(record)
            try:
                with torch.inference_mode():
                    self.runtime.model(**encoded, use_cache=False)
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

        rendered = self.runtime.render_prompt(request.prompt)
        encoded_prompt = self.runtime.tokenizer(rendered, return_tensors="pt").to("cuda")
        prompt_length = encoded_prompt["input_ids"].shape[1]
        generation_settings: dict[str, Any] = {
            "max_new_tokens": request.max_new_tokens,
            "pad_token_id": (
                self.runtime.tokenizer.pad_token_id or self.runtime.tokenizer.eos_token_id
            ),
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
                output_ids = self.runtime.model.generate(
                    **encoded_prompt,
                    **generation_settings,
                )
            return self.runtime.tokenizer.decode(
                output_ids[0, prompt_length:],
                skip_special_tokens=True,
                clean_up_tokenization_spaces=False,
            ).strip()

        baseline_message = generate()

        @contextmanager
        def steering_hook() -> Iterator[None]:
            def add_direction(_module: Any, _inputs: Any, output: Any) -> Any:
                hidden = self.runtime.hidden_from_output(output)
                delta = direction.to(device=hidden.device, dtype=hidden.dtype)
                steered = hidden.clone()
                steered[:, -1, :] = steered[:, -1, :] + request.strength * delta
                return self.runtime.replace_hidden(output, steered)

            handle = target_layer.register_forward_hook(add_direction)
            try:
                yield
            finally:
                handle.remove()

        with steering_hook():
            steered_message = generate()

        return ActivationSteeringResponse.model_validate(
            {
                "model_key": request.model_key,
                "prompt": request.prompt,
                "baseline_message": baseline_message,
                "steered_message": steered_message,
                "direction_norm": direction_norm,
                "metadata": {
                    "model_id": self.runtime.spec.model_id,
                    "model_revision": self.runtime.spec.revision,
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
