import os
from typing import Any

from open_silico.model_specs import ModelSpec, get_model_spec


class RemoteModelRuntime:
    """Deep model-loading Module; cloud and technique code use this Interface."""

    def __init__(self, model_key: str, cache_path: str) -> None:
        self.spec: ModelSpec = get_model_spec(model_key)
        self.cache_path = cache_path

    def load(self) -> "RemoteModelRuntime":
        os.environ["HF_HOME"] = f"{self.cache_path}/huggingface"
        os.environ["HF_HUB_CACHE"] = f"{self.cache_path}/huggingface/hub"

        import torch
        import transformers

        self.tokenizer = transformers.AutoTokenizer.from_pretrained(
            self.spec.model_id,
            revision=self.spec.revision,
        )
        self.model = transformers.AutoModelForCausalLM.from_pretrained(
            self.spec.model_id,
            revision=self.spec.revision,
            dtype=torch.bfloat16,
        ).cuda()
        self.model.eval()
        return self

    def decoder_layers(self) -> Any:
        core = getattr(self.model, "model", None)
        layers = getattr(core, "layers", None)
        if layers is None:
            language_model = getattr(core, "language_model", None)
            layers = getattr(language_model, "layers", None)
        if layers is None:
            raise ValueError("model adapter could not find decoder layers")
        return layers

    def decode(self, token_id: int) -> str:
        text = self.tokenizer.decode([token_id], clean_up_tokenization_spaces=False)
        return text.replace("\n", "↵").replace("\t", "⇥") or "∅"

    def render_prompt(self, prompt: str) -> str:
        if not self.tokenizer.chat_template:
            return prompt
        return self.tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            tokenize=False,
            add_generation_prompt=True,
            **self.spec.template_options(),
        )

    @staticmethod
    def hidden_from_output(output: Any) -> Any:
        return output[0] if isinstance(output, tuple) else output

    @staticmethod
    def replace_hidden(output: Any, hidden: Any) -> Any:
        if isinstance(output, tuple):
            return (hidden, *output[1:])
        return hidden
