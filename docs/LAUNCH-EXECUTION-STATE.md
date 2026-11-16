# CAUSAL//PROOF launch execution state

Last audited: 2026-11-16T11:18:24+01:00
Repository: `Jeevan-0508/causal-proof`
Branch: `main`
HEAD: `bc519499d78bf8520ea15c28e1fd6b89b5426322`
Remote: `https://github.com/Jeevan-0508/causal-proof`
Current work: `codex/phase-10-release-candidate` (local, awaiting PR/CI)
Release candidate source commit: `36603c14f8dcf7bd9e103de651751ae79a2a2a92`
Status: **READY_FOR_DEPLOYMENT_APPROVAL — NOT LAUNCH_COMPLETE**

## Highest-priority unfinished gate

The Phase 9 static showcase is merged, and the Phase 10 release candidate is
being hardened with an offline rollback rehearsal. Explicit publication
approval and external live verification remain outstanding.

The proposed GitHub Pages URL is `https://jeevan-0508.github.io/causal-proof/`.
It is a destination proposal, not a verified live website. The repository's
full-stack investigator remains private and is not part of the static artifact.
No deployment was attempted.

Exact next action: explicitly approve dispatching the manual GitHub Pages
workflow, then perform the external verification checklist. Do not dispatch it
from this operation without that approval.

## Repository and publication state

- `main` is current with `origin/main`; no tracked code changes were present at
  the start of this audit.
- Pull requests #1 through #6 are merged; there are no open pull requests.
- Phase 8 merge: PR #5, `45406b1`; cutoff correctness follow-up: PR #6,
  `bc51949`.
- Latest main CI: run `43771928369`, successful:
  <https://github.com/Jeevan-0508/causal-proof/actions/runs/43771928369>
- PR #5 CI: run `43771154989`, successful.
- PR #6 CI: run `43771714132`, successful.
- Repository is public and declares Apache-2.0 licensing. No package
  publication or public deployment was performed.
- User-preserved untracked files `AGENTS.md` and
  `docs/CODEX-OMEGA-INTEGRATION.md` were not modified or staged.
- Phase 9 static showcase files are local on the feature branch; the manual
  Pages workflow is prepared but has not been dispatched. PR #7 is merged.

## Local verification evidence

All checks below were run against the current `main` commit on 2026-11-16:

- `npm.cmd ci` — PASS; 173 packages installed, 0 audit vulnerabilities.
  The first attempt reproduced a Windows `EPERM` on the Next.js overlay
  directory because a failed npm process retained the directory. That process
  was stopped, the command was rerun, and it passed.
- `npm.cmd run lint` — PASS; static hygiene lint covered 70 source files.
- `npm.cmd run typecheck` — PASS.
- `npm.cmd test` — PASS; 11 files, 55 tests.
- `npm.cmd test` after Phase 9 changes — PASS; 12 files, 58 tests.
- Targeted disproof suite (`kernel`, `replay`, `copilot`, `auth-api`,
  `phase8`, `security`) — PASS; 6 files, 34 tests.
- `npm.cmd run build` — PASS; production build completed and all application
  routes compiled.
- `npm.cmd run test:e2e` — PASS; 8 Playwright tests with one worker.
- `npm.cmd audit --audit-level=high` — PASS; 0 vulnerabilities.
- `npm.cmd run measure:phase8` — PASS; synthetic cutoff/hash measurements
  completed for 10, 100, and 1,000 records. These are not production SLOs.
- `npm.cmd run build:showcase` — PASS; 3-file Vite artifact emitted at
  `out/showcase` with base path `/causal-proof/`.
- `npm.cmd run verify:showcase` — PASS; source-import and artifact scans found
  no privileged modules, database/key configuration, private-key markers, or
  private API paths.
- Showcase unit tests — PASS; 3 tests.
- Showcase Playwright tests — PASS; 4 tests, including cutoff, evidence
  challenge, deterministic sensitivity, mobile overflow/focus, and hash
  deep-link checks.
- Showcase artifact identity — `074653a687b4643b0ffbfdad1eb874aff3c7d74c8ac7daa6073bb047b316f1a8`
  from `npm.cmd run hash:showcase`.
- `npm.cmd run test:pages:rollback` — PASS; this
  rehearses selecting a failed candidate and restoring a known-good static
  artifact without touching source or private data.
- High-confidence secret scan excluding dependencies, generated output, and
  the two preserved instruction files — PASS; no credential patterns found.
- `npm.cmd run verify:package -- package.json` — expected negative PASS; the
  standalone verifier rejected the invalid input with structured package,
  section, schema, manifest, and checkpoint errors. A positive CLI run still
  requires an exported `.causalproof.json` artifact; the semantic positive and
  tamper paths are covered by the Phase 8 tests.

## Correctness, security, and scientific disproof attempts

- DAG cycle, temporal inversion, unsupported interventional evidence, and
  unsupported established causal status were rejected by tests.
- Evidence withdrawal, contradictory evidence, missing evidence, and
  dependent-conclusion recalculation were exercised.
- Prompt-injection evidence remained untrusted; fabricated citations and
  cross-investigation evidence were rejected.
- Authentication, authorization, CSRF, rate limiting, encrypted backup,
  anchor mismatch, retention, and investigation isolation tests passed.
- Historical replay/copilot cutoff tests excluded later evidence and events;
  the Phase 8 cutoff correction is present in `bc51949`.
- Deterministic simulation/replay and report reproducibility tests passed.
- The application continues to distinguish evidence support from causal
  certainty; observational evidence is not presented as proof of causation.
- Remaining scientific limitations are documented in the repository's Phase 8
  reports and are not release claims of legal admissibility, enterprise-grade
  identity assurance, or statistically identified causal effects.

## Outstanding blockers

1. Phase 10 rollback rehearsal PR/CI is pending.
2. Explicit publication approval is missing; the manual Pages workflow has not
   been dispatched.
3. No live URL exists yet for external smoke, base-path, artifact, and
   accessibility verification.
4. A positive standalone CLI verification run needs a real exported package
   artifact if that is required by the private-app release operator; no export
   artifact is present in the repository.

Until the Phase 10 PR/CI/merge, approved workflow dispatch, and external
verification are resolved, the launch state must remain
**READY_FOR_DEPLOYMENT_APPROVAL**, not `LAUNCH_COMPLETE`. No claim of public
availability is authorized.
