import json
from pathlib import Path

from open_silico.api import create_app
from open_silico.config import Settings

output = Path(__file__).parents[1] / "frontend" / "openapi.json"
schema = create_app(Settings(environment="contract", _env_file=None)).openapi()
output.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")
print(f"wrote {output}")
