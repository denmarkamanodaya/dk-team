#!/usr/bin/env bash
# dk-team installer (macOS / Linux).
#   From a clone:   ./install.sh [dk-team install options]
#   One-liner:      curl -fsSL https://raw.githubusercontent.com/<owner>/dk-team/main/install.sh | bash
#                   (public repos only; for a private repo, clone it and run ./install.sh)
set -euo pipefail
REPO_URL="${DK_TEAM_REPO:-https://github.com/denmarkamanodaya/dk-team.git}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd -P || pwd)"
if [ -x "$HERE/bin/dk-team" ] && [ -d "$HERE/claude" ]; then
  exec "$HERE/bin/dk-team" install "$@"
fi
DEST="${DK_TEAM_SRC:-$HOME/.dk-team}"
command -v git >/dev/null 2>&1 || { echo "git is required"; exit 1; }
if [ -d "$DEST/.git" ]; then git -C "$DEST" pull --ff-only; else git clone --depth 1 "$REPO_URL" "$DEST"; fi
exec "$DEST/bin/dk-team" install "$@"
