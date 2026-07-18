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

Slice 1 is implemented: the API exposes a capability-aware, revision-pinned model catalog and the web workbench switches between Qwen3 1.7B and Gemma 3 1B Instruct without downloading weights locally. GPU techniques are tracked in [GitHub issues](https://github.com/perfect7613/open-silico/issues).

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

Run the checks with:

```bash
uv run pytest
uv run ruff check .
cd frontend && npm test && npm run lint && npm run build
```

The committed `.env.example` files contain only non-sensitive defaults. Put credentials in Modal Secrets for remote jobs; never add provider tokens to either browser or repository env files.

## License

Apache License 2.0. Third-party model weights, lens artifacts, and libraries retain their respective licenses.
