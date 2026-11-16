# GitHub Pages deployment runbook

This runbook is intentionally manual. The workflow is prepared but must not be
dispatched without explicit publication approval.

## Preflight

1. Confirm the release commit is the intended reviewed commit.
2. Confirm `main` CI is green and the Phase 9 showcase checks are green.
3. Run `npm run build:showcase`, `npm run verify:showcase`, and
   `npm run hash:showcase`; retain the artifact hash.
4. Confirm the output contains synthetic showcase files only and no `.data`,
   database, private-key, credential, or private API content.
5. Confirm the repository Pages source is GitHub Actions and the environment
   protection rules/approvers are configured by the repository owner.

## Activation

1. Open Actions → **GitHub Pages showcase**.
2. Select the approved release ref and choose **Run workflow**.
3. Confirm the `github-pages` environment approval if required.
4. Wait for `configure-pages`, artifact upload, and `deploy-pages` to pass.
5. Record the deployment URL, deployment run ID, release commit, and artifact
   hash in the launch state.

## Post-deployment verification

Run the checks in `docs/PUBLIC-SHOWCASE-EXTERNAL-VERIFICATION.md` from a clean
browser session and from a mobile viewport. A successful workflow alone is not
external verification.

## Abort criteria

Do not accept the release if the site exposes a private API path, a database or
credential marker, a broken base path, a blank route, stale assets, a console
error, or a failed accessibility interaction. Use the rollback runbook.
