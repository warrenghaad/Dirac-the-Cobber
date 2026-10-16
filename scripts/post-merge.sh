#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
uv sync --frozen
python -m compileall -q workflow_system
python -m workflow_system.import_board --check
