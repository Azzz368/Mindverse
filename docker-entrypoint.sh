#!/bin/sh
set -eu

# Render Secret Files are mounted at /etc/secrets/<filename>. Copy the Codex
# credential into the non-root HOME that the application passes to Codex CLI.
# The copied file only exists in the running container and is never in Git or an
# image layer.
CODEX_SECRET_FILE="${MINDVERSE_CODEX_AUTH_FILE:-/etc/secrets/codex-auth.json}"
CODEX_HOME_DIR="${MINDVERSE_CODEX_HOME:-${HOME}/.codex}"

if [ -f "$CODEX_SECRET_FILE" ]; then
  mkdir -p "$CODEX_HOME_DIR"
  cp "$CODEX_SECRET_FILE" "$CODEX_HOME_DIR/auth.json"
  chmod 600 "$CODEX_HOME_DIR/auth.json"
fi

exec "$@"
