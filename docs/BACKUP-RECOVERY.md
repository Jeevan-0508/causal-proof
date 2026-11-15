# Backup and recovery

Encrypted backup format `causal-proof-encrypted-backup` version 1 contains no plaintext database bytes. It uses AES-256-GCM with a random salt/IV and scrypt-derived key. The passphrase is supplied by the operator and is never persisted.

## Procedure

1. Stop or quiesce writes before backup; the implementation checkpoints SQLite WAL state before reading the database bytes.
2. Use the security dashboard or `/api/security/backup` with a passphrase of at least 16 characters.
3. Store the encrypted JSON separately from the live database and key directory.
4. Restore only to a clean target using `restoreEncryptedBackup` or `CAUSAL_PROOF_RESTORE_PATH`.
5. The restore validates schema compatibility, writes a temporary file, atomically renames it, and verifies every recovered investigation ledger.
6. Restart the application and independently verify any configured anchor.

Wrong passphrases, corrupted authentication tags, malformed formats, existing targets, and post-restore ledger failures are rejected. The route refuses to overwrite the active database. A failed restore removes its temporary target; operators should still inspect the filesystem and backups after interruption.

## Limitations

Backup encryption does not solve passphrase loss, key compromise, database tampering before backup, secure deletion, or retention obligations. WAL and backup copies must be included in the operator's retention and access-control policy. The implementation does not claim encrypted off-site storage or managed key escrow.
