# Prompt-injection tests

Synthetic evidence tests cover these attack classes:

- role override and instruction replacement;
- system-prompt, secret, private-key, and session-token extraction;
- external or cross-investigation exfiltration requests;
- fabricated citation and cross-investigation model output;
- unauthorized evidence modification requests;
- hindsight leakage through historical questions.

Deterministic protections are enforced by code: authorization precedes retrieval, context records are marked untrusted, instruction-like text is flagged but never executed, output citations must reference authorized IDs, request size is bounded, and historical output is built from the replay snapshot.

Probabilistic protections are intentionally not claimed. Pattern detection cannot detect every novel attack, and a future model may still be manipulated by benign-looking content. No model response can authorize a tool call or mutate evidence; all proposed actions remain human-reviewed suggestions.
