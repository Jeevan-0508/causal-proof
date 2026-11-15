# Copilot trust model

## Grounding contract

Every generated claim carries the investigation ID, real evidence references, source identifiers, evidence status, observation and availability chronology, support and contradiction rationale, missing context, uncertainty, mode, provider/model metadata, and knowledge cutoff. The deterministic engine only emits references found in the authorized investigation.

An evidence ID is not a citation merely because it appears in a hypothesis field. Historical mode filters references against the replay snapshot, so later evidence cannot appear as a known dependency. A claim without sufficient evidence is described as unresolved rather than filled with an invented source.

## Trust boundaries

- Evidence, imported documents, and provider responses are untrusted data.
- Authentication, membership, and permission checks run before retrieval.
- The copilot has no access to private keys, backup passphrases, session tokens, or unrelated investigations.
- Recommendations are `autonomousExecution: false` and require an attributable human review.
- LLM mode is disabled by default. If enabled in a future deployment, the UI must disclose that evidence may leave the local environment.

## What remains probabilistic

Prompt-injection detection is pattern-based and can miss novel attacks or flag benign text. A future model may still misunderstand correctly cited evidence. Citation validation proves identifier scope, not source authenticity or truth. These limitations are logged and must not be presented as solved by the copilot.
