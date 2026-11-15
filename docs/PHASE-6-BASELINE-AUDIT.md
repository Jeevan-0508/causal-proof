# Phase 6 baseline audit

## Scope and verified baseline

The audit was performed against the Phase 5 merge on `main` at commit `de3b969f6fab4a9558227a18d6770d3e15afddff`. The repository is a local-first Next.js application backed by SQLite. The current baseline test suite passes: 8 Vitest files and 40 tests.

Verified implementation areas:

- `lib/domain/types.ts` defines validated events, immutable evidence originals and mutation history, causal nodes/edges, controls, replay records, branches, simulations, and report context.
- `lib/domain/kernel.ts` performs timeline reconstruction, DAG validation, temporal checks, confounder warnings, evidence-dependent hypothesis assessment, intervention eligibility checks, deterministic seeded simulation, and report generation.
- `lib/domain/replay.ts` and `lib/domain/historical.ts` construct knowledge-cutoff snapshots using event knowledge times and evidence mutation cutoffs. Persisted replay hashes and backdated-mutation rejection are enforced by `lib/persistence/sqlite.ts`.
- SQLite migration 2 persists investigations, evidence mutations, graph versions, replays, simulations, branches, exports, ledgers, users, sessions, memberships, trusted keys, checkpoints, retention records, and hash-chained security activity.
- All Phase 5 investigation and security route handlers call server-side authentication, CSRF, role permission, and investigation membership checks. The browser does not supply the authoritative actor identity.
- External anchoring is an explicitly configured filesystem adapter. Ed25519 signatures are verified against a trusted public-key registry; the design does not claim trusted time or remote immutability.
- Backup restore uses authenticated encryption, a clean target, schema validation, atomic rename, and post-restore ledger verification. Retention is logical and approval-backed; secure physical erasure is not implemented.
- The existing Playwright workflow uses explicit demo mode and an isolated temporary database. It covers evidence challenge, deterministic simulation, and historical replay.

## Architectural weaknesses and unresolved limitations

1. Phase 5 has no investigator copilot, structured answer contract, model-provider boundary, prompt-injection test corpus, or human review persistence.
2. Existing evidence payloads are trusted by the domain model as records, but any imported text must be treated as untrusted instructions when used as model context.
3. The current UI presents hypothesis dependencies and replay boundaries, but has no workbench for investigator-authored competing explanations or review-state transitions.
4. Existing route authorization protects investigation data, but no copilot route exists yet; any new retrieval route must preserve the same not-found behavior for unauthorized IDs.
5. Replay persistence protects the original snapshot hash, but a future copilot context builder could accidentally include later evidence unless it is constructed from the persisted replay snapshot rather than the live investigation.
6. The Phase 5 key and backup protections are local filesystem controls. They do not defend against a compromised host, malicious administrator, stolen passphrase, or stolen private key.
7. The security activity log records protected actions, but copilot runs, generated suggestions, and human review decisions are not yet represented as durable investigation records.
8. No external model SDK, API key, remote provider, or paid service is present in the baseline. Optional LLM support must remain disabled by default and must never be required for deterministic functionality.
9. Phase 5's CI has Gitleaks and a supplemental high-confidence pattern scan. GitHub currently reports Node 20/runner deprecation annotations; these are operational maintenance items, not security evidence.

## Phase 6 safety invariants

- The deterministic domain kernel remains authoritative for chronology, evidence status, causal validity, replay cutoffs, and simulation labeling.
- A copilot output is a suggestion or explanation, never an evidence mutation, causal proof, probability, or autonomous action.
- Every substantive claim must carry an investigation ID, authorized evidence references, source identifiers, evidence statuses, chronology, support/contradiction rationale, missing context, uncertainty, mode, provider/model metadata, and applicable knowledge cutoff.
- Context is built only after authorization and only from the selected investigation. Historical mode uses the replay snapshot and excludes later events, evidence, mutations, graph changes, and outcomes.
- Imported evidence and model responses are untrusted data. Deterministic policy rejects fabricated citations and does not treat text instructions inside evidence as commands.
- Human review is explicit, attributable, append-only, and required before adopting a suggested hypothesis, graph change, or recommendation.
