#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
cd "${repo_dir}"

for command_name in uv npm; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "Missing required command: ${command_name}" >&2
    exit 1
  fi
done

modal_profile="$(uv run modal profile current | tr -d '[:space:]')"
api_url="${MECHANOSCOPE_DEPLOYED_API_URL:-https://${modal_profile}--mechanoscope-api.modal.run}"

echo "Building the browser and MCP applications..."
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix mcp-server ci
npm --prefix mcp-server run build

echo "Deploying Mechanoscope to Modal profile ${modal_profile}..."
MECHANOSCOPE_DEPLOYED_API_URL="${api_url}" \
MECHANOSCOPE_HF_SECRET_NAME="${MECHANOSCOPE_HF_SECRET_NAME:-}" \
  uv run modal deploy backend/modal_app.py

echo
echo "Web application: ${api_url}"
echo "MCP endpoint:    ${api_url/-api.modal.run/-mcp.modal.run}/mcp"
echo "The GPU worker starts on demand and scales down after five idle minutes."
