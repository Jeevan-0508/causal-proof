import type { EvidenceRecord, EvidenceStatus, Investigation } from "./types";

export type HistoricalEvidenceState = {
  record: EvidenceRecord;
  status: EvidenceStatus;
  knownMutationIds: string[];
};

export function evidenceStateAt(record: EvidenceRecord, cutoff: string): HistoricalEvidenceState | null {
  if (Date.parse(record.availableAt) > Date.parse(cutoff)) return null;
  const knownHistory = record.history.filter((mutation) => Date.parse(mutation.recordedAt) <= Date.parse(cutoff));
  const initial = knownHistory[0];
  let status: EvidenceStatus = initial?.nextStatus ?? "active";
  for (const mutation of knownHistory.slice(1)) status = mutation.nextStatus;
  const challenges = knownHistory.filter((mutation) => mutation.kind === "challenged").map((mutation) => mutation.reason);
  return {
    record: {
      ...record,
      status,
      challenges,
      history: knownHistory,
    },
    status,
    knownMutationIds: knownHistory.map((mutation) => mutation.id),
  };
}

export function reconstructEvidenceAt(investigation: Investigation, cutoff: string): EvidenceRecord[] {
  return investigation.evidence.map((record) => evidenceStateAt(record, cutoff)?.record).filter((record): record is EvidenceRecord => Boolean(record));
}

export function historicalMutationIds(investigation: Investigation, cutoff: string): string[] {
  return investigation.evidence.flatMap((record) => evidenceStateAt(record, cutoff)?.knownMutationIds ?? []);
}

export function rejectBackdatedMutation(record: EvidenceRecord, recordedAt: string): void {
  const latest = record.history.at(-1)?.recordedAt;
  if (latest && Date.parse(recordedAt) < Date.parse(latest)) throw new Error("Backdated evidence mutation rejected; historical decisions cannot be silently rewritten.");
}
