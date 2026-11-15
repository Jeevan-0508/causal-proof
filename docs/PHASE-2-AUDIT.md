# Phase 1 audit

Audit date: 2026-11-15

Scope: `app/page.tsx`, `lib/domain/kernel.ts`, `lib/domain/types.ts`, `lib/domain/demo.ts`, `tests/kernel.test.ts`, and `README.md`.

## Findings

### 1. Timeline conflict detection was unreachable

`reconstructTimeline` sorted events before comparing each event with its predecessor. That makes the previous event's timestamp never later than the current event, so `timestamp_conflict` could not be emitted for out-of-order records. It also did not flag ingestion before event time. Phase 2 now checks the event/ingestion relationship after deterministic sorting and flags negative lag.

### 2. Evidence changes were not append-only

The old `challengeEvidence` function changed status and appended a string, but had no immutable original payload, original hash, mutation identity, timestamp, withdrawal path, or restore path. There was no before/after conclusion record. Phase 2 adds original payload/hash fields and typed mutation history, with challenge, withdrawal, and restore operations.

### 3. Dependencies were descriptive, not executable

Evidence IDs were displayed on edges, but unknown references, missing evidence, cycles, temporal order, and unsupported edges were not validated. The old `affectedHypotheses` function returned IDs only; it did not recompute the conclusion represented by each edge. Phase 2 introduces graph validation and derived hypothesis assessments that recalculate active support, contradiction, missing evidence, and causal status.

### 4. Contradiction semantics were ambiguous

`EvidenceRecord.contradicts` was used in the demo to point at `edge-3`, even though its name and location suggested evidence-to-evidence relationships. Phase 2 separates `contradictsEvidenceIds` on evidence records from `contradictingEvidenceIds` on hypotheses and includes an explicit contradictory evidence pair in the synthetic fixture.

### 5. Causal language was too strong

The UI labeled every non-temporal edge “CAUSAL INTERPRETATION”, even when the data was observational and one edge had challenged evidence. The prior model had no source reliability, missing evidence, identification assumptions, causal status, or evidence mode. Phase 2 derives `established`, `plausible`, or `unidentifiable` and explicitly downgrades observational-only claims.

### 6. Simulation uncertainty was undocumented

The prior simulator applied sine-based noise and a friction-derived spread without an exported model input or declared sensitivity meaning. That made replay possible but did not make the model scientifically traceable. Phase 2 uses explicit analyst-declared basis-point sensitivity and seed variance, hashes the complete input, exports baseline and intervention inputs, and labels all results illustrative simulations.

### 7. Scenario arithmetic and reporting had misleading edges

The fixture's transaction amounts totalled €170,000 while the interface and causal outcome stated €240,000. The fixture now totals €240,000. `exportReport` also used the current clock by default, defeating byte-for-byte reproducibility; it now uses a stable default timestamp and accepts an explicit timestamp when a live report timestamp is desired.

### 8. Coverage gaps

Phase 1 had no import parser or import validation tests, no graph invariant tests, no withdrawal/restore tests, no report replay test, no sensitivity test, no browser E2E suite, and no CI workflow. These are added or staged in Phase 2.

### 9. Persistence boundary

The current application remains an in-memory client demo. SQLite, a durable append-only event log, authentication, and a trust model are not silently implied by the UI. They remain Phase 3/production work and are stated as limitations.
