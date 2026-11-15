# Scientific limitations

CAUSAL//PROOF is an evidence organization and scenario analysis tool. It is not a causal oracle.

- Observational evidence does not by itself identify a causal effect. The engine marks observational hypotheses as plausible at most and emits a warning.
- `established` is reserved for hypotheses with interventional evidence and no active contradiction. The synthetic investigation contains no established causal hypothesis.
- A confidence label is not a probability, posterior, or proof strength. Source reliability is a structured consideration record, not a calibrated score.
- Missing evidence, active contradictory evidence, and unresolved confounders downgrade or warn on a hypothesis. They do not get averaged away.
- Simulation sensitivity ranges are explicit analyst-declared ranges. They are not empirical confidence intervals and should not be reported as statistical uncertainty.
- Seeds make a scenario replayable; they do not make the model true. The seed variance parameter is illustrative model variation, not an estimated stochastic process.
- A baseline is a replay of synthetic observed transaction amounts. An avoided-loss value is simulated exposure difference, never proven prevented loss.
- SHA-256 hashes provide tamper evidence for the canonical payload presented to the application. Without signatures, identity binding, and a chain-of-custody trust model, they do not establish authenticity.
- The browser view is backed by local SQLite through Node API routes in the default app, but this is not multi-user security. Production use still requires authentication, authorization, retention policy, signed provenance, independent audit controls, and operational backup/recovery.
- The scenario is synthetic and contains no Amazon data, customer records, employee identities, or proprietary operational telemetry.
