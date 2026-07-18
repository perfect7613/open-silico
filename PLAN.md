# Open Silico — two-hour MVP plan

Date: 2026-07-18

## Product thesis

Open Silico is an open-source workbench for running reproducible interpretability experiments on open-weight models. A researcher chooses a model, a technique, and a prompt; the platform runs the model on remote GPUs and returns both the behavioral result and a visual account of the internal representations used by that technique.

The product should feel like a model laboratory, not just a chat UI:

1. **Observe** — inspect internal representations at layers and token positions.
2. **Intervene** — change a representation and compare behavior against a controlled baseline.
3. **Reproduce** — retain the exact model revision, technique settings, seed, and runtime metadata for every result.

This mirrors the public Silico framing—predict, check model health, debug, improve, and generalize—but the first release deliberately focuses on language-model experiments that can be made genuinely useful in two hours.

## What the public product research shows

- [Goodfire Silico](https://www.goodfire.ai/silico) is positioned as a model-design environment combining frontier interpretability methods, a model-scientist agent, and infrastructure. Its public workflow emphasizes explaining individual predictions, diagnosing learned pathologies, debugging failures, and intervening on model internals.
- Goodfire's earlier [Llama 3 steering research](https://www.goodfire.ai/research/understanding-and-steering-llama-3) demonstrates the key interaction pattern we should borrow: surface internal candidates, let the user intervene, and immediately compare changed model behavior. Its SAE-specific preview is now deprecated, so we should not clone its old API.
- [Neuronpedia](https://www.neuronpedia.org/) supplies the strongest open UX reference. Its steering screen uses a control rail beside synchronized **Default** and **Steered** chat panes, with one shared composer, presets, vector/feature controls, sampling controls, reset, and sharing.
- Anthropic's [Jacobian Lens repository](https://github.com/anthropics/jacobian-lens) is an Apache-2.0 reference implementation. It reads a residual-stream activation by transporting it through an average Jacobian into the final-layer basis and decoding it through the model's unembedding. It is explicitly a reference implementation, not a maintained production SDK.
- The accompanying [global-workspace paper](https://transformer-circuits.pub/2026/workspace/index.html) specifies a richer linked J-Lens interface than a standalone heatmap: a prompt transcript; a layer × position argmax table; a pinned-token rank heatmap; complete readouts across layers at one position and across positions at one layer; and linked rank-trajectory charts. The paper explicitly warns that early-layer readouts are often noisy.

## MVP decision

Ship a real model switcher with two models that support both techniques:

| Model key | Model | Revision | Access | Pre-fitted lens file |
| --- | --- | --- | --- | --- |
| `gemma-3-1b-it` | [`google/gemma-3-1b-it`](https://huggingface.co/google/gemma-3-1b-it) | `dcc83ea841ab6100d6b47a070329e1ba4cf78752` | Preferred; gated Gemma license and server-side HF token required | `gemma-3-1b-it/jlens/Salesforce-wikitext/gemma-3-1b-it_jacobian_lens.pt` |
| `qwen3-1.7b` | [`Qwen/Qwen3-1.7B`](https://huggingface.co/Qwen/Qwen3-1.7B) | `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e` | Public, ungated, Apache-2.0 fallback | `qwen3-1.7b/jlens/Salesforce-wikitext/Qwen3-1.7B_jacobian_lens.pt` |

Both lenses come from `neuronpedia/jacobian-lens`. Pin the Jacobian Lens implementation to commit `581d398613e5602a5af361e1c34d3a92ea82ba8e`. Each model runs in a separately parameterized Modal A10G class using bfloat16, so switching models reuses a warm model-specific worker when one exists and does not hold both models in the same GPU process.

Gemma is the preferred selection because it is small, instruction-tuned, and has a compact compatible lens. If its license has not been accepted or the Hugging Face secret is missing, the models endpoint marks it unavailable and the UI offers Qwen rather than failing after experiment submission.

“Any open model” remains a post-MVP capability backed by the same model-adapter registry. Activation steering can generalize to many decoder models once their residual-block layout is known. Jacobian Lens cannot be applied arbitrarily: each model needs a compatible pre-fitted lens or a potentially expensive lens-fitting job.

## User experience

The application has a slim top navigation for switching techniques and a full-height workbench below it. Steering and J-Lens use purpose-built layouts rather than forcing both techniques into one generic dashboard.

### Steering workbench — based on the Neuronpedia screenshot

Use a three-column desktop layout:

```text
┌──────────────────┬────────────────────┬────────────────────┐
│ Controls         │ DEFAULT            │ STEERED            │
│                  │ neutral gray       │ pale blue           │
│ Model            │ baseline chat      │ intervention chat   │
│ Presets          │                    │                     │
│ Active vectors   │                    │                     │
│ Advanced         ├────────────────────┴────────────────────┤
│ settings         │ shared prompt composer + send           │
└──────────────────┴─────────────────────────────────────────┘
```

The fixed control rail contains:

- Model selector with Gemma 3 1B Instruct and Qwen3 1.7B, including ready/loading/unavailable state and technique-capability badges.
- Scrollable preset cards such as enthusiastic, formal, pirate, concise, and skeptical; each card loads a tested positive/negative contrast recipe and coefficient.
- **Add contrast pair** and **Add custom vector** actions. SAE feature search is not shown until a real SAE source exists; the MVP must not present a dead or fake feature search.
- Active-vector cards with label, source, layer, strength, enable/disable, and remove controls.
- Advanced settings for maximum new tokens, temperature, top-p, repetition penalty, manual/random seed, strength multiplier, additive algorithm, and whether steering applies to special-token positions.
- Reset settings and a concise “How it works” explanation.

The result area contains:

- A neutral **Default** pane and blue-tinted **Steered** pane with identical dimensions.
- One shared composer fixed along the bottom. Sending once starts both generations with matched settings and seed.
- Multi-turn comparison stored in the browser: after each turn, the default and steered branches retain their respective assistant messages while receiving the same next user message.
- Per-round timing and settings, a reset-conversation action, and a share/copy-experiment action.
- A loading state in both panes during Modal cold start and generation. Streaming is desirable, but the two-hour MVP may reveal both completed outputs together if token streaming threatens the critical path.

On narrow screens, controls become a drawer and Default/Steered become tabs; desktop side-by-side comparison remains the primary design.

### Jacobian Lens experiment — based on Figure 5

Use the same linked visual grammar as Figure 5 in Anthropic's paper:

1. **Prompt transcript:** rendered with tokenizer boundaries and a visible selected position.
2. **Argmax · layer × position:** input positions are columns and sampled layers are rows; each cell shows the top-ranked J-Lens token. The bottom row shows actual input tokens, and the final layer is explicitly labeled as the model-output/unembedding row.
3. **Cell tooltip:** hover shows actual layer, reindexed layer percentage, position, and the top ten decoded tokens with probability and full-vocabulary rank.
4. **Token pinning:** click a token to pin it; assign a stable color chip; allow up to six pins; click again to unpin. Hover scrubs the current cell while selection/pins remain stable.
5. **Pinned-token rank heatmap:** layer × position heatmap for the active pinned token with a logarithmic rank scale labeled `1`, `10`, `100`, and `1k+`; show the currently selected cell.
6. **By layer:** at the selected position, show the full top-token row for each sampled layer plus one line per pinned token tracking rank across layers.
7. **By position:** at the selected layer, show the full top-token row for each position plus one line per pinned token tracking rank across positions.
8. **Linked interaction:** selecting a cell updates the transcript position, tooltip, both tables, both charts, and heatmap cursor together.
9. **Layer controls:** default to roughly 25 evenly spaced layers and reindex them to `[0–100]` like the paper, while displaying real model-layer numbers in tooltips. Offer layer stride and last-N-token controls for performance.
10. **Interpretation note:** visibly explain that the first part of the model is commonly noisy, the final layers move toward next-token prediction, and a high-ranked word is an approximate J-Lens readout—not a literal thought.

For the two-hour MVP, call Anthropic's existing `compute_slice()` and `build_page()` and render the resulting interactive document inside a sandboxed `iframe srcDoc` within our product shell. This is the same renderer family used by the paper, already implements the linked views, and is Apache-2.0. Pin its Git commit, preserve attribution, and isolate it behind a `JLensFrame` component. Add only a thin presentation patch for reindexed layer labels, a six-pin readability limit, and top-k probabilities (computed from each layer's existing logits via `exp(top_logit - logsumexp(logits))`). A native React/D3 port is a follow-up, not a condition for proving the technique today.

### Activation steering behavior

1. Select a preset or enter positive and negative concept examples.
2. Choose a residual-stream layer and steering strength.
3. Enter one shared user message in the bottom composer.
4. The backend computes a contrastive direction from the last-token activations at that layer:

   `direction = mean(positive activations) - mean(negative activations)`

5. Generate baseline and steered assistant messages with identical sampling parameters and seed.
6. Append both messages to their synchronized comparison panes and expose layer, coefficient, direction norm, seed, temperature, and latency in the run details.

For the MVP, the steering hook adds `strength × direction` to the chosen block's residual output during prompt processing and each cached generation step. The UI must label this as a causal intervention, while also warning that a successful behavioral change does not prove the vector has one clean human meaning.

## Architecture

```text
Browser (React + TypeScript)
        |
        | JSON over HTTPS
        v
FastAPI gateway on Modal (CPU)
        |
        | .remote()
        v
Modal GPU class: Interpreter(model_key) (A10G, max concurrency 1)
        |-- pinned selected model + tokenizer
        |-- matching pre-fitted Neuronpedia Jacobian lens
        |-- residual activation recorder
        |-- Anthropic SliceData + interactive page renderer
        `-- temporary steering hooks

Modal Volume
        `-- Hugging Face model/lens cache (never downloaded locally)
```

Use current Modal primitives documented in the [GPU guide](https://modal.com/docs/guide/gpu), [container lifecycle guide](https://modal.com/docs/guide/lifecycle-functions), [Volumes guide](https://modal.com/docs/guide/volumes), and [web endpoint guide](https://modal.com/docs/guide/webhooks):

- `modal.Image.debian_slim().uv_pip_install(...)` for the reproducible runtime.
- `modal.Volume.from_name("open-silico-hf-cache", create_if_missing=True)` mounted at `/cache` with `HF_HOME=/cache`.
- `@app.cls(gpu="A10G", scaledown_window=600, timeout=900, volumes=...)` for the persistent model process.
- `@modal.enter()` to load the model, tokenizer, and lens once per container.
- `@modal.method()` for `run_jlens` and `run_steering`.
- `modal.parameter()` for the model key, keeping Gemma and Qwen in separate reusable workers.
- `@modal.concurrent(max_inputs=1)` because temporary hooks and shared model state must not overlap.
- A small `@modal.asgi_app()` FastAPI gateway with CORS for the browser-facing API.
- `modal serve` during development and `modal deploy` for a stable endpoint.

Keep `min_containers=0` initially to avoid idle GPU cost. The first cold start downloads model and lens artifacts into the Volume; later containers reuse the cache. GPU snapshots are an optimization after correctness, not part of the two-hour critical path.

The J-Lens iframe is generated from trusted application data, uses a pinned D3 build with subresource integrity, has no access to application credentials, and is sandboxed to scripts only. Prompt text must remain HTML-escaped by the upstream renderer. Add Anthropic's copyright/license notice to `THIRD_PARTY_NOTICES.md`.

## Repository shape

```text
silico/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── features/jlens/JLensFrame.tsx
│   │   ├── features/steering/SteeringWorkbench.tsx
│   │   ├── api.ts
│   │   └── App.tsx
│   └── package.json
├── backend/
│   ├── modal_app.py
│   ├── schemas.py
│   └── interpretability/
│       ├── model_adapter.py
│       ├── jacobian_lens.py
│       └── steering.py
├── tests/
│   ├── test_schemas.py
│   └── test_steering_hooks.py
├── .env.example
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── README.md
└── PLAN.md
```

The model registry separates model-specific facts (HF repository, revision, access state, block path, dtype, lens repository/file, default layer, and capabilities) from technique code. Adding a model must not require editing UI logic.

## API contract

### `GET /health`

Returns deployment health and the configured model ID without waking the GPU where possible.

### `GET /api/models`

Returns every registered model with display name, exact revision, ready/loading/unavailable state, access guidance, supported techniques, default layer, and lens metadata. This lets the switcher disable unavailable or incompatible choices before an experiment is submitted.

### `POST /api/jlens`

Request:

```json
{
  "model": "gemma-3-1b-it",
  "prompt": "Fact: The currency used in the country shaped like a boot is",
  "top_k": 10,
  "max_pinned_tokens": 6,
  "layer_count": 25,
  "last_n_tokens": 32,
  "max_seq_len": 128
}
```

Response fields: `experiment_id`, `model`, `model_revision`, `lens`, `visualization_html`, `elapsed_ms`, and `warnings`. The HTML contains gzip-packed typed arrays for top token IDs, full-vocabulary ranks of tracked tokens, layer/position metadata, and the linked visualization. It is mounted with `iframe srcDoc`; raw full-vocabulary logits are never sent to the browser.

### `POST /api/steer`

Request:

```json
{
  "model": "gemma-3-1b-it",
  "baseline_messages": [],
  "steered_messages": [],
  "user_message": "Write a short review of this restaurant.",
  "positive_examples": ["warm, enthusiastic, delighted"],
  "negative_examples": ["cold, critical, disappointed"],
  "layer": 18,
  "strength": 1.5,
  "max_new_tokens": 96,
  "temperature": 0.7,
  "seed": 42
}
```

Response fields: `baseline_message`, `steered_message`, `direction_norm`, exact generation settings, model metadata, timing, and warnings. Conversation state remains client-side for the MVP; each request sends the two branches explicitly.

Hard limits for the public MVP: 128 input tokens, 96 new tokens, 8 contrastive examples per side, top-k ≤ 10, and a single queued GPU request per container.

## Two-hour implementation schedule

### 0–15 minutes — scaffold and remote runtime

- Initialize the frontend and Python backend structure.
- Add Modal image, Volume, pinned dependencies, two-model registry, schemas, health endpoint, and models endpoint.
- Confirm local Modal authentication without printing credentials.

Exit check: `modal serve` starts and `/health` responds.

### 15–40 minutes — load and prove the model/lens

- Load the selected pinned Gemma or Qwen model and tokenizer in `@modal.enter()`.
- Vendor or install Anthropic's Jacobian Lens at a pinned commit.
- Load the matching Neuronpedia lens file into the parameterized GPU worker.
- Run one fixed prompt on each available model remotely and verify model/lens dimensions and layer indices match.

Exit check: the switcher reports both models honestly and smoke tests return sensible top decoded tokens for at least three layers and the final output row on each available model.

### 40–65 minutes — J-Lens API and visualization

- Use Anthropic's `compute_slice()` and `build_page()` with roughly 25 sampled/reindexed layers, top ten tokens, and bounded prompt length.
- Return the generated interactive document and mount it inside the sandboxed `JLensFrame`.
- Verify cell hover, token pinning, rank heatmap, by-layer chart, by-position chart, linked selection, and final-layer labeling.
- Add clear loading, cold-start, empty-input, and incompatible-lens errors.

Exit check: a user can enter a prompt and use all linked Figure 5 interactions without local model files.

### 65–90 minutes — steering API and comparison UI

- Capture positive/negative residuals and compute the contrastive direction.
- Add and reliably remove the forward hook with a context manager, including on errors.
- Generate baseline and steered outputs from the same seed.
- Build the Neuronpedia-inspired control rail, synchronized Default/Steered panes, presets, active-vector card, shared composer, and advanced controls.

Exit check: at least one seeded example shows a repeatable behavioral shift, while strength `0` matches the baseline path.

### 90–110 minutes — product polish and reproducibility

- Add technique navigation, model/revision badges, experiment metadata, examples, caveats, and responsive layout.
- Persist only recent experiment inputs/results in browser `localStorage`; do not add a database or authentication.
- Add a copyable JSON configuration for each run.

Exit check: both techniques work through one coherent research-workbench UI.

### 110–120 minutes — verification and handoff

- Run schema/unit tests and two remote integration smoke tests.
- Verify the browser never receives Modal or Hugging Face secrets.
- Record setup, deployment, costs/cold-start expectations, known limitations, and the next-model procedure in the README.
- Deploy the Modal app and provide the frontend with its stable API URL.

## Acceptance criteria

The MVP is complete only if all of these are true:

- No model or lens weights are downloaded to the developer machine.
- The switcher exposes Gemma and Qwen, reports gated-model availability, and routes experiments to the selected pinned model.
- J-Lens shows real decoded residual-stream readouts across multiple layers and token positions.
- The final row is distinguishable from transported intermediate-layer readouts.
- J-Lens provides linked argmax, pinned-rank heatmap, by-layer, and by-position views; pinning or selecting a cell updates every relevant view.
- Steering uses a real contrastive activation vector and a temporary model hook, not prompt rewriting.
- Baseline and steered generations share seed and sampling settings.
- One shared prompt creates one paired Default/Steered conversation round, and later user turns can continue both branches.
- Hooks are removed after every request, including failures.
- Requests are serialized per GPU container to prevent model-state interference.
- Every result reports exact model ID, model revision, technique parameters, and latency.
- The UI explains that these methods are approximations and not complete or guaranteed-faithful explanations.
- A clean clone can run the frontend locally and the model remotely on Modal from documented commands.

## Deliberately out of scope for two hours

- Fitting a new Jacobian lens. Anthropic reports roughly 100 prompts can be usable, but fitting is dominated by backward passes and deserves a separate queued job with checkpoints.
- Training or serving sparse autoencoders and natural-language autoencoders.
- Arbitrary architectures or modalities, despite Silico's broader product positioning.
- Multi-user accounts, shared workspaces, permanent experiment storage, billing, or GPU job scheduling.
- Claims that a decoded word is the model's literal thought or a complete causal explanation.

## Main risks and mitigations

- **Model/lens mismatch:** validate hidden width, fitted layers, model ID, and pinned revision at startup; refuse analysis on mismatch.
- **Large J-Lens responses:** compute layer-by-layer, constrain tokens/layers/top-k, and return compact cells instead of logits.
- **Concurrent hook contamination:** serialize class inputs and use exception-safe hook context managers.
- **Cold starts:** persist HF artifacts in a Modal Volume and keep the container warm for ten minutes after use.
- **Steering instability:** expose conservative strength defaults, show direction norm, fix the seed, and make the zero-strength control easy to run.
- **Reference-code drift:** pin the Jacobian Lens Git commit and Transformers version; wrap it behind our adapter rather than coupling UI schemas to its internal classes.
- **Overclaiming interpretability:** keep method cards and result-level warnings visible; label J-Lens as a learned average linear transport and steering as an intervention experiment.

## After the MVP

The next vertical slices should be:

1. Add a third decoder model to prove that the Gemma/Qwen adapter boundary generalizes without technique-specific UI changes.
2. Add queued J-Lens fitting on Modal with checkpoints, progress, cancellation, and persisted artifacts.
3. Add Neuronpedia/SAELens feature import and SAE feature steering.
4. Add experiment URLs and server-side persistence for collaborative research.
5. Add activation datasets, feature search, probes, attribution/circuit views, natural-language autoencoders, and evaluation suites as independent technique plugins.
6. Add a model-scientist agent only after every experiment is represented as a typed, reproducible tool call.

## Immediate next action

Proceed with the 0–40 minute tracer bullet first: scaffold the app, expose the two-model registry, deploy the parameterized Modal model class, and return one real interactive J-Lens page from each available model. Once model switching and lens compatibility are verified, mount the visualization in the workbench and build the paired steering chat around the same runtime contract.
