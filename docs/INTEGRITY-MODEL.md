# Integrity model

## Ledger event

Every persisted event contains:

- `eventId`, `investigationId`, and per-investigation `sequence`;
- event type, recorded timestamp, and actor identifier;
- `previousEventHash`;
- canonical payload hash;
- event hash;
- ledger schema version.

Canonical serialization recursively sorts object keys before hashing. The event hash covers the immutable event identity, investigation, type, timestamp, actor, previous hash, payload hash, and schema version. Payloads are retained as JSON so verification can recompute the payload hash.

## Verification states

- **Chain consistent**: stored events, payloads, links, ordering, and local count/head anchor agree.
- **Integrity failure**: a hash, link, sequence, count, or head anchor disagrees. The UI exposes the issue and does not call it verified.
- **Authenticity unknown**: there is no trusted external anchor or signer binding the local database to an independent authority.

The green chain-consistent state never means that evidence is true, that an actor is identified, or that a legal chain of custody exists.

## What can be detected

Verification detects modified payloads, modified event fields, broken links, reordered sequence values, duplicate event IDs, and removed events when the local count/head anchor or an exported manifest no longer agrees.

## What cannot be proven

An unanchored hash chain cannot prove that its first event is authentic or that the entire history was never replaced before verification. A local attacker who can rewrite both the events and the local anchor can rewrite the database. External signed receipts, write-once storage, access controls, and independent time anchoring are future controls.
