#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
cd "${repo_dir}"

if ! command -v npm >/dev/null 2>&1; then
  echo "Missing required command: npm" >&2
  exit 1
fi

export MECHANOSCOPE_API_URL="${MECHANOSCOPE_API_URL:-http://127.0.0.1:8000}"
export MECHANOSCOPE_APP_URL="${MECHANOSCOPE_APP_URL:-http://127.0.0.1:5173}"
export PORT="${PORT:-8787}"

npm --prefix mcp-server ci
npm --prefix mcp-server run build

echo "Starting the MCP server at http://127.0.0.1:${PORT}/mcp"
echo "Mechanoscope API: ${MECHANOSCOPE_API_URL}"
npm --prefix mcp-server start
