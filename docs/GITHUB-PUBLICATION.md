# GitHub publication instructions

Confirmed destination for the public release and Phase 5 pull request:

- Owner: `Jeevan-0508`
- Repository: `causal-proof`
- Visibility: public
- Target branch: `main`
- URL: https://github.com/Jeevan-0508/causal-proof

The destination is an existing public repository with Apache-2.0 licensing and `main` as its default branch. The authenticated GitHub CLI account matches `Jeevan-0508`. Phase 5 must be pushed to a `codex/phase-5-trusted-workspace` feature branch and reviewed through a pull request; do not force-push, publish an npm package, or deploy from this workflow. Merge only after the required CI checks are green.

For this phase:

```bash
git push -u origin codex/phase-5-trusted-workspace
gh pr create --base main --head codex/phase-5-trusted-workspace \
  --title "Phase 5: trusted investigation workspace" \
  --body-file docs/PHASE-5-RELEASE.md
gh pr checks --watch
gh pr merge --squash --delete-branch
```

Verify the merged commit and default-branch checks after the merge. If a clean checkout is needed later, use the existing repository rather than creating a second destination.

For a future clean checkout:

```bash
gh repo create Jeevan-0508/causal-proof --public --source=. --remote=origin
git push -u origin main
gh repo view Jeevan-0508/causal-proof --json name,url,visibility,defaultBranchRef
```

GitHub Pages is not enabled automatically. This Next.js application should use a Node-capable host unless a separately verified static export is introduced. Do not claim deployment success without a verified deployment URL and completed build.
