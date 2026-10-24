#!/usr/bin/env bash
# Renders every Mermaid block under docs/architecture/ to SVG (#275).
#
# mermaid-cli exits non-zero on any diagram syntax error, so this doubles as
# the render check in CI. Output lands in .diagrams-out/ (git-ignored by
# convention; uploaded as a workflow artifact in CI).
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src_dir="$repo_root/docs/architecture"
out_dir="${DIAGRAMS_OUT:-$repo_root/.diagrams-out}"
mmdc_version="${MERMAID_CLI_VERSION:-11.4.2}"

mkdir -p "$out_dir"

# GitHub-hosted Ubuntu runners disallow the Chromium sandbox.
puppeteer_config="$(mktemp)"
trap 'rm -f "$puppeteer_config"' EXIT
echo '{"args":["--no-sandbox","--disable-setuid-sandbox"]}' >"$puppeteer_config"

shopt -s nullglob
pages=("$src_dir"/*.md)
[[ ${#pages[@]} -gt 0 ]] || { echo "no diagram pages found in docs/architecture" >&2; exit 1; }

rendered=0
for page in "${pages[@]}"; do
  name="$(basename "$page" .md)"
  if ! grep -q '^```mermaid' "$page"; then
    continue
  fi
  echo "rendering $name"
  # Markdown input: every ```mermaid block becomes <name>-<n>.svg and a
  # rewritten <name>.md that references the SVGs.
  npx --yes "@mermaid-js/mermaid-cli@${mmdc_version}" \
    --puppeteerConfigFile "$puppeteer_config" \
    --input "$page" \
    --output "$out_dir/$name.md" \
    --outputFormat svg
  rendered=$((rendered + 1))
done

[[ $rendered -gt 0 ]] || { echo "no Mermaid diagrams found in docs/architecture" >&2; exit 1; }
echo "rendered diagrams from $rendered page(s) into ${out_dir#$repo_root/}"
