# GitHub Pages rollback runbook

Rollback target: the last reviewed showcase release commit and its recorded
artifact hash.

## Fast rollback

1. Stop the current Pages workflow if it is still running.
2. In Actions → **GitHub Pages showcase**, select the last known-good commit
   or tag and dispatch the workflow manually.
3. Verify the deployment completes and the Pages URL serves the expected
   `index.html` and base-path assets.
4. Re-run the external smoke, interaction, artifact-boundary, and console
   checks. Record the rollback run ID and hash.

## Disable publication

If no known-good artifact is available, disable the Pages source in repository
Settings → Pages and preserve the failed run logs. Do not replace the site with
an unreviewed local build.

## Source correction

Create a focused fix branch from the release commit, add a regression test for
the failure, run the complete release suite, and merge only after review. Never
rewrite the historical release record or reuse a changed artifact hash.
