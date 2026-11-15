# GitHub publication instructions

Confirmed destination for the public release:

- Owner: `Jeevan-0508`
- Repository: `causal-proof`
- Visibility: public
- Target branch: `main`
- URL: https://github.com/Jeevan-0508/causal-proof

The destination was checked before publication and was absent. The authenticated GitHub CLI account matched `Jeevan-0508`. Publication uses the existing local project contents; it does not add a second README or license, force-push, change visibility, or publish an npm package.

For a future clean checkout:

```bash
gh repo create Jeevan-0508/causal-proof --public --source=. --remote=origin
git push -u origin main
gh repo view Jeevan-0508/causal-proof --json name,url,visibility,defaultBranchRef
```

GitHub Pages is not enabled automatically. This Next.js application should use a Node-capable host unless a separately verified static export is introduced. Do not claim deployment success without a verified deployment URL and completed build.
