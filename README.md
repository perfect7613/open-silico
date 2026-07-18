# Open Silico

An open-source interpretability workbench for observing and intervening on the internal representations of open-weight language models.

The first milestone provides:

- A model switcher for Gemma 3 1B Instruct and Qwen3 1.7B.
- Contrastive activation steering with synchronized default and steered conversations.
- Interactive Jacobian Lens inspection across layers and token positions.
- Remote GPU execution on Modal, with no model weights downloaded to the developer machine.
- Reproducible experiment metadata including model revision, lens revision, seed, and technique settings.

See [PLAN.md](PLAN.md) for the time-boxed implementation plan and [docs/PRD.md](docs/PRD.md) for the product requirements.

## Status

Slices 1 and 2 are implemented: the workbench switches between Gemma and Qwen, and the Qwen3.5 4B path runs a real, pre-fitted Jacobian Lens on Modal without downloading weights locally. Activation steering and model-parity work are tracked in [GitHub issues](https://github.com/perfect7613/open-silico/issues).

## Local development

Prerequisites: Python 3.12+, [`uv`](https://docs.astral.sh/uv/), and Node.js 22+.

```bash
uv sync
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
PYTHONPATH=backend uv run uvicorn open_silico.api:app --reload
```

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The API is available at `http://localhost:8000`, with interactive OpenAPI documentation at `/docs`.

## Modal deployment

The Jacobian Lens worker uses an L40S GPU and a persistent `open-silico-artifacts` volume. The image pins the Qwen model, pre-fitted lens, and Anthropic implementation by commit. Deploy it with:

```bash
PYTHONPATH=backend uv run modal deploy backend/modal_app.py
```

For same-origin local development, proxy API requests to the returned HTTPS endpoint in `frontend/.env`:

```bash
VITE_API_BASE_URL=
VITE_API_PROXY_TARGET=https://your-workspace--open-silico-jlens-api.modal.run
```

To run the real GPU smoke test after deployment:

```bash
OPEN_SILICO_RUN_MODAL_SMOKE=1 uv run pytest tests/remote/test_modal_jlens.py
```

Run the checks with:

```bash
uv run pytest
uv run ruff check .
cd frontend && npm test && npm run lint && npm run build
```

The committed `.env.example` files contain only non-sensitive defaults. Put credentials in Modal Secrets for remote jobs; never add provider tokens to either browser or repository env files.

## License

Apache License 2.0. Third-party model weights, lens artifacts, and libraries retain their respective licenses.
