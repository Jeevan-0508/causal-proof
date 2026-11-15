# Phase 8 architecture

The browser requests a report selector (`format`, optional decision point). The server authenticates the session, checks investigation membership and `investigation.export`, loads SQLite state, verifies the local ledger, reconstructs the selected historical cutoff, selects the graph revision effective at that cutoff, filters persisted replays/branches/copilot artifacts/reviews, and generates JSON or PDF. The browser never supplies report content.

The report has a stable canonical payload hash and volatile generation metadata. Integrity consistency, trusted checkpoint status, authenticity, and source truth are separate fields. A consistent report is not evidence that a source is truthful or that observational evidence proves causation.
