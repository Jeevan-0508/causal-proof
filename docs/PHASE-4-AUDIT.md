# Phase 4 audit: persistence, integrity, and historical replay

## Scope

This audit records the Phase 3 baseline before the Phase 4 changes. The repository is a local-first Next.js client with deterministic domain functions and no server-side persistence.

## Findings

### What Phase 3 already protects

- Zod schemas validate events, evidence, causal nodes, edges, controls, and imported records.
- Evidence keeps original payloads, integrity hashes, status changes, and challenge reasons.
- Causal graph validation detects cycles, temporal inversions, unknown references, unsupported edges, and missing identification assumptions.
- Decision replay applies a knowledge cutoff and labels later events and evidence as hindsight exclusions.
- Counterfactual scenarios are deterministic under a fixed seed and expose declared sensitivity ranges.
- Reports and PDF exports label simulations as simulated and retain replay hashes and scientific limitations.
- Unit tests and Playwright tests cover the main challenge, replay, and counterfactual flows.

### Architectural gaps

1. `app/page.tsx` stores the whole investigation, evidence changes, replay results, and branches in React memory. A refresh or process restart loses all state.
2. There is no investigation repository, database schema, migration version, transaction boundary, or investigation-level foreign-key isolation.
3. Evidence history is nested inside the current evidence object. It is not an independently queryable append-only ledger and has no actor, event identity, previous hash, or chain verification.
4. SHA-256 payload hashes are not an authenticity mechanism. The client has no external anchor, signer identity, or way to detect a deleted tail event.
5. `snapshotAtDecision` filters records by current `availableAt` values but does not reconstruct evidence status from mutation timestamps. A challenge or withdrawal recorded after a decision could therefore leak backward into a replay.
6. Replay has no persisted causal-graph version, control configuration version, or recorded historical snapshot hash.
7. Counterfactual branches exist only in memory and cannot be recovered or independently verified after restart.
8. JSON/PDF reports are export-only artifacts. They do not include a portable package manifest that another environment can verify without the application database.
9. The CI workflow runs unit tests, typecheck, and build but does not run Playwright or dependency/security checks.
10. The UI has no investigation library, saved-state indicator, integrity verification action, historical evidence history view, or explicit distinction between verified integrity and unknown authenticity.
11. There is no optional signing interface. Any future signature must remain separate from the SHA-256 chain and must not imply that an evidence record is truthful.

## Migration strategy

1. Add a versioned SQLite repository with foreign keys, transactional writes, normalized audit tables, and a JSON snapshot retained for domain-contract compatibility.
2. Add a deterministic, append-only event ledger with a per-investigation chain state. Verification checks event identity, ordering, payload hashes, links, and the stored head/count anchor. The anchor is local state; it is not an external authenticity proof.
3. Reconstruct historical evidence from `availableAt` plus mutations whose immutable `recordedAt` is at or before the decision knowledge cutoff. Reject backdated mutations and keep late-arriving evidence outside earlier snapshots.
4. Persist replays, simulation inputs/results, graph versions, branches, and export manifests without changing the Phase 3 domain contracts.
5. Add optional Ed25519 receipt signing and verification with explicit trust assumptions. No key is stored in the repository or database by default.
6. Define a portable package format whose manifest and included ledger can be verified independently of SQLite. Reject malformed content and unsafe paths.
7. Add server routes for local persistence and extend the existing UI with library, history, integrity, replay, branch, and package controls. Keep the default deployment local-only and make the UI labels distinguish integrity from truth.
8. Expand tests and CI, then document retention, backup, permissions, threat boundaries, and the absence of authentication or legal chain-of-custody guarantees.

## Non-goals

- No public multi-user service, authentication, authorization, legal admissibility, SOC 2/ISO claim, or regulatory compliance claim.
- No mandatory signing keys or AGENT//RECEIPT dependency.
- No replacement of the existing causal kernel or scientific limitations.
