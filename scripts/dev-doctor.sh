#!/usr/bin/env bash
# EziAgric contributor environment doctor.
#
# Usage: scripts/dev-doctor.sh [--no-smoke]
#   Validates toolchains for frontend, backend, mobile and contracts, prints the exact
#   install command for every failure, then runs one smoke test per stack.
#
# Known failure modes → hint (keep this table in sync with the checks below):
#   node missing / < 22          → nvm install 22 && nvm use 22
#   npm < 10                     → npm install -g npm@10
#   git missing                  → https://git-scm.com/downloads
#   docker missing / not running → https://docs.docker.com/get-docker/ (then start the daemon)
#   rustup / cargo missing       → curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
#   wasm32 target missing        → rustup target add wasm32-unknown-unknown
#   stellar/soroban CLI missing  → cargo install --locked stellar-cli
#   <stack>/node_modules missing → (cd <stack> && npm install)
#   backend/.env missing         → cp backend/.env.example backend/.env
#   frontend/.env.local missing  → cp frontend/.env.example frontend/.env.local
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE=1
[ "${1:-}" = "--no-smoke" ] && SMOKE=0

fails=0; warns=0
ok()   { printf '  \033[32m✔\033[0m %s\n' "$1"; }
bad()  { printf '  \033[31m✘\033[0m %s\n      fix: %s\n' "$1" "$2"; fails=$((fails + 1)); }
warn() { printf '  \033[33m!\033[0m %s\n      fix: %s\n' "$1" "$2"; warns=$((warns + 1)); }
has()  { command -v "$1" >/dev/null 2>&1; }
major() { "$@" 2>/dev/null | grep -oE '[0-9]+' | head -1; }

echo "== Core"
has git && ok "git $(git --version | awk '{print $3}')" || bad "git missing" "https://git-scm.com/downloads"
if has node; then
  v=$(major node --version)
  [ "${v:-0}" -ge 22 ] && ok "node $(node --version)" || bad "node $(node --version) < 22" "nvm install 22 && nvm use 22"
else
  bad "node missing" "nvm install 22 && nvm use 22"
fi
if has npm; then
  v=$(major npm --version)
  [ "${v:-0}" -ge 10 ] && ok "npm $(npm --version)" || bad "npm $(npm --version) < 10" "npm install -g npm@10"
fi
if has docker; then
  docker info >/dev/null 2>&1 && ok "docker running" || warn "docker installed but daemon not running" "start Docker Desktop / sudo systemctl start docker"
else
  warn "docker missing (needed for dev-up.sh / Postgres)" "https://docs.docker.com/get-docker/"
fi

echo "== Node stacks"
for stack in frontend backend mobile; do
  [ -d "$ROOT/$stack/node_modules" ] && ok "$stack dependencies installed" || bad "$stack/node_modules missing" "(cd $stack && npm install)"
done
[ -f "$ROOT/backend/.env" ] && ok "backend/.env present" || bad "backend/.env missing" "cp backend/.env.example backend/.env"
[ -f "$ROOT/frontend/.env.local" ] && ok "frontend/.env.local present" || warn "frontend/.env.local missing" "cp frontend/.env.example frontend/.env.local"

echo "== Contracts"
if has cargo; then
  ok "cargo $(cargo --version | awk '{print $2}')"
  if has rustup; then
    rustup target list --installed 2>/dev/null | grep -q wasm32-unknown-unknown \
      && ok "wasm32-unknown-unknown target" || bad "wasm32 target missing" "rustup target add wasm32-unknown-unknown"
  fi
else
  bad "rustup/cargo missing" "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
fi
if has stellar || has soroban; then ok "stellar/soroban CLI"; else warn "stellar CLI missing (deploy only)" "cargo install --locked stellar-cli"; fi

if [ "$fails" -gt 0 ]; then
  echo; echo "✘ $fails problem(s), $warns warning(s). Fix the above and re-run."
  exit 1
fi

if [ "$SMOKE" -eq 1 ]; then
  echo "== Smoke (one test per stack)"
  run() { local name=$1; shift; if (cd "$ROOT" && "$@") >/tmp/dev-doctor-$name.log 2>&1; then ok "$name"; else bad "$name smoke failed (log: /tmp/dev-doctor-$name.log)" "see log; report via the 'Onboarding friction' issue template"; fi; }
  run frontend bash -c 'cd frontend && npx jest --passWithNoTests --silent --findRelatedTests src/app/page.tsx'
  run backend  bash -c 'cd backend && npx jest --config jest.config.js --silent --testPathPatterns src/__tests__/health.test.ts'
  run mobile   bash -c 'cd mobile && npx jest --silent --passWithNoTests --listTests >/dev/null'
  run contracts bash -c 'cd contracts/amana_escrow && cargo test --quiet --lib'
fi

echo
[ "$fails" -eq 0 ] && echo "✔ Environment ready ($warns warning(s))." || { echo "✘ $fails problem(s)."; exit 1; }
