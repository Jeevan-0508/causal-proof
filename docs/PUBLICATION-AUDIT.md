# Public GitHub publication audit

Audit date: 2026-11-15
Destination: `https://github.com/Jeevan-0508/causal-proof`

## Identity and destination

- `gh auth status` succeeded for the authenticated `Jeevan-0508` account.
- `gh api user --jq .login` returned `Jeevan-0508`.
- `gh repo view Jeevan-0508/causal-proof` confirmed the destination was absent before publication.
- The local checkout had no remote and no commits before release preparation.

## Content and licensing review

- The fixture is synthetic logistics-fraud data; it contains no customer records, employee identities, Amazon data, or proprietary telemetry.
- The repository contains source, documentation, tests, configuration, and one Apache-2.0 license. No images, binaries, local databases, or debug logs are present.
- The README and scientific limitations document state that simulations are not proof of causal effects and that SHA-256 is not authenticity.
- `AGENTS.md` is a workspace instruction file and is intentionally excluded from the public commit.

## Secret and privacy review

- Gitleaks was not installed locally, so no unverified scanner was downloaded.
- A repository-wide regex scan excluding generated dependencies found no API keys, tokens, passwords, private-key blocks, or credential assignments.
- No `.env`, database, credential, session, or debug-log files were found outside ignored generated directories.
- No absolute Windows user paths were found in publishable Markdown.
- Git history contained no commits before the initial release commit.

## Hygiene controls

`.gitignore` excludes `node_modules`, `.next`, `out`, Playwright artifacts, environment files, local database files, credential files, temporary files, and logs while preserving `.env.example` if added later.

## Verification gate

The release gate requires `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run build`, `npm run test:e2e`, and `npm audit` to pass before pushing `main`. The first remote CI attempt exposed a Vite peer-resolution mismatch with `@types/node` 20.16.5; the dependency was raised to 22.15.0 in a normal follow-up commit before retrying CI. The exact final results are recorded in the publication report and must not be inferred from this document alone.
