import time
from collections.abc import Callable
from typing import Any

from open_silico.jlens_contracts import JacobianLensRequest, JacobianLensResponse
from open_silico.remote_runtime import RemoteModelRuntime

LENS_REPO = "neuronpedia/jacobian-lens"
LENS_REVISION = "a4114d7752d11eb546e6cf372213d7e75526d3a1"
JLENS_REVISION = "581d398613e5602a5af361e1c34d3a92ea82ba8e"


class JacobianLensEngine:
    """Technique Module for loading a fitted lens and computing scientific readouts."""

    def __init__(
        self,
        runtime: RemoteModelRuntime,
        *,
        compute_slice: Callable[..., Any] | None = None,
    ) -> None:
        self.runtime = runtime
        self._compute_slice = compute_slice

    def load(self) -> "JacobianLensEngine":
        import jlens

        self.model = jlens.from_hf(self.runtime.model, self.runtime.tokenizer)
        self.lens = jlens.JacobianLens.from_pretrained(
            LENS_REPO,
            filename=self.runtime.spec.lens_file,
            revision=LENS_REVISION,
        )
        if self.lens.d_model != self.model.d_model:
            raise ValueError(
                "model/lens dimension mismatch: "
                f"model={self.model.d_model}, lens={self.lens.d_model}"
            )
        return self

    def run(self, request: JacobianLensRequest) -> JacobianLensResponse:
        started = time.perf_counter()
        if self._compute_slice is None:
            from jlens.vis import compute_slice
        else:
            compute_slice = self._compute_slice

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
            {
                "position": position,
                "token_id": token_id,
                "text": self.runtime.decode(token_id),
            }
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
                            "text": self.runtime.decode(int(token_id)),
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
                "text": self.runtime.decode(token_id),
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
        return JacobianLensResponse.model_validate(
            {
                "model_key": request.model_key,
                "prompt": request.prompt,
                "tokens": tokens,
                "rows": rows,
                "rank_tracks": rank_tracks,
                "metadata": {
                    "model_id": self.runtime.spec.model_id,
                    "model_revision": self.runtime.spec.revision,
                    "lens_repo": LENS_REPO,
                    "lens_revision": LENS_REVISION,
                    "lens_file": self.runtime.spec.lens_file,
                    "jlens_revision": JLENS_REVISION,
                    "max_tokens": request.max_tokens,
                    "top_k": request.top_k,
                    "source_layers": slice_data.layers,
                    "elapsed_ms": round((time.perf_counter() - started) * 1000),
                    "vocab_size": slice_data.vocab_size,
                },
            }
        )
