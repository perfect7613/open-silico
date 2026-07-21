# Mechanoscope domain context

Mechanoscope is an interpretability workbench for running reproducible experiments against remotely hosted open-weight language models.

## Domain vocabulary

- **Model Subject** — a version-pinned model that can be inspected by one or more techniques.
- **Model Registry** — the authoritative Module for a Model Subject's identity, revision, architecture layout, access requirements, calibration, and supported capabilities.
- **Capability** — a technique a Model Subject can execute, such as Activation Steering or Jacobian Lens.
- **J-Lens Instrument** — the Module that owns Jacobian Lens selection, token pins, exact-rank lookup, and linked projections. Its renderers are Adapters at the Instrument Interface.
- **Instrument Selection** — one linked layer-row and token-position coordinate shared by every J-Lens Adapter.
- **Pinned Token** — a vocabulary token whose full-rank trajectory is compared across layers and positions.
- **Representation Projection** — a view derived from one J-Lens result and its Instrument Selection, such as the layer series, position series, heatmap, or 3D Representation Volume.
- **Remote Model Runtime** — the Module that loads and caches a Model Subject, independent of the cloud Adapter hosting it.
- **Technique Engine** — an Implementation of a Capability against the Remote Model Runtime.
- **Experiment** — one requested technique execution with a Model Subject, parameters, lifecycle, and provenance.
- **Experiment Record** — the replayable result of an Experiment, including its inputs, output, errors, timings, and version identities.
- **Causal Trace** — an evidence object that joins a representation Observation to a matched Intervention on the same Model Subject, records the hypothesis, and states which causal claims remain unresolved.

## Architectural seams

- UI workbenches coordinate Experiments; they do not implement scientific rank or steering semantics.
- Technique renderers consume Instrument Interfaces and do not own linked scientific state.
- Modal is a cloud Adapter around the Remote Model Runtime and Technique Engines.
- HTTP and generated TypeScript clients are transport Adapters around backend contracts.

## Product boundary and competitive context

This section is a standing instruction for product work. Re-check the linked primary sources before making time-sensitive claims.

- [Neuronpedia](https://www.neuronpedia.org/) is the open public library and tool ecosystem for mechanistic interpretability. It hosts large activation and explanation datasets plus SAE features, search, steering, circuit tracing, Jacobian Lens, Natural Language Autoencoders, Assistant Axis, APIs, and community releases. Its open-source repository describes a broad, service-oriented platform. Mechanoscope must not claim to beat Neuronpedia on corpus breadth, model count, or existing technique count.
- [Goodfire Silico](https://www.goodfire.ai/silico) is positioned as a private model-design environment for teams training models. Its public material emphasizes frontier interpretability, agent-planned experiments, health checks, debugging, intervention, data debugging, and infrastructure at frontier scale. Mechanoscope must not imitate Goodfire branding or claim knowledge of non-public product behavior.

## Product thesis and moat

Mechanoscope is the open **causal debugging protocol** between individual interpretability tools. The primary unit of value is not a visualization or a feature database; it is a reproducible chain:

```text
hypothesis → observe a representation → intervene with matched controls → compare behavior → preserve limitations → replay/share
```

The first implementation is **Causal Trace**. It pairs a successful Jacobian Lens record with a successful activation-steering record from the same pinned model, makes the observation/intervention boundary explicit, and exports a machine-readable receipt plus a shareable X-Ray card. It never upgrades “the completion changed” into “the mechanism is proven.”

Future techniques must plug into the same evidence protocol through typed Observation, Intervention, Evaluation, and Provenance interfaces. Prefer improvements that compound this cross-technique experiment graph over isolated demos. The durable moat is the growing open corpus of replayable causal traces, technique adapters, and evaluation recipes—not a proprietary visual style.

Product decisions should follow these rules:

- connect techniques into hypothesis-driven workflows instead of adding disconnected tabs;
- expose controls, revisions, failures, and caveats as first-class evidence;
- make valuable results replayable, forkable, comparable, and citeable;
- create approachable share artifacts without simplifying scientific uncertainty away; and
- describe competitive differences as public-positioning comparisons, not unverifiable superiority claims.
