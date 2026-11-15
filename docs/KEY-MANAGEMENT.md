# Key management

## Implemented provider

`LocalFileKeyProvider` generates Ed25519 key pairs only when an authorized administrator explicitly requests rotation. Private PKCS#8 keys are written to `CAUSAL_PROOF_KEY_DIR` with restrictive file permissions where the platform supports them. SQLite stores only the public key, key ID, algorithm, validity start, revocation time, replacement ID, and creator.

The trusted registry supports active/revoked keys. Historical checkpoints remain verifiable when the signature predates revocation; checkpoints created after revocation fail applicability checks. Rotation creates a new key and records the replacement relationship.

## Operational procedures

- Back up private keys only through a separately protected key-management process; never put them in Git, SQLite, packages, logs, or tickets.
- Rotate before compromise, register the new public key, publish a new checkpoint, then revoke the old key.
- Preserve old public keys and revocation metadata for historical verification.
- If a private key is lost, historical signatures may remain verifiable but new checkpoints cannot be produced; restore the protected key backup or rotate to a new identity.
- If a key is compromised, revoke it, publish a security activity record, rotate, and treat checkpoints after the compromise boundary as requiring review.

## Future adapter

The `SigningKeyProvider` interface is the seam for a managed KMS/HSM provider. The current implementation is local-file only and must not be described as KMS/HSM integration.
