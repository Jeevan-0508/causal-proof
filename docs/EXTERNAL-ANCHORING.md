# External anchoring

## Checkpoint manifest

Each checkpoint contains investigation ID, event count, ledger head hash, checkpoint sequence, database schema version, creation timestamp, key ID, algorithm, and Ed25519 signature. The signature covers the deterministic manifest payload.

`FileAnchorStore` publishes the signed checkpoint atomically to a separately configured directory (`CAUSAL_PROOF_ANCHOR_DIR`). The database stores a copy for discovery, but verification reads the independent file first. A directory beside the database with the same permissions is not an independent trust anchor.

## Verification states

- `externally_anchored`: local chain is valid, the anchored prefix matches, and the trusted key is applicable.
- `anchor_mismatch`: local prefix/count or local chain does not match the checkpoint.
- `signature_invalid`: checkpoint bytes do not verify under the trusted key.
- `unknown_signer`: no trusted public key is registered.
- `missing_anchor`: no checkpoint exists for the investigation.
- `authenticity_unknown`: no anchor directory is configured.

New events after a valid checkpoint do not invalidate the checkpoint; they remain unanchored until a later checkpoint is published. Rollback below the checkpoint count and replacement of the checkpoint prefix are detected.

## Trust limits

The filesystem adapter does not provide trusted time, remote immutability, notarization, or legal admissibility. Operators must protect the anchor root separately, retain prior checkpoints, and use independent object storage or timestamping in a future deployment.
