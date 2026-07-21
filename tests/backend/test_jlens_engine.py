from types import SimpleNamespace
from typing import Any

from open_silico.jlens_contracts import JacobianLensRequest
from open_silico.model_specs import get_model_spec
from open_silico.techniques.jacobian_lens import JacobianLensEngine


class Tensor:
    def __init__(self, values: Any) -> None:
        self.values = values

    def __getitem__(self, key: Any) -> Any:
        keys = key if isinstance(key, tuple) else (key,)
        value = self.values
        for part in keys:
            value = value[part]
        return Tensor(value) if isinstance(value, list) else value

    def tolist(self) -> list[Any]:
        return self.values


class FakeRuntime:
    spec = get_model_spec("qwen3-1.7b")

    @staticmethod
    def decode(token_id: int) -> str:
        return f"token-{token_id}"


def test_engine_serializes_a_slice_without_cloud_or_gpu_dependencies() -> None:
    slice_data = SimpleNamespace(
        context_token_ids=[10, 11],
        ctx_offset=0,
        top_ranks=Tensor([[[0], [1]], [[2], [3]]]),
        top_ids=Tensor([[[20], [21]], [[22], [23]]]),
        rank_tensor=Tensor([[[4], [5]], [[6], [7]]]),
        layers=[0, 1],
        seq_len=2,
        tracked_token_ids=[20],
        vocab_size=100,
    )

    def compute_slice(*_args: Any, **_kwargs: Any) -> Any:
        return slice_data

    engine = JacobianLensEngine(FakeRuntime(), compute_slice=compute_slice)  # type: ignore[arg-type]
    engine.model = SimpleNamespace(n_layers=2)
    engine.lens = SimpleNamespace(source_layers=[0, 1])

    response = engine.run(JacobianLensRequest(prompt="Test", max_tokens=2, top_k=1))

    assert [token.text for token in response.tokens] == ["token-10", "token-11"]
    assert response.rows[-1].kind == "model_output"
    assert response.rows[0].positions[0].predictions[0].rank == 1
    assert response.rank_tracks[0].ranks == [[5, 7], [6, 8]]
    assert response.metadata.model_revision == FakeRuntime.spec.revision
