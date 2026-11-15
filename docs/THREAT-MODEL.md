# Threat model and operational boundaries

## Protected assets

- Investigation domain records and evidence payloads.
- Evidence challenge, withdrawal, and restoration history.
- Replay information boundaries and counterfactual branch inputs/results.
- Export package integrity and scientific limitations.

## In scope

- Accidental mutation of a stored JSON payload.
- Missing or reordered local audit rows.
- Cross-investigation references and duplicate identities.
- Malformed or tampered portable packages.
- Late-arriving evidence and backdated status corrections.
- Two local processes writing the same SQLite file.

## Out of scope

- Authentication, authorization, multi-user tenancy, remote attackers, database encryption, secure deletion, or operating-system compromise.
- Proof that source evidence is truthful or that an investigator's interpretation is correct.
- Legal admissibility, regulatory compliance, SOC 2, ISO certification, or production chain of custody.

## Operational guidance

- Keep the database file permissions restricted to the investigator account.
- Back up the SQLite file and exported packages to a separate protected location. Test restoration before relying on a backup.
- Treat the local chain head as a consistency anchor, not an external trust anchor.
- Keep signing keys outside the repository and database; use an HSM or managed key store for production signing.
- Define retention and deletion policy before storing real evidence. The demo has no automated retention or secure-erasure mechanism.
- Do not expose the local API to a network without adding authentication, authorization, CSRF protection, rate limiting, and tenant isolation.
- Do not place credentials, private keys, real customer data, or proprietary telemetry in an exported package.

## Recovery

The database can be copied while the application is stopped, or through an operational backup procedure that preserves the SQLite file. Portable packages can be verified independently with `npm run verify:package -- path/to/package.json`. A failed verification should trigger quarantine and review, not silent repair.
