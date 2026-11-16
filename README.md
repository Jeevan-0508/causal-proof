# CAUSAL//PROOF

> Don't just find what happened. Test why.

CAUSAL//PROOF is an open-source, evidence-constrained investigation workspace for enterprise fraud, operational risk, and AI governance. The working demonstration is a completely synthetic logistics-fraud incident with three accounts, delayed monitoring, missing context, contradictory evidence, competing explanations, and a deterministic counterfactual lab.

## Phase 5–7 capabilities

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
- Explicit administrator bootstrap with bcrypt password hashing, expiring/revocable sessions, secure cookies, CSRF protection, and login throttling.
- Server-side role and membership authorization for investigation reads, evidence changes, replays, branches, exports, anchors, backups, and retention.
- Separate security activity log for authentication, permission, membership, integrity, export, key, anchor, backup, restore, and retention events.
- Signed Ed25519 checkpoint manifests published through a separately configured filesystem anchor and verified against the anchored ledger prefix.
- Local protected-file key provider with trusted public-key registry, rotation, revocation, and historical signature applicability.
- AES-256-GCM/scrypt encrypted backups with clean-target atomic restore and post-restore ledger verification.
- Per-investigation retention policy previews, preservation holds, approval references, and non-destructive logical retention.
- Authenticated security workspace. Synthetic demo mode is available only when `CAUSAL_PROOF_DEMO_MODE=true` is explicitly configured.
- Evidence-grounded Investigator Copilot with deterministic answers, real evidence citations, contradiction and gap identification, competing-hypothesis comparison, and qualitative next actions.
- Historical copilot mode that uses the existing replay snapshot and excludes later evidence, mutations, outcomes, and unavailable dependencies.
- Optional replaceable model-provider interface with explicit operator consent, bounded context, timeout, structured-output validation, and citation validation. It is disabled by default and no commercial API is required.
- Human review states for copilot suggestions, persisted reviewer identity/rationale, append-only ledger events, restart recovery, and portable package export.
- Synthetic prompt-injection tests and an evaluation harness with explicit citation, unsupported-claim, hindsight-leakage, reproducibility, and human-review denominators.
- Phase 7 graph studio with server-validated node/edge revisions, intervention nodes, cycle rejection, graph history, stale-parent protection, and restore-as-new-revision behavior.
- Forensic timeline explorer with occurrence, detection, ingestion, availability, knowledge, and mutation clocks plus real historical cutoff filtering.
- Multi-hypothesis comparison showing shared support, contradictions, missing context, and confounders without probability conversion.
- Guided synthetic investigation walkthrough covering chronology, contradiction review, graph editing, replay, simulation, copilot review, integrity verification, and export.
- Responsive workbench controls with reduced-motion support, keyboard-visible actions, and explicit synthetic/scientific boundary labels.

## Architecture

```text
Identity/session -> CSRF -> RBAC + investigation membership
                         |-> protected Next.js route handlers
JSON/CSV import -> Zod contracts -> SQLite transaction boundary
                         |-> chronology + provenance
                         |-> evidence + mutation tables
                         |-> DAG validity + derived hypothesis assessment
                         |-> seeded baseline/intervention kernel
                         |-> decision-time snapshot -> alternatives -> immutable branches
                         |-> deterministic JSON/PDF/package export
                         |-> append-only SHA-256 event ledger
                   Next.js API routes -> Node SQLite + security repository
                         |-> protected key directory -> signed checkpoints
                         |-> separate anchor directory -> external verification
                         |-> encrypted backup -> clean restore + verification
                   Next.js / React presentation layer
                   Graph Studio -> validated immutable graph revisions
                   Timeline Explorer -> cutoff-bound forensic rows
                   Investigator Copilot -> grounded deterministic rules
                                      -> optional disabled ModelProvider boundary
                                      -> human review queue
```

Domain logic lives in `lib/domain`; UI is in `app`; scientific and publication notes live in `docs`. The kernel is independent from React and is tested without a browser.

## Public showcase

The separate `showcase/` application is a static, browser-only public tour of
the synthetic investigation. It reuses only the browser-safe domain boundary
(`lib/domain/types.ts`, `canonical.ts`, `demo.ts`, `historical.ts`, `kernel.ts`,
`replay.ts`, and `workbench.ts`). It does not import the database, auth/session
store, signing keys, backups, administrative routes, or private APIs. The
proposed GitHub Pages destination is
<https://jeevan-0508.github.io/causal-proof/>; it is not considered live until
explicitly published and externally verified.

Build and inspect the exact static artifact locally:

```bash
npm run build:showcase
npm run verify:showcase
npm run hash:showcase
npm run test:e2e:showcase
```

