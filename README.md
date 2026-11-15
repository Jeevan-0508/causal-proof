# CAUSAL//PROOF

> Don't just find what happened. Test why.

CAUSAL//PROOF is an open-source, evidence-constrained investigation workspace for enterprise fraud, operational risk, and AI governance. The working demonstration is a completely synthetic logistics-fraud incident with three accounts, delayed monitoring, missing context, contradictory evidence, competing explanations, and a deterministic counterfactual lab.

## Phase 3 capabilities

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

## Architecture

```text
JSON/CSV import -> Zod contracts -> local investigation state
                         |-> chronology + provenance
                         |-> append-only evidence mutations
                         |-> DAG validity + derived hypothesis assessment
                         |-> seeded baseline/intervention kernel
                         |-> decision-time snapshot -> alternatives -> immutable branches
                         |-> deterministic JSON/PDF report export
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
```

The first Playwright run may require `npx playwright install chromium`.

## Scientific boundaries

This project does not turn confidence into proof. Observational evidence cannot establish causation by itself. The synthetic investigation therefore reports hypotheses as plausible or unidentifiable and shows warnings for missing evidence, contradictions, confounding, and unresolved identification assumptions. The engine reserves `established` for interventional evidence without active contradiction; the demo contains no established causal claim.

Simulation ranges are explicit analyst-declared sensitivity ranges, not empirical confidence intervals or fitted probability distributions. A seeded replay is reproducible, not true. “Modelled exposure difference” is not proven prevented loss. Decision replay intentionally excludes later evidence and outcomes; alternative branches are counterfactual simulations, not historical facts.

See [docs/SCIENTIFIC-LIMITATIONS.md](docs/SCIENTIFIC-LIMITATIONS.md) for the full boundary statement.

## Security and integrity

The application uses synthetic records only and includes no credentials or proprietary datasets. SHA-256 is tamper evidence for canonical payloads, not authenticity or chain of custody. Production use still requires durable append-only persistence, access control, retention policy, signatures, identity binding, and independent audit controls. Current browser state is in memory.

## Reproducible example

The fixture in `lib/domain/demo.ts` contains a synthetic €240,000 transaction total. To reproduce an intervention scenario, use the fixed seed `20261114` and the `control-realtime` intervention. The exported JSON includes the baseline, intervention parameters, sensitivity, assumptions, and input hash. The decision replay selects the 10:29 UTC manual-review decision and excludes the later final transfer and post-decision evidence from the replay snapshot.

## CI and publication

GitHub Actions configuration is in `.github/workflows/ci.yml`. It runs install, unit tests, typecheck, and production build. Browser tests run locally or can be added to CI once browser caching is configured.

The intended public destination is [Jeevan-0508/causal-proof](https://github.com/Jeevan-0508/causal-proof). Publication details and the safety gates are documented in [docs/GITHUB-PUBLICATION.md](docs/GITHUB-PUBLICATION.md).

## Roadmap

1. Phase 4: SQLite persistence, append-only event log, investigation isolation, and signed provenance hooks.
2. Phase 4: richer graph editing with cycle prevention, explicit intervention nodes, and assumption management.
3. Phase 4: larger import formats, accessibility audit automation, and deployment packaging.

## License

Apache-2.0. Independently authored for this project; no proprietary datasets or code are included.
