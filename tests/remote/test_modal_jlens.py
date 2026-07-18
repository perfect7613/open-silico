import os

import pytest
from open_silico.jlens_contracts import JacobianLensRequest
from open_silico.jlens_service import ModalJacobianLensRunner

pytestmark = pytest.mark.remote


@pytest.mark.skipif(
    os.getenv("OPEN_SILICO_RUN_MODAL_SMOKE") != "1",
    reason="set OPEN_SILICO_RUN_MODAL_SMOKE=1 after deploying backend/modal_app.py",
)
def test_deployed_qwen_jlens_returns_real_rows() -> None:
    response = ModalJacobianLensRunner("open-silico-jlens").run(
        JacobianLensRequest(
            prompt="The opposite of hot is",
            max_tokens=16,
            top_k=3,
            layers=[8, 16, 24],
        )
    )

    assert response.tokens
    assert response.rows[-1].kind == "model_output"
    assert response.metadata.model_revision == "851bf6e806efd8d0a36b00ddf55e13ccb7b8cd0a"
    assert response.metadata.lens_revision == "16a01f309fcec900fdcec3f4cd5b64f3d00e4d5a"
