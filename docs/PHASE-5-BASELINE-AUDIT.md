# Phase 5 baseline audit

## Reviewed baseline

The audit was performed against the Phase 4 merge commit `1446c26b5246861f1077d9e229cdb9e8e046a0ec`. The existing unit/integration suite passed before Phase 5 changes: 30 tests across six files.

## Existing strengths

- Phase 4 has a versioned SQLite repository with foreign keys, transactional writes, investigation IDs, evidence mutation rows, graph versions, replay records, branches, simulations, and export manifests.
- The local ledger has deterministic canonical payload hashes, previous-event links, per-investigation sequence numbers, and a local count/head anchor.
- Historical replay reconstructs evidence from availability and mutation recording cutoffs and rejects mutations that would rewrite persisted replays.
- Portable packages can be verified without the source database, and Ed25519 receipt helpers exist in `lib/persistence/signing.ts`.
- The domain kernel preserves scientific boundaries: observational evidence is not causal proof and seeded simulation is not observed prevention.

## Trust-boundary gaps

1. All Next.js investigation routes accept anonymous requests. The `actorId` is supplied by the caller and is not bound to an authenticated identity.
2. There are no users, passwords, sessions, expiration, revocation, CSRF tokens, login throttling, or secure cookie policy.
3. Investigation reads and writes are not scoped to membership. A caller who knows an ID can read, mutate, replay, branch, export, or import through direct HTTP requests.
4. The Phase 4 UI has no login boundary and its role-like labels are presentation-only.
5. Signing accepts an arbitrary PEM from the caller. There is no trusted public-key registry, rotation, revocation, historical key applicability, or protected private-key provider.
6. The local ledger has no checkpoint copied to an independent trust root. A user who can rewrite the database can rewrite both the chain and its local anchor.
7. There is no encrypted backup format, authenticated restore process, schema compatibility gate, or recovery test.
8. Evidence has no configurable retention policy, preservation hold, restricted deletion approval, or backup/export retention rule. Physical deletion is not implemented or claimed.
9. Security activity is mixed with the investigation ledger; login, permission, membership, backup, key, anchor, and integrity events are not separately protected.
10. API request limits, error redaction, centralized authorization, and request-size/CSRF enforcement are absent.
11. CI uses a repository regex scan but no recognized secret-scanning tool.

## Phase 5 migration strategy

1. Add a schema migration for users, sessions, memberships, throttling, protected security activity, trusted public keys, anchor checkpoints, retention policies/actions, and logical-retention records.
2. Require an explicit bootstrap token and password for the first administrator. Add bcrypt password hashing, opaque expiring/revocable sessions, secure cookies, CSRF checks, and login throttling.
3. Centralize role and membership policy in server-side helpers and apply it to every investigation route. Return not-found semantics for unauthorized investigation IDs to avoid enumeration.
4. Add a local-file independent-anchor adapter that requires a separate configured root, signed checkpoint manifests, key rotation/revocation, and prefix verification against the anchored sequence.
5. Add a local protected-file key provider and an adapter interface for future KMS/HSM implementations. Store only public keys and key metadata in SQLite.
6. Add AES-256-GCM/scrypt backup packages, atomic restore into a clean target, schema checks, and post-restore ledger verification.
7. Add policy-only retention previews and approval-backed logical retention records. Never silently erase forensic history; document that secure physical erasure is not provided.
8. Add a security dashboard and authenticated demo mode that is enabled only by explicit test/local configuration.
9. Add tests for every role, protected endpoint, CSRF/session/rate limits, cross-investigation access, anchor replacement/rollback, key rotation/revocation, backup failure modes, and retention holds.

## Explicit non-goals

- No public deployment, paid cloud dependency, custom cryptographic authentication protocol, legal chain-of-custody claim, trusted timestamp claim, SOC 2/ISO claim, or regulatory compliance claim.
- No private key in Git, SQLite, packages, logs, or UI state.
- No assertion that signatures prove source evidence truth or that role controls make the system enterprise-ready.
