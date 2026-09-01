#!/usr/bin/env bash
# Pin `image: repo:tag` references to `image: repo:tag@sha256:<digest>` across
# docker-compose.yml and infra/k8s/ (issue #206).
#
# Digests are resolved from the registry at run time, so this needs a runner
# with network access to the relevant registries (Docker Hub / GHCR). It is a
# helper for a maintainer to run and commit — it is NOT wired into CI, because
# CI cannot verify a rewritten digest without pulling.
#
# Usage:
#   scripts/pin-image-digests.sh            # rewrite in place
#   scripts/pin-image-digests.sh --check    # exit 1 if any ref is unpinned
#
# Requires: docker (with `docker buildx imagetools`) OR `crane`.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK_ONLY=0
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=1

FILES=(
  "$REPO_ROOT/docker-compose.yml"
  "$REPO_ROOT/infra/k8s/postgres-statefulset.yaml"
  "$REPO_ROOT/infra/k8s/redis-deployment.yaml"
  "$REPO_ROOT/infra/k8s/backend-deployment.yaml"
  "$REPO_ROOT/infra/k8s/frontend-deployment.yaml"
  "$REPO_ROOT/infra/k8s/cronjob-backup.yaml"
)

resolve_digest() {
  local ref="$1"
  if command -v crane >/dev/null 2>&1; then
    crane digest "$ref"
  elif docker buildx imagetools inspect "$ref" >/dev/null 2>&1; then
    docker buildx imagetools inspect "$ref" --format '{{json .Manifest.Digest}}' | tr -d '"'
  else
    echo "ERROR: need 'crane' or 'docker buildx' to resolve $ref" >&2
    return 1
  fi
}

rc=0
for f in "${FILES[@]}"; do
  [[ -f "$f" ]] || continue
  while IFS= read -r ref; do
    [[ -z "$ref" ]] && continue
    if [[ "$ref" == *"@sha256:"* ]]; then
      continue
    fi
    if [[ "$CHECK_ONLY" -eq 1 ]]; then
      echo "unpinned: $ref  ($(basename "$f"))"
      rc=1
      continue
    fi
    digest="$(resolve_digest "$ref")"
    pinned="${ref}@${digest}"
    echo "pinning $ref -> $pinned  ($(basename "$f"))"
    # Only rewrite the bare tag ref, not one already carrying a digest.
    sed -i.bak "s#\\(image:[[:space:]]*\\)${ref//./\\.}\$#\\1${pinned}#" "$f"
    rm -f "$f.bak"
  done < <(grep -oE 'image:[[:space:]]*[^[:space:]]+' "$f" | sed -E 's/image:[[:space:]]*//')
done

exit "$rc"
