# Architecture Diagrams

Diagrams-as-code for EziAgric (Amana). Every diagram is a Mermaid block inside
a Markdown page, so GitHub renders a live preview directly in the file view
and in PR diffs — there are no binary images to keep in sync.

| Page | Level | What it answers |
|---|---|---|
| [System context](./system-context.md) | C4 L1 | Who uses EziAgric and which external systems it depends on |
| [Containers](./containers.md) | C4 L2 | The deployable pieces (web, mobile, API, workers, contract, data stores) and how they talk |
| [Trade lifecycle](./trade-lifecycle.md) | Sequence + state | How a trade moves from creation to settlement on-chain and off-chain |
| [Dispute flow](./dispute-flow.md) | Sequence | How disputes, mediator quorum and partial-delivery escalation resolve |
| [Contract modules](./contract-modules.md) | Component | How `contracts/amana_escrow/src` is split into modules |

Related references: [ADRs](../adr), [event flow](../event-flow.md),
[data model](../data-model-relationships.md),
[contract overview](../eziagric_contract_overview.md).

## Updating diagrams

1. Edit the Mermaid block in the relevant page. Keep node names aligned with
   real code identifiers (service files, contract functions, event topics) so
   the diagram can be checked against the code in review.
2. Preview locally with any Mermaid-aware viewer, or render exactly as CI does:

   ```bash
   ./scripts/render-architecture-diagrams.sh   # writes SVGs to .diagrams-out/
   node scripts/check-architecture-links.mjs   # verifies links and anchors
   ```

3. PRs that change system boundaries, containers, the trade lifecycle, the
   dispute flow or the contract module layout **must** update the matching
   diagram — this is a checklist item in the PR template.

## CI

`.github/workflows/architecture-diagrams.yml` (`Architecture Diagrams Gate`)
runs on every PR and, when `docs/**`, `README.md` or the contract module
sources changed:

- renders every Mermaid block with `@mermaid-js/mermaid-cli` — a syntax error
  fails the job — and uploads the SVGs as a build artifact for review;
- checks that every relative link and `#anchor` in `docs/architecture/`
  resolves, and that links into `docs/architecture/` from the README and ADRs
  are not broken.
