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

## Architectural seams

- UI workbenches coordinate Experiments; they do not implement scientific rank or steering semantics.
- Technique renderers consume Instrument Interfaces and do not own linked scientific state.
- Modal is a cloud Adapter around the Remote Model Runtime and Technique Engines.
- HTTP and generated TypeScript clients are transport Adapters around backend contracts.
