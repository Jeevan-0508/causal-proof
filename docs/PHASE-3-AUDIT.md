# Phase 2 audit for Phase 3

Audit date: 2026-11-15

## Existing invariants

- `EventSchema`, `EvidenceRecordSchema`, `CausalEdgeSchema`, and `InvestigationSchema` validate the Phase 2 fixture at the domain boundary.
- Evidence retains its original payload and hash; challenge, withdrawal, and restore operations append typed history entries.
- `deriveHypothesisAssessments` recalculates active support, active contradiction, missing evidence, source-reliability considerations, and causal status after evidence changes.
- `validateCausalGraph` rejects cycles, unknown references, temporal inversions, missing assumptions, and invalid interventional declarations. Observational edges remain warnings, not causal proof.
- `runBaseline` and `runCounterfactual` are deterministic for a fixed seed and export a canonical input hash plus explicit sensitivity assumptions.
- JSON/CSV import validates size, row count, headers, event schema, timestamps, and attributes.
- Browser coverage exercises evidence challenge/recalculation and seeded simulation comparison.

## Decision-replay gaps

1. Timeline events currently distinguish occurrence and ingestion, but do not model detection time or investigator knowledge time. A historical decision cannot yet be reconstructed without hindsight leakage risk.
2. Evidence has observation time but no explicit availability/knowledge boundary. A challenge made today could be mistakenly treated as available to a past decision.
3. Decision events are ordinary timeline records. There is no decision-point selector, replay snapshot, or strict set of known events, evidence, alerts, and prior decisions.
4. Controls can be simulated, but alternative actions such as escalation, verification, suspension, and continued monitoring are not represented as typed, reproducible decisions.
5. There is no immutable branch record containing the parent investigation, fork point, available information snapshot, chosen alternative, simulation input hash, seed, and result hash.
6. The current report exports chronology, evidence, hypotheses, validation, and one simulation. It has no decision timeline, alternative comparisons, branch comparisons, or decision-quality analysis.
7. PDF export is not implemented. JSON is deterministic when supplied a fixed report timestamp, but there is no binary report artifact path.

## Scientific safeguards to preserve

- Replay must use only knowledge available at the selected decision time. Later observations, evidence, challenges, and analyst conclusions must be excluded and listed explicitly.
- Alternative outcomes must remain simulated and must not be rewritten as historical facts or proven prevented loss.
- Decision quality must be a structured review of information, policy, feasibility, delay, trade-offs, and limitations; no arbitrary score is introduced.
- Branches must copy snapshots and never mutate the parent investigation.
- Existing Phase 2 tests and UI behavior remain regression gates.

## Implementation plan

- Add explicit detection/knowledge timestamps to events and availability timestamps to evidence.
- Add replay, alternative, branch, and decision-quality contracts.
- Implement a pure decision replay kernel with hindsight-leakage checks and deterministic hashes.
- Add branch-aware report context and PDF generation.
- Add a replay workspace with a decision scrubber, availability inspector, alternative selector, and branch comparison.
- Add unit, determinism, branch-isolation, report-integrity, and browser replay tests.
