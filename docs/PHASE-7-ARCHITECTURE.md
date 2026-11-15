# Phase 7 Architecture

Phase 7 adds workbench behavior around the existing pure domain kernel. The
browser creates candidate graph state; `POST /api/investigations/:id` checks
session, CSRF, membership, optimistic parent version/hash, Zod shape, unique
identities, DAG validity, temporal order, evidence references, intervention
eligibility, and control targets before persistence. A successful save creates a
new graph version and `graph.versioned` ledger event. Restore is therefore
restore-as-new-revision, never overwrite.

The forensic timeline is derived from event, evidence, and mutation clocks. A
historical cutoff excludes records in the domain-derived row set and is aligned
with replay knowledge boundaries. Hypothesis comparison is categorical and
evidence-based. The synthetic walkthrough is a UI workflow over the existing
authenticated synthetic investigation; it does not add an anonymous data path.

The original SQLite ledger, replay hashes, branch metadata, copilot citations,
security activity, package manifest, and scientific limitations remain the
authoritative integrity boundaries.
