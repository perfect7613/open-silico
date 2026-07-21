# Mechanoscope

Mechanoscope is an open-source laboratory for observing, intervening on, and debugging the internal representations of open-weight language models.

It combines a browser-based research interface, a typed FastAPI gateway, pluggable technique engines, and parameterized Modal GPU workers. Model weights and fitted artifacts stay on remote infrastructure; local development does not download model checkpoints.

## What works today

| Capability | Gemma 3 1B Instruct | Qwen3 1.7B |
| --- | --- | --- |
| Model switcher | Yes | Yes |
| Jacobian Lens | Yes | Yes |
| Contrastive activation steering | Yes | Yes |
| Remote Modal execution | Yes | Yes |
| Browser-local experiment history and JSON export | Yes | Yes |

### Linked Jacobian Lens

The J-Lens instrument is based on the interaction model in Anthropic's Jacobian Lens research interface. It provides:

- a layer-by-position argmax matrix;
- linked by-layer and by-position token readouts;
- token pinning with exact full-vocabulary ranks;
- a logarithmic rank heatmap;
- synchronized rank trajectories across layers and positions;
- a lazy-loaded React Three Fiber representation volume with synchronized 2D, 3D, and split views; and
- pinned model, lens, and implementation revisions for reproducibility.

J-Lens readouts are approximate learned transports into the final-layer basis. They should not be interpreted as literal model thoughts.

### Activation steering

The steering workbench derives a contrast direction from user-supplied examples:

```text
direction = mean(positive activations) - mean(negative activations)
```

It then runs baseline and steered generations with matched sampling settings and seed. The intervention is applied through a temporary residual-stream hook and removed in an exception-safe scope after every request. A behavioral change demonstrates causal influence at the selected layer; it does not prove that the direction has one monosemantic human interpretation.

## Architecture

```mermaid
flowchart LR
    UI[React research workbench] -->|HTTPS / JSON| API[FastAPI gateway]
    API --> E[Experiment gateway]
    E --> T[Technique registry]
    E -->|Modal adapter| R[Remote model runtime]
    T --> J[J-Lens engine]
    T --> S[Steering engine]
    J --> R
    S --> R
    R --> M[Version-pinned model]
    R --> V[(Artifact cache)]
```

- `frontend/` — React, TypeScript, Vite, React Three Fiber, and the technique-specific interfaces.
- `backend/open_silico/model_specs.py` — dependency-light, authoritative model facts used by local and GPU runtimes.
- `backend/open_silico/technique_registry.py` — authoritative capability metadata and the extension point for future techniques.
- `backend/open_silico/remote_runtime.py` — model loading, activation capture, intervention, and generation independent of Modal.
- `backend/open_silico/techniques/` — scientific technique engines behind typed contracts.
- `backend/modal_app.py` — the Modal deployment adapter and GPU image boundary.
- `tests/backend/` — fast contract and API tests.
- `tests/remote/` — opt-in tests against deployed GPU infrastructure.
- `docs/PRD.md` — MVP product requirements and longer-term roadmap.

## Models and artifacts

| Key | Checkpoint | Access |
| --- | --- | --- |
| `gemma-3-1b-it` | `google/gemma-3-1b-it` | Gated; requires accepting the Gemma license and supplying a Hugging Face token |
| `qwen3-1.7b` | `Qwen/Qwen3-1.7B` | Public, Apache-2.0 |

Every checkpoint, fitted Neuronpedia lens, and Anthropic Jacobian Lens dependency is pinned to an immutable revision in the source. See `backend/modal_app.py` and `backend/open_silico/model_specs.py` for the exact artifact identities.

## Local development

Prerequisites:

