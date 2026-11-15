# Retention policy

Retention is a controlled lifecycle record, not a destructive eraser.

- A missing policy is safe: no records are eligible.
- A policy is per investigation and includes evidence, backup, and export retention horizons.
- A legal hold prevents eligible actions and records the hold decision.
- Applying a policy requires an approval reference and an authorized lead/administrator.
- Eligible evidence receives a logical-retention record and security activity entry; evidence history and the audit ledger remain intact.
- Physical secure erasure across the SQLite main file, WAL, backups, exports, and replicas is not implemented or claimed.

Operators must define who approves retention, where backups/exports are stored, how holds are released, and how deletion requests interact with legal obligations. Retention actions are auditable and cannot silently remove forensic history.
