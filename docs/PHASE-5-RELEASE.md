# Phase 5 release notes

## Delivered

- Explicit administrator bootstrap using a configured token and bcrypt password hashing.
- Expiring/revocable opaque sessions, secure cookies, CSRF validation, login throttling, and safe error responses.
- Server-side RBAC and investigation membership enforcement for every investigation route.
- Separate security activity log for identity, membership, export, integrity, anchor, key, backup, restore, replay, branch, and retention actions.
- Filesystem-based external checkpoint anchoring with signed Ed25519 manifests and prefix/rollback detection.
- Local protected-file key provider with public-key registry, rotation, revocation, and historical signature applicability.
- AES-256-GCM/scrypt encrypted backups with clean-target atomic restore and post-restore verification.
- Per-investigation retention policies, expiration previews, legal holds, approval references, and non-destructive logical retention records.
- Authenticated security dashboard and explicit isolated demo mode for Playwright/local demonstrations.

## Verification commands

```text
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
npm audit
```

The exact test and CI results are recorded in the final delivery report. No public deployment or package publication is enabled.

## Known limitations

The filesystem anchor is independently verifiable only when its root is separately protected. It does not provide trusted time or remote immutability. Local key files are not KMS/HSM integration. The app has no SSO/MFA, multi-user deployment hardening, secure physical erasure, or legal/regulatory certification.
