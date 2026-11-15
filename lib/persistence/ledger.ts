import { hashCanonical } from "../domain/canonical";

export const LEDGER_SCHEMA_VERSION = 1;

export type LedgerEventType =
  | "investigation.created"
  | "investigation.saved"
  | "evidence.mutated"
  | "graph.versioned"
  | "decision.replayed"
  | "branch.created"
  | "simulation.recorded"
  | "package.exported"
  | "package.imported";

export type LedgerEvent = {
  sequence: number;
  eventId: string;
  investigationId: string;
  eventType: LedgerEventType;
  recordedAt: string;
  actorId: string;
  previousEventHash: string | null;
  canonicalPayloadHash: string;
  eventHash: string;
  schemaVersion: number;
  payload: unknown;
};

export type LedgerVerification = {
  valid: boolean;
  status: "verified" | "integrity_failure" | "unknown_authenticity";
  checkedEvents: number;
  headHash: string | null;
  issues: string[];
  authenticityNote: string;
};

type LedgerDb = {
  prepare(sql: string): {
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  };
};

const eventHashInput = (event: Omit<LedgerEvent, "eventHash" | "sequence" | "payload">) => ({
  eventId: event.eventId,
  investigationId: event.investigationId,
  eventType: event.eventType,
  recordedAt: event.recordedAt,
  actorId: event.actorId,
  previousEventHash: event.previousEventHash,
  canonicalPayloadHash: event.canonicalPayloadHash,
  schemaVersion: event.schemaVersion,
});

export function createLedgerEvent(input: Omit<LedgerEvent, "eventHash" | "sequence" | "canonicalPayloadHash">): Omit<LedgerEvent, "sequence"> {
  const canonicalPayloadHash = hashCanonical(input.payload);
  const withoutHash = { ...input, canonicalPayloadHash };
  return { ...withoutHash, eventHash: hashCanonical(eventHashInput(withoutHash)) };
}

