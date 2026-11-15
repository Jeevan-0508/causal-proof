import { describe, expect, it } from "vitest";
import { parseEventImport, validateImportedEvents } from "../lib/domain/import";

const event = { id: "evt-1", kind: "transaction", occurredAt: "2026-04-08T08:00:00+00:00", ingestedAt: "2026-04-08T08:01:00+00:00", actorId: "actor-1", accountId: "acct-1", summary: "Synthetic transfer", amountCents: 100, sourceRef: "ledger://tx/1", attributes: {} };

describe("event import validation", () => {
  it("accepts valid JSON events and rejects malformed records", () => {
    expect(validateImportedEvents([event])).toHaveLength(1);
    expect(() => validateImportedEvents([{ ...event, kind: "unknown" }])).toThrow(/Invalid event/);
    expect(() => validateImportedEvents([event, event], 1)).toThrow(/record limit/);
  });

  it("parses the constrained CSV shape", () => {
    const csv = `id,kind,occurredAt,ingestedAt,actorId,accountId,summary,amountCents,sourceRef,attributes\n${event.id},${event.kind},${event.occurredAt},${event.ingestedAt},${event.actorId},${event.accountId},${event.summary},${event.amountCents},${event.sourceRef},"{}"`;
    expect(parseEventImport(csv, "csv")[0].amountCents).toBe(100);
  });

  it("rejects unsafe or ambiguous CSV shapes", () => {
    expect(() => parseEventImport("id,bad\n1,2", "csv")).toThrow(/headers/);
    expect(() => parseEventImport("id,kind,occurredAt,ingestedAt,actorId,accountId,summary,amountCents,sourceRef,attributes\n1,transaction,not-a-date,2026-04-08T08:01:00+00:00,a,acct,s,1,ledger://1,{}", "csv")).toThrow(/Invalid event/);
    expect(() => parseEventImport("[]", "json", { maxBytes: 1 })).toThrow(/byte limit/);
  });
});
