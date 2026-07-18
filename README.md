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

The current vertical slice runs both techniques on pinned Gemma 3 1B Instruct and Qwen3 1.7B checkpoints:

- The linked J-Lens console shows the argmax layer × position matrix, layer and position token readouts, exact full-vocabulary rank heatmap, and synchronized rank trajectories.
- The steering bench derives a real positive-minus-negative residual direction, runs matched baseline and steered generations, and removes its intervention hook after every request.
- Both model/lens pairs and strength-zero steering controls have passed opt-in tests against the deployed Modal GPU runtime.

Multi-turn histories, saved experiments, preset expansion, and user-supplied model adapters remain tracked in [GitHub issues](https://github.com/perfect7613/open-silico/issues).

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

The shared J-Lens and steering worker uses an L40S GPU and a persistent `open-silico-artifacts` volume. The image pins both models, their pre-fitted lenses, and the Anthropic implementation by commit.

Gemma is gated. Accept its terms on Hugging Face, then create a Modal Secret containing `HF_TOKEN` (the default secret name is `huggingface-secret`). Deploy with:

```bash
OPEN_SILICO_HF_SECRET_NAME=huggingface-secret uv run modal deploy backend/modal_app.py
```

For same-origin local development, proxy API requests to the returned HTTPS endpoint in `frontend/.env`:

```bash
VITE_API_BASE_URL=
VITE_API_PROXY_TARGET=https://your-workspace--open-silico-jlens-api.modal.run
```

To run the real Qwen J-Lens and strength-zero steering smoke tests after deployment:

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
