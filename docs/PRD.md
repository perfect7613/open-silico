## Problem Statement

Researchers and engineers can run open-weight language models, but they lack one coherent, accessible environment for comparing model behavior with the model's internal representations. Existing interpretability work is split across research repositories, notebooks, hosted feature browsers, and closed platforms. This fragmentation makes it difficult to switch between models, run the same experiment under controlled settings, inspect token- and layer-level representations, intervene causally, and share enough metadata for another researcher to reproduce the result.

The immediate problem is to deliver a credible open-source vertical slice rather than a broad but shallow imitation of a closed platform. The product must support at least two open-weight models through a visible model switcher, execute model workloads remotely so weights never need to be downloaded to the developer machine, and make two real interpretability techniques usable from a polished interface: contrastive activation steering and Jacobian Lens inspection.

## Solution

Build Open Silico, an Apache-2.0 interpretability workbench backed by Modal GPUs. The MVP will expose a capability-aware model switcher with Gemma 3 1B Instruct and Qwen3 1.7B. Gemma is the preferred selection when its gated Hugging Face checkpoint is available; Qwen is the public, ungated fallback. The backend will report model availability and technique compatibility rather than allowing unsupported experiments to fail after submission.

The activation-steering workbench will use a Neuronpedia-inspired layout: a model and vector control rail, synchronized Default and Steered conversation panes, and one shared composer that runs both branches with matched generation parameters and seed. Steering directions will be computed from positive and negative activation examples and applied through temporary residual-stream hooks.

The Jacobian Lens workbench will use Anthropic's pinned Apache-2.0 reference implementation and compatible pre-fitted Neuronpedia lenses. It will expose the linked Figure 5 experience: prompt transcript, layer-by-position argmax table, token pinning, rank heatmap, by-layer readout, by-position readout, and linked rank trajectories. Model and lens artifacts will be cached in Modal Volumes and never downloaded to the local workstation.

Each experiment will report the exact model, model revision, lens revision, technique configuration, sampling parameters, seed, timing, and warnings. The architecture will make models and techniques pluggable without presenting the user with capabilities that are not actually installed.

## User Stories

