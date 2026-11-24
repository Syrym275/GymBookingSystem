#!/usr/bin/env bash
# Start the backend on macOS / Linux.
#   ./start_backend.sh          -> prepare the database, then start the API on http://127.0.0.1:8000
#   ./start_backend.sh --no-db  -> start the API without touching the database
#
# Settings come from backend/.env (copy .env.example to .env and fill in DATABASE_URL).
# The first run creates the virtual environment (.venv) and installs the Python packages.
set -euo pipefail
cd "$(dirname "$0")"

# 1. Python 3.11+ (Homebrew: brew install python@3.11)
PY=""
for candidate in python3.13 python3.12 python3.11 python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then
    PY="$candidate"; break
  fi
done
if [ -z "$PY" ]; then
  echo "Python 3.11 or newer was not found. Install it with:  brew install python@3.11" >&2
  exit 1
fi

# 2. Virtual environment + packages (only when missing or requirements changed)
if [ ! -x .venv/bin/python ]; then
  echo "Creating .venv with $PY ..."
  "$PY" -m venv .venv
fi
if [ ! -f .venv/.installed ] || [ requirements.txt -nt .venv/.installed ]; then
  .venv/bin/python -m pip install --upgrade pip >/dev/null
  .venv/bin/python -m pip install -r requirements.txt
  touch .venv/.installed
fi

# 3. Settings from .env (KEY=value lines; # comments ignored; the backend itself does not read .env)
if [ ! -f .env ]; then
  echo "backend/.env is missing. Run:  cp .env.example .env  and put your DATABASE_URL in it." >&2
  exit 1
fi
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  case "$line" in ''|\#*) continue ;; esac
  key="${line%%=*}"; value="${line#*=}"
  value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
  export "$key=$value"
done < .env
if [ -z "${DATABASE_URL:-}" ] || [[ "$DATABASE_URL" == *YOUR_* ]]; then
  echo "DATABASE_URL in backend/.env is not filled in yet." >&2
  exit 1
fi

# 4. Database: creates tables + sample data on an empty database, applies updates otherwise (safe to repeat)
if [ "${1:-}" != "--no-db" ]; then
  .venv/bin/python -m scripts.migrate
fi

# 5. API
echo "Backend: http://127.0.0.1:8000   (API docs: http://127.0.0.1:8000/docs)   Stop: Ctrl+C"
exec .venv/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