- Python 3.12 or newer;
- [`uv`](https://docs.astral.sh/uv/);
- Node.js 22 or newer; and
- a configured [Modal](https://modal.com/) account for real model execution.

Install dependencies and create local configuration:

```bash
uv sync
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cd frontend && npm ci
```

Start the local API from the repository root:

```bash
PYTHONPATH=backend uv run uvicorn open_silico.api:app --reload
```

Start the frontend in a second terminal:

```bash
cd frontend
npm run dev
```

Open `http://localhost:5173`. Local API documentation is available at `http://localhost:8000/docs`.

The local `.env` files are ignored by Git. Only non-sensitive examples are committed.

## Modal deployment

Gemma requires a Modal Secret containing `HF_TOKEN`. The default secret name is `huggingface-secret`; create it through the Modal dashboard or CLI after accepting the model license on Hugging Face.

Deploy the API and parameterized L40S worker:

```bash
MECHANOSCOPE_HF_SECRET_NAME=huggingface-secret \
  uv run modal deploy backend/modal_app.py
```

To use the deployed API from the local Vite application, configure `frontend/.env`:

```dotenv
VITE_API_BASE_URL=
VITE_API_PROXY_TARGET=https://your-workspace--mechanoscope-api.modal.run
```

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API and catalog status without waking a GPU |
| `GET` | `/api/models` | Model access and technique capability catalog |
| `GET` | `/api/techniques` | Platform technique metadata and execution capabilities |
| `POST` | `/api/experiments/run` | Run a typed technique request and return a replayable provenance envelope |
| `POST` | `/api/jlens/run` | Compute a bounded linked Jacobian Lens slice |
| `POST` | `/api/steer` | Run a matched baseline/steered generation experiment |

Interactive OpenAPI documentation is served at `/docs`.

## Verification

Run the local suite:

```bash
uv run ruff check backend tests
uv run ruff format --check backend tests
uv run pytest

cd frontend
npm test
npm run lint
npm run build
```

After deploying Modal, run the opt-in tests for both model/lens pairs and their strength-zero steering controls:

```bash
MECHANOSCOPE_RUN_MODAL_SMOKE=1 \
  uv run pytest tests/remote/test_modal_jlens.py
```

Remote tests consume GPU resources and are skipped by default.

## Isolated development with Crabbox and Daytona

The checked-in `.crabbox.yaml` defines four disposable verification jobs: `backend`, `frontend`, `contracts`, and `full`. Daytona hosts clean Linux sandboxes; Modal remains the GPU execution provider.

With a logged-in Daytona CLI, use the repository helper. It refreshes the active CLI profile and passes its short-lived credential only to the Crabbox subprocess:

```bash
scripts/crabbox-daytona doctor --provider daytona
scripts/crabbox-daytona job run backend
```

For non-interactive CI, set `DAYTONA_API_KEY` instead and run Crabbox directly.

Run `scripts/crabbox-daytona job run frontend` in another terminal for an independent frontend sandbox, or `scripts/crabbox-daytona job run full` for the complete gate. Leases auto-stop after the job and have a 20-minute idle timeout plus a 90-minute TTL.

Crabbox's Daytona adapter currently exposes terminal and file synchronization, but not a desktop session. WebVNC inspection therefore uses a separate desktop-capable provider. The no-cloud-cost option is Docker Desktop with Crabbox's `local-container` provider:

```bash
crabbox warmup --provider local-container --desktop --browser --code
crabbox list
crabbox webvnc --id <lease-id> --open
```

Docker is not currently installed on this machine, so this lane is configured but cannot be started yet. Hetzner or AWS can also supply a desktop lease, but would require their provider credentials and incur compute cost.

### Credentials

| Credential | Required for | Status |
| --- | --- | --- |
| Daytona CLI login or `DAYTONA_API_KEY` | Daytona sandbox create, inspect, and delete | CLI login is configured locally; API key is intended for CI |
| `DAYTONA_ORGANIZATION_ID` | Explicit Daytona organization selection | Optional; only for multi-organization accounts |
| Modal CLI authentication | Real model execution | Already configured locally |
| Modal Secret containing `HF_TOKEN` | Gated Gemma checkpoint | Configure the secret named by `MECHANOSCOPE_HF_SECRET_NAME` |
| `FIRECRAWL_API_KEY` | Optional automated documentation/research jobs | Optional; the local CLI is not authenticated yet |
| Docker Desktop | Local WebVNC desktop inspection | Required for the recommended no-cloud-cost WebVNC lane |

Never commit these values. Daytona credentials need sandbox write/delete permissions; secrets should be injected through provider secret stores or the local shell.

## Security and data handling

- Provider credentials belong in Modal Secrets, never browser code or repository files.
- Prompts are sent to the configured Modal deployment for inference.
- The current API does not implement persistent experiment storage.
- Request sizes and generation lengths are bounded at the API boundary.
- One model worker handles one stateful intervention at a time so temporary hooks cannot overlap.

## Roadmap

Phase 1 builds a trustworthy experiment loop through steering controls, multi-turn comparisons, evidence sweeps, reproducible local records, and compute safety. Phase 2 turns the two-model application into a capability-aware platform with authoritative model and technique registries, Hugging Face onboarding, runtime adapters, and artifact compatibility checks. The implementation sequence and exit criteria are documented in [`docs/PRD.md`](docs/PRD.md); tracked work remains in the repository's existing [GitHub Issues](https://github.com/perfect7613/open-silico/issues).

## License

Mechanoscope is licensed under the [Apache License 2.0](LICENSE). Model weights, fitted lenses, and third-party libraries retain their respective licenses and terms.
