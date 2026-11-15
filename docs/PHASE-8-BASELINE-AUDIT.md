# Phase 8 baseline audit

Baseline audited: `9aaa0e44ec13baea374b9b72f20f42f98008c1dd` (latest fetched `origin/main`, Phase 7 merge). The audit was performed before Phase 8 edits. Existing untracked `AGENTS.md` and `docs/CODEX-OMEGA-INTEGRATION.md` are preserved and are not part of this change.

## What is already strong

- `lib/persistence/sqlite.ts` validates domain records, evidence hashes, causal graph edits, immutable replay bindings, branch bindings, and append-only ledger state.
- `lib/domain/historical.ts` reconstructs evidence status and mutation visibility at a knowledge cutoff. `lib/domain/replay.ts` excludes later events and evidence from decision replays.
- `lib/copilot/deterministic.ts` produces cited claims and rejects unsupported evidence references; the API requires authentication, membership, CSRF for writes, and `copilot.review` for human review.
- `lib/persistence/package.ts` exports a portable JSON package with section hashes, a ledger head, and explicit scientific limitations. The PDF renderer marks simulations as non-historical.
- Phase 7 graph revisions, timeline clocks, competing hypotheses, branches, and replay artifacts are persisted rather than held only in browser state.

## Phase 8 gaps and hidden assumptions

1. **Reports are client-authoritative.** `app/page.tsx:135-153` calls `exportReport` using browser state for simulation, replay, branches, and decision-quality data. A caller can alter the downloaded report without changing persisted records. The package endpoint is server-generated, but JSON/PDF reports are not.
2. **Report provenance is incomplete.** `lib/domain/kernel.ts:225-241` emits a fixed summary and limitations but has no canonical payload hash, server generation metadata, integrity status, cutoff selection, graph revision identity, or copilot/review provenance.
3. **Historical reconstruction is not end-to-end.** `replayDecisionPoint` reconstructs evidence at a decision knowledge time, but graph versions, copilot runs/reviews, branches, report summaries, and the timeline cutoff selector are not all filtered by the same server-selected cutoff. Later graph state can therefore be displayed beside an earlier replay.
4. **Portable verification is mostly hash/shape validation.** `verifyInvestigationPackage` validates schema and ledger links, but does not comprehensively validate graph version content, replay recomputation, simulation input/result bindings, branch/replay bindings, copilot citations, review references, mutation ordering, or the distinction between consistency and trusted authenticity. `scripts/verify-package.mjs` duplicates a still smaller subset and trusts no explicit offline checkpoint/key because that contract does not exist yet.
5. **Unkeyed tamper resistance is overstated unless semantics are checked.** An attacker who edits data and recomputes section hashes can pass the current manifest checks if the edited data remains schema-valid. The verifier must reject semantic inconsistencies even when hashes are recomputed, and must clearly report that unanchored consistency is not authenticity or source truth.
6. **Synthetic demo isolation is not fail-closed.** `app/api/auth/demo/route.ts:11-23` requires a demo-mode flag, but uses the ordinary database and key/anchor configuration. It only detects a collision for the demo ID; it does not require a dedicated demo database, identity namespace, key path, anchor path, or prove that ordinary investigations are absent.
7. **Evidence drawer accessibility is incomplete.** `app/page.tsx:311-319` has dialog semantics but no initial focus, focus containment, Escape handling, focus restoration, or explicit live-region error/status behavior. The repository intentionally does not claim WCAG conformance.
8. **Review workflow is decision-only.** `copilot_reviews` records a final reviewer decision, but there is no immutable assignment/queue/reassignment record, assigned reviewer, assignment rationale, or queue filtering endpoint.
9. **Diagnostics are fragmented.** Integrity, security activity, anchors, keys, backup, and retention are exposed through separate controls; there is no non-secret operational readiness summary or failure-injection/recovery report.
10. **Performance evidence is absent.** There is no reproducible synthetic fixture size matrix or measurement script for report/package verification, historical reconstruction, or graph validation.

## Baseline verification evidence

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `npm test`: 51/52 tests passed; the existing rate-limit test timed out at the default 5s and its temporary SQLite directory cleanup reported Windows `EPERM`. This is recorded as a baseline flake and must be resolved or explicitly documented before release.
- Phase 7 reported Playwright and high-severity dependency checks passing; Phase 8 reruns them after implementation.

## Scientific boundary

The system organizes evidence and evaluates explicitly specified causal structures and simulations. Neither a consistent hash chain, a signed receipt, a report, nor a copilot answer establishes that a source is truthful or that observational evidence proves causation. Phase 8 therefore treats server authority, historical cutoff correctness, package consistency, trusted checkpoints, authenticity, and source truth as separate statuses.