export function appendLedgerEvent(db: LedgerDb, input: Omit<LedgerEvent, "eventHash" | "sequence" | "previousEventHash" | "canonicalPayloadHash"> & { previousEventHash?: string | null }): LedgerEvent {
  const previous = db.prepare("SELECT event_hash AS eventHash FROM audit_events WHERE investigation_id = ? ORDER BY sequence DESC LIMIT 1").get(input.investigationId);
  const event = createLedgerEvent({ ...input, previousEventHash: input.previousEventHash ?? (typeof previous?.eventHash === "string" ? previous.eventHash : null) });
  const nextSequence = Number(db.prepare("SELECT COALESCE(MAX(sequence), 0) + 1 AS nextSequence FROM audit_events WHERE investigation_id = ?").get(input.investigationId)?.nextSequence ?? 1);
  db.prepare(`INSERT INTO audit_events
    (sequence, event_id, investigation_id, event_type, recorded_at, actor_id, previous_event_hash,
     canonical_payload_hash, event_hash, schema_version, payload_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    nextSequence,
    event.eventId,
    event.investigationId,
    event.eventType,
    event.recordedAt,
    event.actorId,
    event.previousEventHash,
    event.canonicalPayloadHash,
    event.eventHash,
    event.schemaVersion,
    JSON.stringify(event.payload),
  );
  const sequence = nextSequence;
  db.prepare(`INSERT INTO audit_chain_state (investigation_id, event_count, head_hash)
    VALUES (?, 1, ?)
    ON CONFLICT(investigation_id) DO UPDATE SET event_count = event_count + 1, head_hash = excluded.head_hash`).run(input.investigationId, event.eventHash);
  return { ...event, sequence };
}

function parseLedgerRow(row: Record<string, unknown>): LedgerEvent {
  return {
    sequence: Number(row.sequence),
    eventId: String(row.eventId),
    investigationId: String(row.investigationId),
    eventType: String(row.eventType) as LedgerEventType,
    recordedAt: String(row.recordedAt),
    actorId: String(row.actorId),
    previousEventHash: row.previousEventHash === null ? null : String(row.previousEventHash),
    canonicalPayloadHash: String(row.canonicalPayloadHash),
    eventHash: String(row.eventHash),
    schemaVersion: Number(row.schemaVersion),
    payload: JSON.parse(String(row.payloadJson)),
  };
}

export function readLedger(db: LedgerDb, investigationId: string): LedgerEvent[] {
  return db.prepare(`SELECT sequence, event_id AS eventId, investigation_id AS investigationId,
    event_type AS eventType, recorded_at AS recordedAt, actor_id AS actorId,
    previous_event_hash AS previousEventHash, canonical_payload_hash AS canonicalPayloadHash,
    event_hash AS eventHash, schema_version AS schemaVersion, payload_json AS payloadJson
    FROM audit_events WHERE investigation_id = ? ORDER BY sequence ASC`).all(investigationId).map(parseLedgerRow);
}

export function verifyLedger(db: LedgerDb, investigationId: string): LedgerVerification {
  const events = readLedger(db, investigationId);
  const state = db.prepare("SELECT event_count AS eventCount, head_hash AS headHash FROM audit_chain_state WHERE investigation_id = ?").get(investigationId);
  const issues: string[] = [];
  let previous: string | null = null;
  events.forEach((event, index) => {
    if (event.sequence !== index + 1) issues.push(`Ledger sequence at ${event.eventId} is ${event.sequence}, expected ${index + 1}.`);
    if (event.previousEventHash !== previous) issues.push(`Broken previous-hash link at ${event.eventId}.`);
    const expectedPayloadHash = hashCanonical(event.payload);
    if (event.canonicalPayloadHash !== expectedPayloadHash) issues.push(`Payload hash mismatch at ${event.eventId}.`);
    const expectedEventHash = hashCanonical(eventHashInput(event));
    if (event.eventHash !== expectedEventHash) issues.push(`Event hash mismatch at ${event.eventId}.`);
    previous = event.eventHash;
  });
  if (state && Number(state.eventCount) !== events.length) issues.push(`Ledger count anchor is ${state.eventCount}, but ${events.length} events were read.`);
  if (state && (state.headHash ?? null) !== previous) issues.push("Ledger head anchor does not match the last event.");
  if (!state && events.length > 0) issues.push("Ledger has events but no local chain anchor.");
  return {
    valid: issues.length === 0,
    status: issues.length === 0 ? "verified" : "integrity_failure",
    checkedEvents: events.length,
    headHash: previous,
    issues,
    authenticityNote: "Verified means the local chain, payload hashes, ordering, and local count/head anchor agree. An unanchored local hash chain cannot prove that the entire history is authentic or complete, and hashes do not establish that evidence is truthful.",
  };
}

export function verifyLedgerEvents(events: LedgerEvent[]): LedgerVerification {
  const issues: string[] = [];
  let previous: string | null = null;
  events.forEach((event, index) => {
    if (event.sequence !== index + 1) issues.push(`Ledger sequence at ${event.eventId} is ${event.sequence}; expected ${index + 1}.`);
    if (event.previousEventHash !== previous) issues.push(`Broken previous-hash link at ${event.eventId}.`);
    if (event.canonicalPayloadHash !== hashCanonical(event.payload)) issues.push(`Payload hash mismatch at ${event.eventId}.`);
    if (event.eventHash !== hashCanonical(eventHashInput(event))) issues.push(`Event hash mismatch at ${event.eventId}.`);
    previous = event.eventHash;
  });
  return {
    valid: issues.length === 0,
    status: issues.length === 0 ? "verified" : "integrity_failure",
    checkedEvents: events.length,
    headHash: previous,
    issues,
    authenticityNote: "Package verification checks the supplied chain only. It does not prove that the package is the complete or truthful record without an external trusted anchor.",
  };
}
