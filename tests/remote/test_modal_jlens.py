import os

import pytest
from open_silico.jlens_contracts import JacobianLensRequest
from open_silico.jlens_service import ModalJacobianLensRunner
from open_silico.steering_contracts import ActivationSteeringRequest
from open_silico.steering_service import ModalActivationSteeringRunner

pytestmark = pytest.mark.remote


@pytest.mark.skipif(
    os.getenv("OPEN_SILICO_RUN_MODAL_SMOKE") != "1",
    reason="set OPEN_SILICO_RUN_MODAL_SMOKE=1 after deploying backend/modal_app.py",
)
@pytest.mark.parametrize(
    ("model_key", "model_revision"),
    [
        ("qwen3-1.7b", "70d244cc86ccca08cf5af4e1e306ecf908b1ad5e"),
        ("gemma-3-1b-it", "dcc83ea841ab6100d6b47a070329e1ba4cf78752"),
    ],
)
def test_deployed_jlens_returns_real_rows(model_key: str, model_revision: str) -> None:
    response = ModalJacobianLensRunner("open-silico-jlens").run(
        JacobianLensRequest(
            model_key=model_key,
            prompt="The opposite of hot is",
            max_tokens=16,
            top_k=3,
        )
    )

    assert response.tokens
    assert response.rows[-1].kind == "model_output"
    assert response.rank_tracks
    assert response.metadata.model_revision == model_revision
    assert response.metadata.lens_revision == "a4114d7752d11eb546e6cf372213d7e75526d3a1"


@pytest.mark.skipif(
    os.getenv("OPEN_SILICO_RUN_MODAL_SMOKE") != "1",
    reason="set OPEN_SILICO_RUN_MODAL_SMOKE=1 after deploying backend/modal_app.py",
)
@pytest.mark.parametrize("model_key", ["qwen3-1.7b", "gemma-3-1b-it"])
def test_deployed_strength_zero_is_a_matched_control(model_key: str) -> None:
    response = ModalActivationSteeringRunner("open-silico-jlens").run(
        ActivationSteeringRequest(
            model_key=model_key,
            prompt="Describe an ideal companion in one sentence.",
            positive_examples=["cats", "felines", "a calm house cat"],
            negative_examples=["dogs", "canines", "an energetic house dog"],
            layer=18,
            strength=0,
            max_new_tokens=24,
            temperature=0,
            seed=16,
        )
    )

    assert response.direction_norm > 0
    assert response.baseline_message
    assert response.baseline_message == response.steered_message
