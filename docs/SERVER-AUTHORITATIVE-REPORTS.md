# Server-authoritative reports

`/api/investigations/:id/report` supports authenticated JSON preview and JSON/PDF POST export. Only `format` and an optional persisted decision-point selector are accepted. The server loads the investigation, ledger, graph history, replays, branches, simulations, copilot runs, and reviews from SQLite. A `report.generated` security activity record includes format, canonical hash, and cutoff without report contents or secrets.

The canonical hash excludes `generatedAt`; this keeps repeated exports comparable while retaining generation provenance. PDF output repeats the scientific boundary: simulations are illustrative and not historical causal effects.