The showcase is synthetic and illustrative. Its graph, evidence challenges,
historical replay, hypothesis comparison, and counterfactual controls are local
browser interactions; they are not server-authoritative reports or evidence of
causal certainty.

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
npm run verify:package -- path/to/exported.causalproof.json
npm run measure:phase8
npm run build:showcase
npm run verify:showcase
npm run test:e2e:showcase
```

The first Playwright run may require `npx playwright install chromium`. For a normal local run, set `CAUSAL_PROOF_BOOTSTRAP_TOKEN`, start the app, and use the bootstrap form to create the first administrator. There is no default administrator password.

For isolated local synthetic browser demonstrations only, set `CAUSAL_PROOF_DEMO_MODE=true` in a non-production environment and explicitly configure matching `CAUSAL_PROOF_DEMO_DB_PATH`, `CAUSAL_PROOF_DEMO_KEY_DIR`, and `CAUSAL_PROOF_DEMO_ANCHOR_DIR` paths that visibly contain `demo`. The route is rejected in production, rejects ordinary records in the demo database, and does not provide anonymous access to investigation APIs. Use a dedicated demo process and database.

Optional local trust configuration:

```text
CAUSAL_PROOF_DB_PATH=.data/causal-proof.sqlite
CAUSAL_PROOF_KEY_DIR=.data/keys
CAUSAL_PROOF_ANCHOR_DIR=<separately protected anchor directory>
CAUSAL_PROOF_RESTORE_PATH=<clean restore target>
```

## Scientific boundaries

This project does not turn confidence into proof. Observational evidence cannot establish causation by itself. The synthetic investigation therefore reports hypotheses as plausible or unidentifiable and shows warnings for missing evidence, contradictions, confounding, and unresolved identification assumptions. The engine reserves `established` for interventional evidence without active contradiction; the demo contains no established causal claim.

Simulation ranges are explicit analyst-declared sensitivity ranges, not empirical confidence intervals or fitted probability distributions. A seeded replay is reproducible, not true. “Modelled exposure difference” is not proven prevented loss. Decision replay intentionally excludes later evidence and outcomes; alternative branches are counterfactual simulations, not historical facts.

See [docs/SCIENTIFIC-LIMITATIONS.md](docs/SCIENTIFIC-LIMITATIONS.md) for the full boundary statement.

## Investigator Copilot boundaries

The baseline copilot is deterministic and local. It cites only evidence IDs present in the authorized investigation, labels evidence status and chronology, reports missing context and contradictions, and refuses to turn heuristic assessment into causal probability. Historical questions use the existing decision replay cutoff. Recommendations cannot execute external actions and require explicit human review.

Optional LLM mode is disabled by default. A future configured provider must receive explicit operator consent, and the interface must disclose that evidence may leave the local environment. Evidence and model responses are untrusted data; prompt-injection detection is not complete. See [docs/COPILOT-TRUST-MODEL.md](docs/COPILOT-TRUST-MODEL.md), [docs/PROMPT-INJECTION-TESTS.md](docs/PROMPT-INJECTION-TESTS.md), and [docs/AI-EVALUATION.md](docs/AI-EVALUATION.md).

## Phase 8 trust boundary

JSON/PDF reports are generated by the authenticated server from persisted records and an explicit historical knowledge cutoff. Report hashes make stable canonical content comparable; generation metadata is volatile. The portable verifier reports structural validity, semantic consistency, and optional trusted-checkpoint status separately. A consistent package, signed checkpoint, or copilot citation does not establish authenticity, source truth, legal admissibility, or causal certainty. Review assignments are append-only and can be filtered without rewriting historical reviews. See [docs/SERVER-AUTHORITATIVE-REPORTS.md](docs/SERVER-AUTHORITATIVE-REPORTS.md), [docs/HISTORICAL-REPORT-CUTOFFS.md](docs/HISTORICAL-REPORT-CUTOFFS.md), and [docs/PORTABLE-VERIFICATION.md](docs/PORTABLE-VERIFICATION.md).

## Security, integrity, and threat boundaries

The application uses synthetic records only and includes no credentials or proprietary datasets. The local ledger detects modified payloads, broken links, reordered rows, duplicate identities, and missing rows when the local count/head anchor or package manifest disagrees. Phase 5 adds signed checkpoints in a separately configured filesystem anchor, but this does not provide trusted time or legal chain of custody. A valid Ed25519 signature establishes integrity relative to a trusted public key; it does not establish that evidence is truthful.

The default app is local-first. It now has authentication and authorization, but no SSO/MFA, production multi-tenant hardening, KMS/HSM integration, secure physical erasure, SOC 2/ISO claim, regulatory compliance claim, or forensic admissibility claim. Keep database, key, and anchor permissions restricted; back up and test recovery; and quarantine failed package or anchor verification. See [docs/PHASE-5-THREAT-MODEL.md](docs/PHASE-5-THREAT-MODEL.md), [docs/AUTHORIZATION-MODEL.md](docs/AUTHORIZATION-MODEL.md), [docs/EXTERNAL-ANCHORING.md](docs/EXTERNAL-ANCHORING.md), and [docs/BACKUP-RECOVERY.md](docs/BACKUP-RECOVERY.md).

## Reproducible example

The fixture in `lib/domain/demo.ts` contains a synthetic €240,000 transaction total. To reproduce an intervention scenario, use the fixed seed `20261114` and the `control-realtime` intervention. The exported JSON includes the baseline, intervention parameters, sensitivity, assumptions, and input hash. The decision replay selects the 10:29 UTC manual-review decision and excludes the later final transfer and post-decision evidence from the replay snapshot.

## CI and publication

GitHub Actions configuration is in `.github/workflows/ci.yml`. It runs install, unit/integration tests, typecheck, production build, full-app and showcase Playwright E2E, static artifact verification, `npm audit`, a recognized secret scanner, and a repository hygiene scan. `.github/workflows/pages.yml` is a manual-only GitHub Pages workflow; it is prepared but must not be dispatched without explicit publication approval. The full-stack investigator remains private and requires a Node-capable environment; the Pages artifact contains only the separate synthetic showcase.

The intended public destination is [Jeevan-0508/causal-proof](https://github.com/Jeevan-0508/causal-proof). Publication details and the safety gates are documented in [docs/GITHUB-PUBLICATION.md](docs/GITHUB-PUBLICATION.md).

## Roadmap

1. Phase 9: public static showcase and artifact boundary hardening.
2. Phase 10: approved publication, live verification, rollback rehearsal, and release operations.
3. Future: SSO/MFA, managed KMS/HSM, independent remote timestamping, and hardened multi-user deployment boundaries.

## License

Apache-2.0. Independently authored for this project; no proprietary datasets or code are included.
