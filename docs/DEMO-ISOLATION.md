# Synthetic demo isolation

The demo route is fail-closed unless non-production `CAUSAL_PROOF_DEMO_MODE=true` and explicit `CAUSAL_PROOF_DEMO_DB_PATH`, `CAUSAL_PROOF_DEMO_KEY_DIR`, and `CAUSAL_PROOF_DEMO_ANCHOR_DIR` values are present. They must equal the process paths, visibly contain `demo`, and be separate from ordinary operator configuration. The demo identity must be a dedicated lead investigator and the database may contain only the synthetic investigation.

Run the walkthrough in a dedicated local process and delete/reset only that dedicated demo database when reseeding. The route is not a deployment mechanism and is disabled in production.
