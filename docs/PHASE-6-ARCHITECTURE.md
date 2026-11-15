# Phase 6 architecture

```text
authenticated investigator
        |
        v
copilot route -> auth + CSRF + membership + rate limit
        |
        +--> replayDecisionPoint -> snapshotAtDecision (historical mode)
        +--> deterministic rules -> grounded claims + comparisons + recommendations
        +--> optional ModelProvider (disabled unless enabled + consented)
        +--> Zod citation/output validation
        +--> SQLite copilot_runs / copilot_reviews
        +--> per-investigation ledger events and security activity
```

The deterministic service is `lib/copilot/deterministic.ts`. It consumes an authorized `Investigation`, existing kernel assessments, and optionally a replay snapshot. It does not call a model, infer a probability, mutate evidence, or execute recommendations.

`lib/copilot/provider.ts` defines the optional provider boundary. A provider receives only a bounded, untrusted evidence context and a policy string. The route does not instantiate a provider; the baseline deployment returns a clear disabled response for LLM mode. A future provider must require explicit configuration and operator consent, time out, return structured output, and pass citation validation.

Copilot runs and reviews are persisted in migration 3. Runs store the exact structured answer, input hash, replay identifiers, provider metadata, and generation time. Reviews store reviewer identity, decision, rationale, and time. Original evidence remains in the existing immutable evidence/mutation model.

Packages include optional copilot run and review sections. Older packages without those sections remain verifiable; new exports hash the additional sections in the integrity manifest.

The copilot does not claim trusted time, source truth, causal identification, or autonomous investigation. Optional model output is always a suggestion subject to deterministic citation checks and human review.
