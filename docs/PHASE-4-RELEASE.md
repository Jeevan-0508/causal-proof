# Phase 4 release notes

## Delivered

- Versioned SQLite persistence with transactional writes, restart recovery, investigation isolation, foreign keys, and migration tests.
- Append-only per-investigation ledger with deterministic canonical hashes, local count/head anchors, independent verification, and explicit authenticity limits.
- Historical evidence reconstruction using availability and mutation recording cutoffs; late evidence and backdated corrections cannot leak into earlier replays.
- Persisted replay records, simulation inputs/results, causal graph versions, immutable branches, and export manifests.
- Versioned portable investigation packages and a dependency-free package verification command.
- Optional Ed25519 forensic receipt interface with no mandatory key material.
- Investigation library, SQLite recovery status, integrity verification, history-aware persistence, branch recovery, and package download controls in the existing dark UI.
- CI now covers unit/integration tests, typecheck, production build, Playwright E2E, dependency audit, and a repository secret scan.

## Scientific and security limits

The platform does not establish causation from observational evidence, does not turn confidence into probability, and does not present simulated avoided loss as observed prevention. Hash-chain consistency is not authenticity or truth. The default application has no authentication or authorization and is not a public multi-user forensic service.

## Reproducible local verification

```text
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
npm audit
npm run verify:package -- path/to/exported.causalproof.json
```

Use `CAUSAL_PROOF_DB_PATH` to select a database file. The default is `.data/causal-proof.sqlite`, which is ignored by Git.