1. As a researcher, I want to open one interpretability workbench, so that I do not need to assemble separate notebooks and services for every technique.
2. As a researcher, I want to switch between Gemma and Qwen from the interface, so that I can compare representations and behavior across model families.
3. As a researcher, I want the switcher to show whether a model is ready, loading, unavailable, or incompatible with a technique, so that failures are understandable before I run an experiment.
4. As a researcher, I want Gemma 3 1B Instruct to be the preferred model when access is configured, so that the initial experience uses a small instruction-tuned model with compatible interpretability artifacts.
5. As a researcher without gated-model access, I want Qwen3 1.7B to remain usable, so that I can run the full open-source demo without first accepting an external license.
6. As a researcher, I want model weights and lens artifacts to stay on remote infrastructure, so that my laptop does not need sufficient disk space or GPU memory.
7. As a researcher, I want switching models to preserve my prompt and settings where they remain compatible, so that comparisons require minimal repeated entry.
8. As a researcher, I want a visible cold-start/loading state after switching models, so that remote startup latency does not look like a broken application.
9. As a researcher, I want the exact model revision displayed on every result, so that later changes to a model repository do not make my experiment ambiguous.
10. As a researcher, I want the exact Jacobian Lens artifact displayed on every lens result, so that the readout can be reproduced with the same fitted transport matrices.
11. As a researcher, I want to choose activation steering from the technique navigation, so that the interface changes to controls appropriate for causal intervention.
12. As a researcher, I want one shared message composer for Default and Steered generation, so that both branches receive the same user input.
13. As a researcher, I want Default and Steered responses shown side by side, so that behavioral differences are immediately visible.
14. As a researcher, I want both branches to use the same seed and sampling settings, so that the steering intervention is the primary controlled difference.
15. As a researcher, I want to continue a multi-turn comparison, so that I can observe how an intervention changes a conversation over time.
16. As a researcher, I want each branch to retain its own assistant history while receiving the same next user turn, so that multi-turn behavior remains internally consistent.
17. As a new user, I want tested steering presets, so that I can see a successful intervention before creating my own direction.
18. As a researcher, I want presets for several behaviorally distinct concepts, so that I can compare how layer and strength affect different behaviors.
19. As a researcher, I want to define positive and negative examples, so that the system can derive a custom contrastive activation direction.
20. As a researcher, I want to add more than one example on each side of a contrast, so that the direction is less dependent on one phrasing.
21. As a researcher, I want to choose the residual-stream layer used to derive and apply a direction, so that I can study layer-dependent effects.
22. As a researcher, I want to change steering strength, so that I can find the smallest coefficient that produces a meaningful behavioral shift.
23. As a researcher, I want a zero-strength control, so that I can confirm the intervention path reproduces baseline behavior.
24. As a researcher, I want the direction norm and application settings shown with the result, so that unusually weak or strong vectors are diagnosable.
25. As a researcher, I want temporary steering hooks to be removed after every request, so that one experiment cannot contaminate later generations.
26. As a researcher, I want steering requests on one model worker serialized, so that concurrent temporary hooks cannot interfere with each other.
27. As a researcher, I want to control maximum generated tokens, temperature, top-p, repetition penalty, and seed, so that generation conditions are explicit.
28. As a researcher, I want a random-seed option and a manual-seed option, so that I can explore variation or reproduce an exact result.
29. As a researcher, I want to decide whether special-token positions are steered, so that this implementation detail is experimentally controllable.
30. As a researcher, I want to reset the steering conversation without losing my model and vector configuration, so that I can start a clean comparison quickly.
31. As a researcher, I want to copy the complete experiment configuration, so that I can share or archive the exact setup.
32. As a researcher, I want to choose Jacobian Lens from the technique navigation, so that I receive a representation-inspection interface instead of generation controls.
33. As a researcher, I want to enter a prompt and inspect its tokenizer boundaries, so that positions in every visualization correspond to visible tokens.
34. As a researcher, I want a layer-by-position table of top J-Lens tokens, so that I can scan how representations evolve during model computation.
35. As a researcher, I want actual layer numbers and normalized layer percentages, so that I can compare models with different layer counts.
36. As a researcher, I want the final model-output row distinguished from transported intermediate layers, so that I do not confuse a lens readout with the next-token distribution.
37. As a researcher, I want to hover a cell and see its top ten decoded tokens, ranks, and available scores, so that I can inspect more than the argmax label.
38. As a researcher, I want to select a layer-position cell, so that all linked views focus on the same internal state.
39. As a researcher, I want to pin a decoded token, so that I can track one concept across layers and positions.
40. As a researcher, I want pinned tokens assigned stable colors, so that their trajectories remain identifiable across charts.
41. As a researcher, I want a readability limit on simultaneous pins, so that the charts do not become unusable.
42. As a researcher, I want a logarithmic rank heatmap for a pinned token, so that both top-ranked and weak appearances remain visible.
43. As a researcher, I want a by-layer table and rank chart at the selected position, so that I can see when a representation emerges or disappears through depth.
44. As a researcher, I want a by-position table and rank chart at the selected layer, so that I can see where a representation is broadcast across the sequence.
45. As a researcher, I want selections, hover state, pins, heatmap, and charts linked, so that the visualization behaves as one instrument rather than unrelated plots.
46. As a researcher, I want prompt length and layer sampling controls, so that I can trade detail for latency and response size.
47. As a researcher, I want the interface to explain that early-layer readouts are often noisy, so that I do not overinterpret incoherent tokens.
48. As a researcher, I want the interface to explain that a decoded token is an approximate learned readout rather than a literal thought, so that conclusions remain scientifically responsible.
49. As a researcher, I want incompatible model/lens dimensions rejected at startup, so that invalid visualizations are never presented as legitimate results.
50. As a researcher, I want a clear message when Gemma requires Hugging Face access, so that I know whether to accept its license or use Qwen.
51. As a maintainer, I want a declarative model registry, so that adding a model does not require changing every technique or UI component.
52. As a maintainer, I want each registry entry to declare technique capabilities, artifact locations, model revision, dtype, GPU requirement, and access requirements, so that availability is computed consistently.
53. As a maintainer, I want model-specific block layouts isolated behind an adapter, so that steering and J-Lens engines operate through stable interfaces.
54. As a maintainer, I want the remote runtime to load a model once per warm container, so that repeated experiments avoid unnecessary initialization.
55. As a maintainer, I want Hugging Face artifacts cached in persistent Modal Volumes, so that containers do not repeatedly download large files.
56. As a maintainer, I want secrets resolved only in Modal, so that browser code and repository files never contain credentials.
57. As a maintainer, I want request limits enforced at the API boundary, so that accidental long prompts or generations do not exhaust GPU memory.
58. As a maintainer, I want structured, technique-specific errors, so that the frontend can distinguish unavailable models, cold starts, invalid settings, and runtime failures.
59. As a contributor, I want an Apache-2.0 repository with third-party notices, so that reuse and attribution expectations are clear.
60. As a contributor, I want documented commands for local UI development and remote Modal deployment, so that I can reproduce the environment from a clean clone.
61. As a contributor, I want core behavior covered by automated tests, so that adding models and techniques does not silently break existing experiments.
62. As a mobile user, I want model controls in a drawer and comparison panes available as tabs, so that the workbench remains usable on a narrow screen.
63. As a keyboard user, I want form controls and J-Lens selection reachable without a mouse, so that core experiments are accessible.
64. As a researcher, I want recent configurations retained locally without a required account, so that I can resume work without introducing a database into the MVP.
65. As a privacy-conscious user, I want the application to state what prompts are sent to Modal and avoid permanent server-side prompt storage, so that I understand the experiment's data path.

