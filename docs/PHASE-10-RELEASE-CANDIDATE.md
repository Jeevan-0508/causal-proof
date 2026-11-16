# Phase 10 — release candidate record

Status: prepared, not published
Release type: static GitHub Pages showcase only
Full-stack application: private/local-first and not included

Current local candidate artifact hash: `074653a687b4643b0ffbfdad1eb874aff3c7d74c8ac7daa6073bb047b316f1a8`
Artifact files: 3 (`out/showcase`)
Build environment: Node `v24.21.0`, Vite `7.3.8`

## Candidate contents

The candidate is built from the Phase 9 showcase entry point and contains the
synthetic fixture plus browser-safe deterministic domain logic. It excludes the
database, authentication/session code, signing keys, backups, administrative
routes, and private APIs.

## Required candidate commands

```text
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
npm run build:showcase
npm run verify:showcase
npm run test:pages:rollback
npx playwright test -c playwright.showcase.config.ts
npm audit --audit-level=high
npm run hash:showcase
```

The exact artifact identity is recorded only after these commands complete on
the release commit. The generated `out/showcase` directory is ignored and is
never committed to the source repository.

## Publication gate

`.github/workflows/pages.yml` is manual-only (`workflow_dispatch`) and has
least-privilege Pages permissions. It uploads only `out/showcase`. Do not
dispatch it until publication approval is explicit. A successful local build,
CI run, or GitHub repository visibility does not prove that the Pages site is
live.

## Candidate limitations

- No live browser verification has been performed until publication occurs.
- GitHub Pages serves the showcase only; it cannot serve the authenticated
  investigator APIs.
- Browser-only evidence changes are ephemeral and are not private database
  mutations or server-authoritative records.
- The artifact is a synthetic demonstration, not a public evidence repository.
