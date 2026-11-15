# CAUSAL//PROOF

> Don't just find what happened. Test why.

CAUSAL//PROOF is an open-source, evidence-constrained investigation workspace for enterprise fraud, operational risk, and AI governance. The working demonstration is a completely synthetic logistics-fraud incident with three accounts, delayed monitoring, missing context, contradictory evidence, competing explanations, and a deterministic counterfactual lab.

## Phase 4 capabilities

- Incident reconstruction that sorts by event time while retaining ingestion time and timestamp conflicts.
- Constrained JSON/CSV event import with byte, row, header, and Zod validation.
- Evidence records with original payloads, canonical SHA-256 hashes, provenance, source rationale, and immutable mutation history.
- Challenge, withdrawal, and restore actions that recompute every dependent hypothesis.
- DAG cycle detection, unknown-reference checks, temporal-order checks, confounder candidates, unsupported-edge warnings, and intervention eligibility checks.
- Hypothesis dependency inspection with supporting evidence, contradictory evidence, missing evidence, assumptions, source reliability considerations, and derived causal status.
- Seeded baseline/intervention comparison with exported model inputs, input hashes, explicit analyst sensitivity ranges, and simulation boundaries.
- Reproducible JSON investigation reports.
- Decision replay with explicit occurrence, detection, ingestion, and knowledge-time boundaries.
- Hindsight exclusion lists for events and evidence discovered after a selected decision.
- Alternative-action laboratory for monitoring, escalation, verification, suspension, and configurable controls.
- Frozen investigation branches with parent identity, decision-time snapshots, seeds, input hashes, and result hashes.
- Structured decision-quality review without arbitrary numerical scoring.
- JSON and readable PDF report export with replay, branch, and limitation sections.
- Playwright browser coverage for evidence, simulation, and replay workflows.
- Versioned SQLite persistence with transactional writes and restart recovery. Set `CAUSAL_PROOF_DB_PATH` to choose the database file; the default is `.data/causal-proof.sqlite`.
- Investigation library with isolated IDs, evidence mutation storage, causal graph versions, replay records, simulations, frozen branches, and export manifests.
- Append-only per-investigation event ledger with deterministic canonical payload hashes, previous-event links, local count/head anchors, and independent verification.
- Historical evidence reconstruction that applies only mutations known at the decision cutoff and rejects backdated corrections.
- Portable `.causalproof.json` packages containing the domain state, mutation history, graph versions, replays, branches, simulations, limitations, and integrity manifest.
- `npm run verify:package -- path/to/package.json` verifies a package without opening the application database.
- Optional Ed25519 forensic receipt hooks. Signing is not required and no private keys are stored or bundled.

## Architecture

```text
JSON/CSV import -> Zod contracts -> SQLite transaction boundary
                         |-> chronology + provenance
                         |-> evidence + mutation tables
                         |-> DAG validity + derived hypothesis assessment
                         |-> seeded baseline/intervention kernel
                         |-> decision-time snapshot -> alternatives -> immutable branches
                         |-> deterministic JSON/PDF/package export
                         |-> append-only SHA-256 event ledger
                   Next.js API routes -> Node SQLite repository
                   Next.js / React presentation layer
```

Domain logic lives in `lib/domain`; UI is in `app`; scientific and publication notes live in `docs`. The kernel is independent from React and is tested without a browser.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Validation commands:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
npm audit
```

The first Playwright run may require `npx playwright install chromium`.

## Scientific boundaries

This project does not turn confidence into proof. Observational evidence cannot establish causation by itself. The synthetic investigation therefore reports hypotheses as plausible or unidentifiable and shows warnings for missing evidence, contradictions, confounding, and unresolved identification assumptions. The engine reserves `established` for interventional evidence without active contradiction; the demo contains no established causal claim.

Simulation ranges are explicit analyst-declared sensitivity ranges, not empirical confidence intervals or fitted probability distributions. A seeded replay is reproducible, not true. “Modelled exposure difference” is not proven prevented loss. Decision replay intentionally excludes later evidence and outcomes; alternative branches are counterfactual simulations, not historical facts.

See [docs/SCIENTIFIC-LIMITATIONS.md](docs/SCIENTIFIC-LIMITATIONS.md) for the full boundary statement.

## Security, integrity, and threat boundaries

The application uses synthetic records only and includes no credentials or proprietary datasets. The local ledger detects modified payloads, broken links, reordered rows, duplicate identities, and missing rows when the local count/head anchor or package manifest disagrees. A local hash chain is still not an external authenticity anchor or legal chain of custody. A valid Ed25519 receipt establishes integrity relative to a trusted public key; it does not establish that evidence is truthful.

The default app is local-first and has no authentication, authorization, tenant isolation, encryption, secure deletion, SOC 2/ISO claim, regulatory compliance claim, or forensic admissibility claim. Keep database permissions restricted, back up and test recovery, keep signing keys outside the repository, and quarantine failed package verification. See [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md), [docs/INTEGRITY-MODEL.md](docs/INTEGRITY-MODEL.md), and [docs/PHASE-4-ARCHITECTURE.md](docs/PHASE-4-ARCHITECTURE.md).

## Reproducible example

The fixture in `lib/domain/demo.ts` contains a synthetic €240,000 transaction total. To reproduce an intervention scenario, use the fixed seed `20261114` and the `control-realtime` intervention. The exported JSON includes the baseline, intervention parameters, sensitivity, assumptions, and input hash. The decision replay selects the 10:29 UTC manual-review decision and excludes the later final transfer and post-decision evidence from the replay snapshot.

## CI and publication

GitHub Actions configuration is in `.github/workflows/ci.yml`. It runs install, unit/integration tests, typecheck, production build, Playwright E2E, `npm audit`, and a repository secret scan. Phase 4 changes should be reviewed through a feature branch and pull request; public deployment and npm publication remain disabled.

The intended public destination is [Jeevan-0508/causal-proof](https://github.com/Jeevan-0508/causal-proof). Publication details and the safety gates are documented in [docs/GITHUB-PUBLICATION.md](docs/GITHUB-PUBLICATION.md).

## Roadmap

1. Phase 5: durable multi-user isolation with explicit authentication, authorization, key management, and independent external audit anchoring.
2. Phase 5: richer graph editing with cycle prevention, explicit intervention nodes, and assumption management.
3. Phase 5: retention automation, encrypted backup/restore, accessibility audit automation, and deployment packaging.

## License

Apache-2.0. Independently authored for this project; no proprietary datasets or code are included.
