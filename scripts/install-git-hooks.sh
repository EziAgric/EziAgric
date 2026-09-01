#!/usr/bin/env bash
# install-git-hooks.sh — Wires the repo's lightweight git hooks (currently: gitleaks
# pre-commit secret scan) by pointing git at the checked-in .githooks/ directory.
#
# Usage: ./scripts/install-git-hooks.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
chmod +x "$REPO_ROOT/.githooks/"*
git -C "$REPO_ROOT" config core.hooksPath .githooks

echo "Git hooks installed (core.hooksPath=.githooks)."
echo "Pre-commit will now run 'gitleaks protect --staged' if gitleaks is installed."
