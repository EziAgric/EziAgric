#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ISSUE_FILE="$ROOT_DIR/ISSUES-50.md"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it and authenticate with gh auth login."
  exit 1
fi

if [[ ! -f "$ISSUE_FILE" ]]; then
  echo "Issue file not found: $ISSUE_FILE"
  exit 1
fi

REPO="${GITHUB_REPO:-}" 
if [[ -z "$REPO" ]]; then
  REPO=$(git -C "$ROOT_DIR" remote get-url origin 2>/dev/null || true)
  if [[ -z "$REPO" ]]; then
    echo "Unable to determine repo. Set GITHUB_REPO or configure git remote origin."
    exit 1
  fi
  # Convert git URL to gh repo format if needed
  if [[ "$REPO" =~ ^git@github\.com:(.+)\.git$ ]]; then
    REPO="${BASH_REMATCH[1]}"
  elif [[ "$REPO" =~ ^https://github\.com/(.+)\.git$ ]]; then
    REPO="${BASH_REMATCH[1]}"
  fi
fi

TITLES=()
BODIES=()
current_title=""
current_body=""

while IFS= read -r line || [[ -n "$line" ]]; do
  if [[ "$line" == "###"* ]]; then
    if [[ -n "$current_title" ]]; then
      TITLES+=("$current_title")
      BODIES+=("$current_body")
    fi
    current_title="${line#\#\#\# }"
    current_body=""
  elif [[ -n "$current_title" ]]; then
    current_body+="$line"$'\n'
  fi

done < "$ISSUE_FILE"

if [[ -n "$current_title" ]]; then
  TITLES+=("$current_title")
  BODIES+=("$current_body")
fi

if [[ ${#TITLES[@]} -eq 0 ]]; then
  echo "No issues found in $ISSUE_FILE"
  exit 1
fi

echo "Creating ${#TITLES[@]} GitHub issues in $REPO..."
for idx in "${!TITLES[@]}"; do
  title="${TITLES[idx]}"
  body="${BODIES[idx]}"
  echo "[$((idx+1))/${#TITLES[@]}] $title"
  gh issue create --repo "$REPO" --title "$title" --body "$body"
done

echo "Done. Created ${#TITLES[@]} issues."
