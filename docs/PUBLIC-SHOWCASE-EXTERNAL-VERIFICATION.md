# Public showcase external verification

Run only after explicit publication approval and a successful Pages workflow.
The proposed URL is `https://jeevan-0508.github.io/causal-proof/`; it is not a
verified live URL until this checklist is completed.

## Browser checks

- Open the exact URL in a clean desktop browser and reload it directly.
- Open the same URL in a mobile viewport and reload it directly.
- Confirm CSS and JavaScript load from `/causal-proof/` without 404s.
- Confirm the page identifies itself as a static/no-backend synthetic showcase.
- Inspect the browser console and network panel for errors or private `/api/`
  requests.
- Confirm the timeline cutoff excludes later rows and exposes the decision
  boundary.
- Inspect graph nodes and hypothesis warnings.
- Compare two hypotheses and observe shared/differentiating evidence.
- Challenge, withdraw, and restore an evidence record; confirm the dependent
  status changes are shown and the history is retained in the session.
- Run a fixed-seed simulation twice and confirm identical output; change the
  seed or sensitivity and confirm the output changes.
- Select a decision alternative and confirm it is labeled simulated and
  `historical fact: false`.
- Use keyboard-only navigation, visible focus, form labels, and Escape-free
  operation; verify no content is clipped at 390px width.

## Integrity checks

- Compare the deployed release commit and artifact hash with the launch state.
- Confirm no database, authentication, signing-key, backup, administrative, or
  private API content is present in the downloaded public artifact.
- Save the URL, UTC verification time, browser/version, workflow run ID, and
  pass/fail result as the external verification record.
