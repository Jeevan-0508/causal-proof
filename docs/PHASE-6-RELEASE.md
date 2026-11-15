# Phase 6 release notes

## Delivered

- Mandatory Phase 5 baseline audit with verified behavior and unresolved limitations.
- Deterministic evidence-grounded copilot with structured claims, chronology, source identifiers, contradictions, gaps, uncertainty, and no causal probability claims.
- Historical copilot mode using the existing decision replay knowledge cutoff and filtered evidence snapshot.
- Competing-hypothesis comparisons and bounded qualitative next-action recommendations.
- Optional replaceable model-provider interface with explicit enablement/consent, timeout, structured-output, and citation validation; no provider or API key is bundled.
- Prompt-injection data boundary and synthetic adversarial tests.
- SQLite persistence for copilot runs and human reviews, including ledger events, restart recovery, and portable export sections.
- Authenticated, CSRF-protected Investigator Copilot UI with clickable evidence references and review controls.
- Synthetic evaluation harness with explicit denominators and limitations.

## Verification

```text
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
npm audit --audit-level=high
```

No public deployment, package publication, external model call, or autonomous action is enabled.

## Known limitations

The deterministic evaluator is a small synthetic fixture. Prompt-injection defenses are not complete. Optional LLM mode is an interface only and remains disabled in the baseline route. Citation validation checks scope and identifier validity, not evidence truth. The copilot cannot establish causation, probability, intent, legal findings, or historical outcomes.
