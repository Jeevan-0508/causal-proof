# Phase 7 Baseline Audit

## Scope and revision

This audit starts from the freshly fetched `origin/main` revision `f18c1a7` (the
merged Phase 6 evidence-grounded investigator copilot). The Phase 7 branch is
`codex/phase-7-workbench`. The untracked user-owned files `AGENTS.md` and
`docs/CODEX-OMEGA-INTEGRATION.md` are intentionally outside this change.

## Existing capabilities

- The pure TypeScript domain model validates events, evidence provenance,
  causal nodes and edges, intervention assumptions, deterministic simulations,
  decision replays, and evidence-status propagation.
- Causal validation rejects unknown references, temporal inversions, cycles,
  missing identification assumptions, and invalid interventional edges. It
  warns when observational evidence is being interpreted causally.
- Evidence mutations are append-only in the record, retain original payload
  hashes, and are blocked from silently rewriting persisted historical replays.
- Replay snapshots contain a knowledge cutoff, known and hindsight-excluded
  records, graph/control hashes, and explicit assumptions.
- Counterfactual branches retain parent identity, snapshot/input/result hashes,
  seed, and immutable-parent semantics. The simulation kernel is deterministic
  and explicitly illustrative.
- Copilot runs are investigation-scoped, citation-validated, deterministic by
  default, historical-cutoff aware, and subject to human review persistence.
- SQLite persistence creates graph versions on each saved investigation,
  retains ledger events, and exports independently verifiable packages.
- API routes enforce session authentication, CSRF on writes, permission checks,
  and investigation membership isolation.
- The existing UI provides timeline, evidence challenge, causal assessment,
  replay, counterfactual, library, copilot, and security modules in a premium
  dark visual language.

## Gaps found

1. The causal graph view is a static SVG. It does not create, edit, connect,
   disconnect, or restore graph revisions, and it cannot attach evidence or
   intervention nodes through an audited mutation workflow.
2. Graph history is stored but has no read/restore route or explicit revision
   metadata in the interface. A full-investigation PUT is too broad for a
   graph-studio mutation and makes the intent of a revision less visible.
3. The chronology primarily renders occurrence time and ingestion lag. It does
   not expose detection, availability, investigator-knowledge, and mutation
   clocks together or filter the replayable knowledge boundary interactively.
4. Hypothesis cards show dependencies but lack a multi-select comparison view
   that highlights shared evidence, contradictions, confounders, review state,
   and historical availability side by side.
5. The counterfactual lab runs deterministic scenarios but does not provide a
   branch comparison surface or a compact export of reproducibility metadata.
6. The synthetic demo is implicit in demo mode and does not guide an
   investigator through the complete workflow. It must remain isolated from
   ordinary investigations and must never weaken API authorization.
7. Reports already include chronology, evidence, hypotheses, replay context,
   simulations, and limitations, but the UI does not clearly expose the
   workbench's graph revision and human-review context as a professional report
   package.
8. The current UI has limited explicit focus management and no Phase 7
   accessibility measurement or reduced-motion contract beyond ordinary HTML
   controls.

## Risks and decisions

- The domain model remains authoritative. UI editing will construct a complete
  candidate graph and send it to a narrow authenticated graph endpoint; the
  server will run the same schema, uniqueness, DAG, temporal, evidence,
  intervention, and causal-validity checks before inserting a new immutable
  version.
- Restoring a graph means creating a new audited revision from an old version;
  it never deletes or overwrites history.
- Historical filters will use `knowledgeAt`/`detectedAt`/`ingestedAt` and
  `availableAt` through the replay engine. Filtering is not a visual-only
  operation.
- All new demo content is synthetic and uses the existing authenticated demo
  identity. No new anonymous API path or external dependency is introduced.
- Performance measurements will be reported as local observations from the
  existing synthetic fixture, not as generalized benchmarks.

## Baseline verification

The Phase 6 baseline was verified before implementation with the repository's
unit tests, typecheck, production build, Playwright workflow, dependency audit,
and CI. Phase 7 will preserve those checks and add graph mutation, history,
timeline cutoff, comparison, review, isolation, accessibility, and demo-flow
coverage.
