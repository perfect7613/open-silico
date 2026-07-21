import os
import subprocess
import sys
from pathlib import Path


def test_gpu_contract_imports_do_not_require_api_settings_package() -> None:
    backend = Path(__file__).parents[2] / "backend"
    script = """
import importlib.abc
import sys

class BlockSettings(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path, target=None):
        if fullname == 'pydantic_settings':
            raise ModuleNotFoundError('blocked API-only settings package')
        return None

sys.meta_path.insert(0, BlockSettings())
import open_silico.jlens_contracts
import open_silico.remote_runtime
import open_silico.steering_contracts
"""
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(backend)

    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        check=False,
        env=environment,
        text=True,
    )

    assert result.returncode == 0, result.stderr
