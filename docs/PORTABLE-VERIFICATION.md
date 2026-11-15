# Portable verification

`npm run verify:package -- path/to/package.json` performs offline structural, ledger, semantic, cross-reference, mutation, graph, replay, branch, simulation, copilot citation, review, and manifest checks. Failures use stable codes such as `MUTATION_SET_MISMATCH`, `REPLAY_HASH_MISMATCH`, `COPILOT_CITATION_INVALID`, and `MANIFEST_HASH_MISMATCH`.

An untrusted self-consistent package is not authentic. A checkpoint can be supplied with `--checkpoint` and its public key separately with `--public-key`; embedded keys are never trusted. Even a valid trusted checkpoint does not establish source truth.
