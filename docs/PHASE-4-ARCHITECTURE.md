# Phase 4 architecture

CAUSAL//PROOF remains local-first. The browser keeps the current view model, while Next.js Node route handlers persist the investigation to SQLite in `.data/causal-proof.sqlite` (or `CAUSAL_PROOF_DB_PATH`). The repository is intentionally not exposed as a public multi-user service.

## Storage layers

| Layer | Purpose | Integrity boundary |
| --- | --- | --- |
| `investigations` | Domain-compatible JSON snapshot for restart recovery | Zod schema and causal graph validation |
| `evidence_records` / `evidence_mutations` | Queryable evidence and append-only mutation rows | Foreign keys and immutable mutation IDs |
| `causal_graph_versions` | Versioned nodes, edges, controls, and graph hashes | Per-investigation version/hash |
| `decision_replays` | Historical knowledge boundaries and replay hashes | Replay snapshot, graph, and control hashes |
| `simulations` / `counterfactual_branches` | Seeded inputs, results, and frozen branch metadata | Input/result/snapshot hashes |
| `audit_events` / `audit_chain_state` | Per-investigation forensic event ledger | SHA-256 payload/hash chain plus local count/head anchor |
| `export_manifests` | Portable package manifest and section hashes | Manifest hash |

All writes that change domain state and append their corresponding audit events run inside a SQLite transaction. Foreign keys are enabled and SQLite busy timeout is configured for local concurrent writers.

## Historical replay

Replay uses the decision event's knowledge time as its cutoff. Occurrence, availability, ingestion, recording, and knowledge times remain separate. Evidence is reconstructed by applying only mutations whose `recordedAt` is at or before the cutoff. A later challenge, withdrawal, restoration, or late-arriving record therefore cannot rewrite an already recorded information state.

Each replay retains:

- known and hindsight-excluded event/evidence IDs;
- mutation IDs known at the cutoff;
- a historical snapshot hash;
- graph and control configuration hashes;
- assumptions explaining the boundary.

Backdated mutations are rejected at the persistence boundary.

## Package flow

`exportInvestigationPackage()` adds an export ledger event, collects the investigation, graph versions, mutations, replays, branches, simulations, limitations, and audit chain, then hashes each section and the manifest. `verifyInvestigationPackage()` performs the same checks without opening SQLite. The `verify:package` command is a small dependency-free verifier for exported JSON.

## Optional signatures

`lib/persistence/signing.ts` exposes Ed25519 receipt creation and verification. Signing is deliberately separate from the local SHA-256 chain. The application never generates, stores, or ships a private key. A valid receipt means only that bytes match a signature made by a public key the verifier already trusts.

## Runtime boundary

The persistence modules are Node-only and are called through API routes. The browser UI uses those routes for library loading, saves, integrity checks, replay persistence, branch persistence, and package downloads. The existing domain kernel remains pure TypeScript and remains usable independently of SQLite.
