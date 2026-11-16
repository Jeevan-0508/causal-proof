# Phase 9 — public showcase architecture

Status: implementation candidate on `codex/phase-9-public-showcase`
Target: static GitHub Pages artifact at `/causal-proof/`
Data policy: synthetic fixture only

## Boundary

The full-stack investigator remains in `app/` and continues to use authenticated
Next.js route handlers, SQLite, security stores, signing keys, backups, and
server-authoritative reporting. It is not part of the public artifact.

The public showcase is a separate Vite entry point under `showcase/`. Its only
domain imports are:

- `lib/domain/types.ts`
- `lib/domain/canonical.ts`
- `lib/domain/demo.ts`
- `lib/domain/historical.ts`
- `lib/domain/kernel.ts`
- `lib/domain/replay.ts`
- `lib/domain/workbench.ts`

These modules are pure browser-safe logic plus Zod and `js-sha256`. The
showcase does not import `lib/persistence`, `lib/security`, `lib/copilot`,
`app/api`, SQLite, Node filesystem APIs, signing-key code, backup code, or
administrative/authentication code.

The boundary is enforced by `scripts/verify-showcase.mjs`, which scans source
imports and every emitted artifact for privileged module paths, database/key
configuration, private-key markers, and private API paths.

## Public interactions

- Forensic timeline: occurrence, ingestion, availability, and knowledge clocks.
- Knowledge cutoff: decision-time historical replay with later rows excluded.
- Graph inspection: nodes, hypotheses, warnings, assumptions, and causal status.
- Hypothesis comparison: shared support, contradictions, and unresolved gaps.
- Evidence inspection: provenance, original payload, integrity hash, challenge,
  withdrawal, restore, and dependent reassessment.
- Counterfactual sandbox: explicit control, seed, and sensitivity inputs with
  deterministic baseline/intervention comparison.
- Decision alternatives: bounded scenario results labeled as non-historical.

All actions are in-memory browser interactions. No public control can mutate the
private investigator database or call an API.

## Scientific boundary

The showcase makes no probability, authenticity, legal, or causal-certainty
claim. Observational edges remain warnings or plausible/unidentifiable
assessments. Simulated loss differences are illustrative model outputs; the UI
exposes assumptions, seed, sensitivity, and the `historicalFact: false`
boundary for decision alternatives.

## Build contract

```text
npm run build:showcase
npm run verify:showcase
npm run hash:showcase
```

The Vite base path is `/causal-proof/`. The output is `out/showcase`, which is
the only directory uploaded by the manual Pages workflow.
