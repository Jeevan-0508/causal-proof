# Human review workflow

Copilot recommendations begin as `draft_suggestion`. An authorized investigator can record `accepted`, `rejected`, or `needs_more_evidence`. The review stores the reviewer identity, investigation ID, suggestion ID, rationale, and timestamp in SQLite and appends a `copilot.reviewed` event to the investigation ledger.

Review does not alter original evidence, causal edges, graph versions, or controls. Adopting a suggestion is a human workflow decision only; a future implementation must add a separate explicit mutation workflow if a reviewed hypothesis or graph change is to be applied.

Reviewers see the deterministic rationale, evidence IDs, information-value label, risks, limitations, and authorization policy. The UI does not expose a one-click external action. Review history survives restart and is included in portable investigation exports.
