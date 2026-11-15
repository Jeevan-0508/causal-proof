# Phase 8 release readiness

Release gates are: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, serialized `npm run test:e2e`, high-severity `npm audit`, secret scanning, package verification, tamper corpus, and performance measurement. The release must also confirm Apache-2.0 licensing, no proprietary data, no credentials, local reproducibility, and a confirmed repository destination.

Operational diagnostics report schema/database readability, ledger and security-activity status, key count, anchor configuration, demo isolation status, and optional investigation integrity without returning secrets or private key material.
