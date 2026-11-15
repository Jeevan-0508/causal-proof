import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { hashCanonical } from "../domain/canonical";
import { validateCausalGraph } from "../domain/kernel";
import { InvestigationSchema, type DecisionReplay, type EvidenceMutation, type Investigation, type InvestigationBranch, type SimulationResult } from "../domain/types";
import { appendLedgerEvent, readLedger, verifyLedger, type LedgerEvent, type LedgerEventType, type LedgerVerification } from "./ledger";
import { migrateDatabase } from "./schema";
import type { PortableInvestigationPackage } from "./package";

export type SQLiteRepositoryOptions = {
  filename?: string;
  now?: () => string;
};

export type InvestigationSummary = {
  id: string;
  title: string;
  status: Investigation["status"];
  updatedAt: string;
  evidenceCount: number;
  branchCount: number;
  integrity: LedgerVerification["status"];
};

const defaultFilename = () => process.env.CAUSAL_PROOF_DB_PATH || path.join(process.cwd(), ".data", "causal-proof.sqlite");

function ensureUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} identity detected.`);
}

function validateInvestigation(investigation: Investigation): Investigation {
  const parsed = InvestigationSchema.safeParse(investigation);
  if (!parsed.success) throw new Error(`Invalid investigation: ${parsed.error.issues[0]?.message ?? "schema error"}`);
  ensureUnique(parsed.data.events.map((event) => event.id), "event");
  ensureUnique(parsed.data.evidence.map((record) => record.id), "evidence");
  const graph = validateCausalGraph(parsed.data);
  if (!graph.valid) throw new Error(`Invalid causal graph: ${graph.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join(" ")}`);
  return parsed.data;
}

export class InvestigationRepository {
  readonly filename: string;
  private readonly db: Database.Database;
  private readonly now: () => string;

  constructor(options: SQLiteRepositoryOptions = {}) {
    this.filename = options.filename || defaultFilename();
    this.now = options.now || (() => new Date().toISOString());
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    this.db = new Database(this.filename);
    migrateDatabase(this.db);
  }

  close() { this.db.close(); }

  schemaVersion(): number { return Number(this.db.pragma("user_version", { simple: true })); }

  transaction<T>(work: () => T): T { return this.db.transaction(work)(); }

  createInvestigation(input: Investigation, actorId = "local-investigator"): Investigation {
    const investigation = validateInvestigation(input);
    const recordedAt = this.now();
    this.transaction(() => {
      if (this.db.prepare("SELECT 1 FROM investigations WHERE id = ?").get(investigation.id)) throw new Error(`Investigation already exists: ${investigation.id}`);
      this.db.prepare(`INSERT INTO investigations(id, title, status, currency, investigation_json, created_at, updated_at, schema_version)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(investigation.id, investigation.title, investigation.status, investigation.currency, JSON.stringify(investigation), recordedAt, recordedAt);
      this.replaceChildren(investigation);
      this.append(investigation.id, "investigation.created", actorId, recordedAt, { investigationId: investigation.id, title: investigation.title });
      for (const mutation of investigation.evidence.flatMap((record) => record.history)) this.append(investigation.id, "evidence.mutated", actorId, mutation.recordedAt, { evidenceId: mutation.evidenceId, mutation });
    });
    return investigation;
  }

  saveInvestigation(input: Investigation, actorId = "local-investigator"): Investigation {
    const investigation = validateInvestigation(input);
    const recordedAt = this.now();
    this.transaction(() => {
      if (!this.db.prepare("SELECT 1 FROM investigations WHERE id = ?").get(investigation.id)) throw new Error(`Unknown investigation: ${investigation.id}`);
      const previous = this.loadInvestigation(investigation.id);
      const previousMutationIds = new Set(previous.evidence.flatMap((record) => record.history.map((mutation) => mutation.id)));
      const newMutations = investigation.evidence.flatMap((record) => record.history).filter((mutation) => !previousMutationIds.has(mutation.id));
      const persistedReplays = this.db.prepare("SELECT replay_json AS replayJson FROM decision_replays WHERE investigation_id = ?").all(investigation.id) as Array<Record<string, unknown>>;
      for (const mutation of newMutations) {
        const previousRecord = previous.evidence.find((record) => record.id === mutation.evidenceId);
        const lastRecordedAt = previousRecord?.history.at(-1)?.recordedAt;
        if (lastRecordedAt && Date.parse(mutation.recordedAt) < Date.parse(lastRecordedAt)) throw new Error("Backdated evidence mutation rejected; historical decisions cannot be silently rewritten.");
        if (persistedReplays.some((row) => Date.parse(mutation.recordedAt) <= Date.parse((JSON.parse(String(row.replayJson)) as DecisionReplay).knowledgeCutoff))) throw new Error("Mutation would rewrite a persisted historical replay and is rejected.");
      }
      this.db.prepare(`UPDATE investigations SET title = ?, status = ?, currency = ?, investigation_json = ?, updated_at = ? WHERE id = ?`).run(investigation.title, investigation.status, investigation.currency, JSON.stringify(investigation), recordedAt, investigation.id);
      this.replaceChildren(investigation);
      this.append(investigation.id, "investigation.saved", actorId, recordedAt, { investigationHash: hashCanonical(investigation) });
      for (const mutation of newMutations) this.append(investigation.id, "evidence.mutated", actorId, mutation.recordedAt, { evidenceId: mutation.evidenceId, mutation });
    });
    return investigation;
  }

  loadInvestigation(id: string): Investigation {
    const row = this.db.prepare("SELECT investigation_json AS data FROM investigations WHERE id = ?").get(id) as { data?: string } | undefined;
    if (!row) throw new Error(`Unknown investigation: ${id}`);
    const parsed = InvestigationSchema.safeParse(JSON.parse(String(row.data)));
    if (!parsed.success) throw new Error(`Stored investigation is corrupt: ${parsed.error.issues[0]?.message ?? "schema error"}`);
    return parsed.data;
  }

  hasInvestigation(id: string): boolean { return Boolean(this.db.prepare("SELECT 1 FROM investigations WHERE id = ?").get(id)); }

  listInvestigations(): InvestigationSummary[] {
    const rows = this.db.prepare(`SELECT i.id, i.title, i.status, i.updated_at AS updatedAt,
      (SELECT COUNT(*) FROM evidence_records e WHERE e.investigation_id = i.id) AS evidenceCount,
      (SELECT COUNT(*) FROM counterfactual_branches b WHERE b.investigation_id = i.id) AS branchCount
      FROM investigations i ORDER BY i.updated_at DESC, i.id ASC`).all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: String(row.id), title: String(row.title), status: String(row.status) as Investigation["status"], updatedAt: String(row.updatedAt), evidenceCount: Number(row.evidenceCount), branchCount: Number(row.branchCount), integrity: verifyLedger(this.db, String(row.id)).status,
    }));
  }

  recordEvidenceMutation(investigation: Investigation, mutation: EvidenceMutation, actorId = "local-investigator"): Investigation {
    const previousMutations = investigation.evidence.find((record) => record.id === mutation.evidenceId)?.history ?? [];
    const lastRecordedAt = previousMutations.at(-1)?.recordedAt;
    if (lastRecordedAt && Date.parse(mutation.recordedAt) < Date.parse(lastRecordedAt)) throw new Error("Backdated evidence mutation rejected; historical decisions cannot be silently rewritten.");
    const saved = this.saveInvestigation(investigation, actorId);
    return saved;
  }

  persistReplay(investigationId: string, replay: DecisionReplay, actorId = "local-investigator"): void {
    this.requireInvestigation(investigationId);
    const createdAt = this.now();
    this.transaction(() => {
      this.db.prepare(`INSERT OR REPLACE INTO decision_replays(replay_id, investigation_id, decision_point_id, replay_hash, replay_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(replay.replayId, investigationId, replay.decisionPoint.id, replay.replayHash, JSON.stringify(replay), createdAt);
      this.append(investigationId, "decision.replayed", actorId, createdAt, replay);
    });
  }

  persistBranch(investigationId: string, branch: InvestigationBranch, simulation: SimulationResult, actorId = "local-investigator"): InvestigationBranch {
    this.requireInvestigation(investigationId);
    if (branch.parentInvestigationId !== investigationId) throw new Error("Cross-investigation branch attachment rejected.");
    const createdAt = this.now();
    this.transaction(() => {
      this.db.prepare(`INSERT INTO simulations(input_hash, investigation_id, seed, model_version, input_json, result_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(input_hash) DO NOTHING`).run(simulation.input.inputHash, investigationId, simulation.seed, "phase-4-kernel-1", JSON.stringify(simulation.input), JSON.stringify(simulation), createdAt);
      this.db.prepare(`INSERT INTO counterfactual_branches(branch_id, investigation_id, parent_investigation_id, fork_decision_point_id, snapshot_hash, input_hash, result_hash, branch_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(branch.id, investigationId, branch.parentInvestigationId, branch.forkDecisionPointId, branch.snapshotHash, branch.simulationInputHash, branch.resultHash, JSON.stringify(branch), createdAt);
      this.append(investigationId, "simulation.recorded", actorId, createdAt, simulation);
      this.append(investigationId, "branch.created", actorId, createdAt, branch);
    });
    return branch;
  }

  listBranches(investigationId: string): InvestigationBranch[] {
    this.requireInvestigation(investigationId);
    const rows = this.db.prepare("SELECT branch_json AS data FROM counterfactual_branches WHERE investigation_id = ? ORDER BY created_at ASC, branch_id ASC").all(investigationId) as Array<Record<string, unknown>>;
    return rows.map((row) => JSON.parse(String(row.data)) as InvestigationBranch);
  }

  listReplays(investigationId: string): DecisionReplay[] {
    this.requireInvestigation(investigationId);
    const rows = this.db.prepare("SELECT replay_json AS data FROM decision_replays WHERE investigation_id = ? ORDER BY created_at ASC, replay_id ASC").all(investigationId) as Array<Record<string, unknown>>;
    return rows.map((row) => JSON.parse(String(row.data)) as DecisionReplay);
  }

  listSimulations(investigationId: string): SimulationResult[] {
    this.requireInvestigation(investigationId);
    const rows = this.db.prepare("SELECT result_json AS data FROM simulations WHERE investigation_id = ? ORDER BY created_at ASC, input_hash ASC").all(investigationId) as Array<Record<string, unknown>>;
    return rows.map((row) => JSON.parse(String(row.data)) as SimulationResult);
  }

  listGraphVersions(investigationId: string): Array<{ version: number; graphHash: string; graph: unknown; createdAt: string }> {
    this.requireInvestigation(investigationId);
    const rows = this.db.prepare("SELECT version, graph_hash AS graphHash, graph_json AS graphJson, created_at AS createdAt FROM causal_graph_versions WHERE investigation_id = ? ORDER BY version ASC").all(investigationId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({ version: Number(row.version), graphHash: String(row.graphHash), graph: JSON.parse(String(row.graphJson)), createdAt: String(row.createdAt) }));
  }

  saveExportManifest(investigationId: string, manifest: { manifestId: string; manifestHash: string; sectionHashes: Record<string, string>; auditEventCount: number; auditHeadHash: string | null; scientificLimitationsHash: string }, createdAt = this.now()): void {
    this.requireInvestigation(investigationId);
    this.db.prepare(`INSERT OR REPLACE INTO export_manifests(manifest_id, investigation_id, package_version, manifest_hash, manifest_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(manifest.manifestId, investigationId, "1.0", manifest.manifestHash, JSON.stringify(manifest), createdAt);
  }

  importPortablePackage(input: PortableInvestigationPackage, actorId = "package-import"): Investigation {
    const investigation = validateInvestigation(input.investigation);
    const recordedAt = this.now();
    this.transaction(() => {
      if (this.hasInvestigation(investigation.id)) throw new Error(`Investigation already exists: ${investigation.id}`);
      this.db.prepare(`INSERT INTO investigations(id, title, status, currency, investigation_json, created_at, updated_at, schema_version) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`).run(investigation.id, investigation.title, investigation.status, investigation.currency, JSON.stringify(investigation), recordedAt, recordedAt);
      this.replaceChildren(investigation);
      for (const event of input.auditEvents) {
        this.db.prepare(`INSERT INTO audit_events(sequence, event_id, investigation_id, event_type, recorded_at, actor_id, previous_event_hash, canonical_payload_hash, event_hash, schema_version, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(event.sequence, event.eventId, event.investigationId, event.eventType, event.recordedAt, event.actorId, event.previousEventHash, event.canonicalPayloadHash, event.eventHash, event.schemaVersion, JSON.stringify(event.payload));
      }
      const head = input.auditEvents.at(-1)?.eventHash ?? null;
      this.db.prepare("INSERT INTO audit_chain_state(investigation_id, event_count, head_hash) VALUES (?, ?, ?)").run(investigation.id, input.auditEvents.length, head);
      for (const replay of input.replays) this.db.prepare(`INSERT INTO decision_replays(replay_id, investigation_id, decision_point_id, replay_hash, replay_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(replay.replayId, investigation.id, replay.decisionPoint.id, replay.replayHash, JSON.stringify(replay), recordedAt);
      for (const simulation of input.simulations) this.db.prepare(`INSERT INTO simulations(input_hash, investigation_id, seed, model_version, input_json, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(simulation.input.inputHash, investigation.id, simulation.seed, "phase-4-kernel-1", JSON.stringify(simulation.input), JSON.stringify(simulation), recordedAt);
      for (const branch of input.branches) this.db.prepare(`INSERT INTO counterfactual_branches(branch_id, investigation_id, parent_investigation_id, fork_decision_point_id, snapshot_hash, input_hash, result_hash, branch_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(branch.id, investigation.id, branch.parentInvestigationId, branch.forkDecisionPointId, branch.snapshotHash, branch.simulationInputHash, branch.resultHash, JSON.stringify(branch), recordedAt);
      this.db.prepare(`INSERT INTO export_manifests(manifest_id, investigation_id, package_version, manifest_hash, manifest_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(input.integrityManifest.manifestId, investigation.id, input.packageVersion, input.integrityManifest.manifestHash, JSON.stringify(input.integrityManifest), recordedAt);
      if (input.auditEvents.length === 0) this.append(investigation.id, "package.imported", actorId, recordedAt, { manifestId: input.integrityManifest.manifestId });
    });
    return investigation;
  }

  ledger(investigationId: string): LedgerEvent[] { this.requireInvestigation(investigationId); return readLedger(this.db, investigationId); }

  verifyIntegrity(investigationId: string): LedgerVerification { this.requireInvestigation(investigationId); return verifyLedger(this.db, investigationId); }

  appendCustomEvent(investigationId: string, eventType: LedgerEventType, payload: unknown, actorId = "local-investigator", recordedAt = this.now(), eventId = `${eventType}-${hashCanonical({ investigationId, payload, recordedAt }).slice(7, 23)}`): LedgerEvent {
    this.requireInvestigation(investigationId);
    return this.transaction(() => this.append(investigationId, eventType, actorId, recordedAt, payload, eventId));
  }

  private requireInvestigation(id: string) { if (!this.hasInvestigation(id)) throw new Error(`Unknown investigation: ${id}`); }

  private append(investigationId: string, eventType: LedgerEventType, actorId: string, recordedAt: string, payload: unknown, eventId = `${eventType}-${hashCanonical({ investigationId, actorId, recordedAt, payload }).slice(7, 23)}`): LedgerEvent {
    return appendLedgerEvent(this.db, { eventId, investigationId, eventType, recordedAt, actorId, schemaVersion: 1, payload });
  }

  private replaceChildren(investigation: Investigation) {
    const evidenceIds = new Set(investigation.evidence.map((record) => record.id));
    ensureUnique(investigation.evidence.flatMap((record) => record.history.map((mutation) => mutation.id)), "evidence mutation");
    this.db.prepare("DELETE FROM evidence_mutations WHERE investigation_id = ?").run(investigation.id);
    this.db.prepare("DELETE FROM evidence_records WHERE investigation_id = ?").run(investigation.id);
    const insertEvidence = this.db.prepare(`INSERT INTO evidence_records(investigation_id, evidence_id, record_json, available_at, status) VALUES (?, ?, ?, ?, ?)`);
    const insertMutation = this.db.prepare(`INSERT INTO evidence_mutations(investigation_id, mutation_id, evidence_id, recorded_at, mutation_json) VALUES (?, ?, ?, ?, ?)`);
    for (const record of investigation.evidence) {
      insertEvidence.run(investigation.id, record.id, JSON.stringify(record), record.availableAt, record.status);
      for (const mutation of record.history) {
        if (!evidenceIds.has(mutation.evidenceId)) throw new Error(`Cross-investigation evidence reference rejected: ${mutation.evidenceId}`);
        insertMutation.run(investigation.id, mutation.id, mutation.evidenceId, mutation.recordedAt, JSON.stringify(mutation));
      }
    }
    const graph = { causalNodes: investigation.causalNodes, causalEdges: investigation.causalEdges, controls: investigation.controls };
    const nextVersion = Number((this.db.prepare("SELECT COALESCE(MAX(version), 0) + 1 AS nextVersion FROM causal_graph_versions WHERE investigation_id = ?").get(investigation.id) as { nextVersion?: number } | undefined)?.nextVersion ?? 1);
    this.db.prepare(`INSERT INTO causal_graph_versions(investigation_id, version, graph_hash, graph_json, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(investigation.id, nextVersion, hashCanonical(graph), JSON.stringify(graph), this.now());
  }

  rawForTests() { return this.db; }
}

export function openInvestigationRepository(options: SQLiteRepositoryOptions = {}): InvestigationRepository { return new InvestigationRepository(options); }
