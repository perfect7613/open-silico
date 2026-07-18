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

Planning and repository setup. The first implementation target is a two-model vertical slice supporting both activation steering and Jacobian Lens.

## License

Apache License 2.0. Third-party model weights, lens artifacts, and libraries retain their respective licenses.