## Implementation Decisions

- The MVP model switcher will contain Gemma 3 1B Instruct and Qwen3 1.7B.
- Gemma is preferred when available because it is small, instruction-tuned, and has a compatible pre-fitted Neuronpedia Jacobian Lens. It is marked as gated and requires the user to accept Google's Hugging Face license and configure a server-side Hugging Face token.
- Qwen is the ungated Apache-2.0 fallback and must support the same two MVP techniques.
- Model availability comes from a backend models endpoint. The UI never assumes a configured model is actually accessible.
- A deep Model Registry module owns immutable model identity, pinned revision, tokenizer identity, access requirements, dtype, GPU class, residual-block adapter, lens identity, default layer, and supported capabilities.
- A deep Remote Model Runtime module owns Modal image construction, persistent artifact caching, model lifecycle, concurrency, and calls into technique engines through a small typed interface.
- Model workers are parameterized by model key so switching between Gemma and Qwen may start or reuse separate warm containers without loading both models into one GPU process.
- Model and lens weights are downloaded only inside Modal and cached in persistent Volumes. No setup command downloads weights locally.
- The API gateway runs separately from GPU workers and provides health, model availability, J-Lens analysis, and steering endpoints.
- All experiment requests contain a stable model key. Responses contain the resolved model ID and exact revision rather than echoing only the requested key.
- A deep Experiment Orchestrator validates capability, normalizes settings, fixes random generators, launches paired baseline/steered work, records timing, and returns one reproducibility envelope.
- A deep Activation Steering Engine captures residual activations, computes averaged positive-minus-negative directions, applies additive interventions, and guarantees hook removal with an exception-safe scope.
- The first steering algorithm is simple additive contrastive activation steering. Feature steering, J-vector steering, ablation, and coordinate swaps use future algorithm identifiers rather than overloading this implementation.
- Positive and negative examples are bounded arrays. Their last-token residual activations are averaged within each side before subtraction.
- Baseline and steered generations use identical generation settings and deterministic generator initialization. Strength zero is treated as a required control behavior.
- Multi-turn conversation state remains in the browser for the MVP. The client submits separate baseline and steered histories plus one shared user message.
- A deep Jacobian Lens Engine wraps the pinned Anthropic implementation and validates that model width and available layers match the selected pre-fitted lens.
- The J-Lens engine uses layer-wise computation and bounded tracked tokens instead of returning full-vocabulary logits for every layer-position cell.
- The first interface reuses Anthropic's interactive slice renderer inside a sandboxed iframe, with attribution and a narrow presentation patch for normalized layer labels, pin limits, and top-k probabilities.
- The J-Lens renderer includes an actual final-output row and clearly distinguishes it from Jacobian-transported intermediate activations.
- The frontend contains technique-specific workbenches under a shared shell and model switcher. It does not expose controls that the selected model or technique cannot fulfill.
- The steering desktop layout follows the supplied Neuronpedia reference: fixed control rail, equal Default and Steered panes, and one shared bottom composer.
- Recent experiment inputs and results are stored only in browser local storage during the MVP. There is no account or server-side experiment database.
- Copy/share produces a self-contained configuration payload. Public server-hosted share links are deferred until persistent storage exists.
- The GPU worker accepts one input at a time because temporary model hooks and generation state must never overlap.
- Browser-visible responses never contain Modal credentials, Hugging Face tokens, local paths, or full environment details.
- The application includes method-level caveats and result-level warnings. It does not describe J-Lens tokens as literal thoughts or claim steering directions are monosemantic.
- The project code is Apache-2.0. Model weights, lens files, and third-party visualization code retain their own licenses and attribution.

