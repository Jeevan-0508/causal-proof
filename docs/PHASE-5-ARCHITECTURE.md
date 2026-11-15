# Phase 5 architecture

## Trust boundaries

```text
Browser
  | secure HttpOnly session cookie + readable CSRF token
  v
Next.js Node route handlers
  | authenticate -> CSRF -> role + membership policy -> request validation
  +--> SQLite investigation repository
  |      domain snapshots, evidence, replay, branches, local ledger
  +--> SQLite security repository
  |      users, sessions, memberships, keys, anchors, retention, security log
  +--> protected local key directory
  +--> separately configured anchor directory
  +--> encrypted backup bytes / clean restore target
```

The browser never supplies an actor identity. The server derives the actor from the session and records it in security activity and persistence events. Unauthorized investigation IDs are returned as not-found responses to reduce enumeration.

## Identity and authorization

The first administrator is created only when `CAUSAL_PROOF_BOOTSTRAP_TOKEN` is explicitly configured and supplied. Passwords are bcrypt-hashed. Sessions use random opaque tokens, hashed at rest, with an eight-hour expiry, revocation, `HttpOnly`, `SameSite=Strict`, and production-only `Secure` cookies. State-changing requests require the session-bound CSRF token.

Role and membership policy is centralized in `lib/security/auth.ts`. Route handlers call the policy server-side; UI visibility is not a security control. Investigation membership is required even when a user knows an investigation ID.

## Durable security records

Migration 2 adds users, sessions, memberships, login throttling, a separate hash-chained security activity log, trusted public keys, anchor checkpoints, retention policies/actions, and logical-retention records. Private keys never enter SQLite, packages, logs, or the browser.

## External trust and recovery

`FileAnchorStore` writes signed checkpoint manifests to a separately configured directory. `verifyAgainstAnchor` checks the local ledger prefix, checkpoint count/head, signature, and key applicability. The directory must not be the database directory. It is only an independent trust root when protected and controlled separately by the operator.

Encrypted backups use AES-256-GCM with scrypt-derived keys. Restore requires a clean target, validates SQLite schema, atomically renames a temporary file, and verifies every recovered investigation ledger before returning success. The application does not store the passphrase.

Retention is intentionally conservative: absent policy means no action, legal hold preserves all records, and approved actions add logical-retention records without physically erasing forensic history. Secure erasure across SQLite/WAL/backups/replicas is not implemented or claimed.
