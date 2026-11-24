# Contract ABI snapshots

`amana_escrow.abi.json` is the committed interface (function names, argument
types, return types, custom types and error enums) of the Soroban escrow
contract, generated from the compiled WASM with `stellar contract info interface`.

The backend TypeScript bindings are written against this interface. The
**ABI Snapshot** job in [`.github/workflows/contracts.yml`](../../.github/workflows/contracts.yml)
regenerates the ABI on every PR that touches `contracts/` and fails if it no
longer matches the committed file, so a changed function signature cannot reach
deployment without anyone noticing.

## Updating the snapshot intentionally

When you change a public contract function or type on purpose:

```bash
# one-time setup
rustup target add wasm32-unknown-unknown
cargo install --locked stellar-cli

# from the repo root
./scripts/update-abi-snapshot.sh
git diff contracts/snapshots/   # review: is every change expected?
```

Then, in the same PR:

1. Update the backend bindings and callers for every changed function.
2. Commit `contracts/snapshots/amana_escrow.abi.json` together with the
   contract and backend changes.
3. Call out breaking changes (renamed/removed functions, changed argument
   order or types) in the PR description.

Never edit the JSON by hand. Always regenerate it with the script.
