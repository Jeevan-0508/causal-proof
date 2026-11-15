# CAUSAL//PROOF Phase 3 release summary

## Delivered

- Reproducible decision-point replay with occurrence, detection, ingestion, and knowledge-time boundaries.
- Explicit exclusion of later events and evidence to prevent hindsight leakage.
- Five typed decision alternatives evaluated through the existing deterministic simulation engine.
- Immutable branch records carrying the parent investigation, fork point, decision-time snapshot, seed, input hash, result hash, and replay hash.
- Structured decision-quality analysis covering information state, policy requirements, feasibility, response delay, trade-offs, and evidence limitations without arbitrary scoring.
- JSON and PDF report export with chronology, evidence, hypotheses, replay metadata, branches, and scientific limitations.

## Synthetic demonstration

The Northstar lane fixture remains synthetic and totals €240,000 in transaction exposure. At the 10:29 UTC manual-review decision, the replay includes only the knowledge available at that time. The later final transfer and post-decision evidence are explicitly excluded.

## Verification evidence

- Unit/integration tests cover graph validity, evidence propagation, import validation, report reproducibility, replay leakage, timestamp rejection, branch isolation, and deterministic alternatives.
- Playwright covers evidence challenge/recalculation, counterfactual simulation, and decision replay.
- Production build and dependency audit are required release gates.

## Limitations

The browser application remains local and in-memory. PDF output is a readable generated report, not a signed legal record. Simulations are illustrative counterfactuals, not identified causal effects or proven prevented losses. A production release still needs durable persistence, authorization, signed provenance, retention controls, and independent audit review.

## Next milestone

Phase 4 should add SQLite-backed append-only event history, investigation isolation, durable branch storage, signed provenance hooks, richer graph editing, and accessibility automation.
