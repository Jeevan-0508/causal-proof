# Phase 5 threat model

## Addressed threats

- Anonymous and stale-session API access.
- CSRF state changes from a browser session.
- Password disclosure and login brute force.
- Horizontal investigation access through known IDs.
- Vertical escalation through caller-supplied actor IDs or roles.
- Tampered/replaced local ledger after an external checkpoint.
- Unknown, revoked, or rotated signing keys.
- Wrong-key, tampered, and unsafe encrypted backup restore.
- Silent retention deletion and legal-hold bypass.

## Remaining threats

- Operating-system compromise, a malicious administrator, database/anchor filesystem administrators, and stolen passphrases/private keys.
- Trusted-time fraud, remote object-store compromise, traffic interception before TLS, and denial of service.
- Secure erasure requirements across filesystem copies, WAL files, backups, exports, and replicas.
- Production multi-tenant deployment, SSO/MFA, KMS/HSM, secret rotation infrastructure, and independent monitoring.

## Security posture

Phase 5 is a local-first identity-aware demonstration with real server-side controls. It is not enterprise-ready merely because it has authentication, authorization, encryption, or signatures. Scientific limitations remain unchanged: integrity is not truth, a signature is not source validation, and simulated outcomes are not observed causal effects.
