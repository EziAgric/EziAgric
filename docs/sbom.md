# Software Bill of Materials (SBOM)

**Owner:** DevOps (`@Ndifreke000`)
**Workflow:** `.github/workflows/sbom.yml`

## 1. What gets generated

On every published GitHub Release (and on any `v*.*.*` tag push), CI generates a [CycloneDX](https://cyclonedx.org/) JSON SBOM for each release artifact using `@cyclonedx/cyclonedx-npm`:

| Component | Manifest scanned | SBOM file |
|---|---|---|
| Backend | `backend/package.json` | `sbom-backend.cdx.json` |
| Frontend | `frontend/package.json` | `sbom-frontend.cdx.json` |
| Mobile | `mobile/package.json` | `sbom-mobile.cdx.json` |

Each SBOM is uploaded as a workflow artifact (400-day retention, aligned with our support window — see §3) and attached directly to the GitHub Release page via `gh release upload`.

## 2. Vulnerability diffing

A weekly scheduled job (Mondays 06:00 UTC) regenerates SBOMs from the current `main` branch, scans them with [Grype](https://github.com/anchore/grype) against the current vulnerability database, and writes a table to the workflow run summary. It also downloads the SBOMs attached to the latest GitHub Release as a comparison baseline (best-effort — skipped if no release exists yet).

> TODO: the baseline download step currently only fetches the previous SBOMs; a proper component-level diff (added/removed/version-bumped packages, new CVEs since last scan) is not yet automated and is done by comparing the two JSON files manually. Tracked as a follow-up — see the PR that introduced this workflow.

## 3. Retention

- Release-attached SBOMs live as long as the GitHub Release itself (indefinite).
- Workflow-artifact copies are retained 400 days, matching our longest supported release line.
- Weekly scan artifacts are retained 90 days (drift-detection use case only, not a compliance record).

## 4. Consuming SBOMs downstream

1. Go to the [Releases page](../../../releases) for the tag you're evaluating.
2. Download `sbom-<component>.cdx.json`.
3. Feed it into any CycloneDX-compatible tool:
   - `grype sbom:sbom-backend.cdx.json` — vulnerability scan.
   - `cyclonedx-cli analyze --input-file sbom-backend.cdx.json` — general analysis.
   - Import into your enterprise SCA/procurement tooling (most vendors accept CycloneDX JSON natively).
4. For incident response (e.g. a new CVE in a widely-used package), `grep` the SBOM's `components[].name`/`version` fields across all three component SBOMs for the affected release(s) instead of doing repo-wide archaeology.

## 5. Local generation

You can generate an SBOM locally without waiting for CI:

```bash
npx @cyclonedx/cyclonedx-npm --output-format json --output-file sbom-backend.cdx.json backend/package.json
```
