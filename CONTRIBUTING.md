# Contributing

Thanks for contributing! This document explains how to get set up and where to put things.

## Getting started

```bash
cd backend
cp .env.example .env
npm install
npm run build
npm test
```

## Required PR CI Gates

See the *Required PR CI Gates* section in the [README](./README.md) for the full list of checks that must pass before a PR can be merged.

## Where do implementation and PR notes go?

Do **not** add implementation notes, PR summaries, or wave/issue write-ups to the repository root. The root should only contain project-level files (e.g. `README.md`, `CONTRIBUTING.md`, `LICENSE`, config files).

Instead:

- **Implementation notes** (e.g. `ISSUE_<n>_IMPLEMENTATION.md`) → `docs/` topic pages. Add the content to the relevant topic page under `docs/`, or create a new topic page if none fits.
- **PR summaries** (e.g. `PR_SUMMARY_ISSUE_<n>.md`) → the PR description itself, or a `docs/` topic page when the content is durable reference material.
- **Wave / program write-ups** (e.g. `STELLAR_WAVE_IMPLEMENTATION.md`) → `docs/` topic pages.

If a note is no longer useful, delete it rather than leaving it in the root. Historical notes that must be retained belong under `docs/archive/`.

## Pull requests

- Reference the issue you are resolving in the PR description (`Closes #<number>`).
- Include test evidence for the change.
- Keep changes scoped to the issue; avoid unrelated refactors.