## Testing Decisions

- Good tests assert externally observable behavior and stable contracts. They should not assert private helper calls, hook implementation details, exact CSS structure, or incidental tensor allocation choices.
- The Model Registry will be tested for unique keys, pinned revisions, required capability metadata, valid layer defaults, gated-access metadata, and model/lens pairing.
- The model-availability endpoint will be tested for ready, loading, gated/unavailable, and unsupported-capability responses.
- The Experiment Orchestrator will be tested for request normalization, capability rejection, matched baseline/steered seeds, metadata envelopes, and structured error propagation.
- The Activation Steering Engine will be tested with a tiny deterministic transformer fixture. Tests will cover direction calculation, strength zero, positive and negative coefficients, repeatability, tuple/tensor block outputs, and hook removal after success and exceptions.
- Concurrency behavior will be tested at the public worker boundary to ensure a worker does not execute overlapping stateful interventions.
- The Jacobian Lens Engine will be tested with a tiny model/lens fixture for dimension validation, sampled layers, final-output row, bounded prompt length, token decoding, and deterministic slice metadata.
- The visualization document will be tested for HTML escaping, required linked-view metadata, pinned token data, sandbox-compatible operation, and absence of secrets.
- API schema tests will cover token limits, example limits, invalid layers, invalid sampling settings, unknown model keys, unsupported techniques, and oversized payloads.
- Frontend interaction tests will cover model switching, availability states, technique capability states, one shared send action, paired message rendering, reset behavior, preset loading, vector editing, J-Lens loading, and error recovery.
- J-Lens browser tests will cover cell selection, hover details, token pin/unpin, stable pin colors, heatmap update, by-layer update, and by-position update using a fixed fixture document.
- Accessibility tests will cover form labels, keyboard submission, focus management after errors, color-independent Default/Steered labels, and keyboard access to core visualization selection.
- An opt-in Modal integration smoke test will load each configured model and lens, run one short J-Lens prompt, and run one strength-zero steering request. It will not run in every local unit-test invocation because it consumes remote GPU resources.
- Contract fixtures generated by the tiny-model backend will provide prior art for frontend tests; remote model prose will never be asserted verbatim.
- Performance checks will enforce bounded J-Lens payload size and reject regressions that return raw full-vocabulary tensors to the browser.

## Out of Scope

- Training sparse autoencoders or exposing SAE feature search in the initial milestone.
- Fitting new Jacobian Lenses from the product interface.
- Natural-language autoencoders, circuit tracing, assistant-axis monitoring, probes, attribution graphs, or automated model-scientist agents.
- More than the two registered MVP models.
- Vision input, despite Gemma family multimodal variants.
- Local GPU inference or local model downloads.
- User accounts, organizations, billing, quotas, and permanent server-side experiment storage.
- Public share URLs backed by a database.
- True token streaming if it jeopardizes completing the two techniques; paired completed responses are acceptable for the first vertical slice.
- Exact visual reproduction of Goodfire's private Silico application or use of Goodfire trademarks and proprietary assets.
- Claims of complete mechanistic explanations, consciousness, or guaranteed causal interpretation.

## Further Notes

- The initial Gemma target is `google/gemma-3-1b-it`, with the compatible pre-fitted artifact from `neuronpedia/jacobian-lens`. Its use depends on accepting Google's model license on Hugging Face and configuring an HF token as a Modal secret.
- The initial Qwen target is `Qwen/Qwen3-1.7B`, which is public, ungated, and Apache-2.0.
- Anthropic's Jacobian Lens reference implementation is pinned to commit `581d398613e5602a5af361e1c34d3a92ea82ba8e` and is used under Apache-2.0 with attribution.
- The product should expose cold-start reality honestly. Switching models may take time on the first request, but subsequent runs should reuse cached artifacts and warm containers where available.
- The highest-value first tracer bullet is the models endpoint plus one remote J-Lens result for each model. Once model/lens compatibility is proven, both steering and the shared model-switcher UI can build on the same registry and runtime contract.
