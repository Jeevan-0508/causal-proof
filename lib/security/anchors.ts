import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { hashCanonical } from "../domain/canonical";
import type { InvestigationRepository } from "../persistence/sqlite";
import type { AnchorCheckpoint, AnchorVerification } from "./types";
import type { SecurityStore } from "./store";
import type { SigningKeyProvider } from "./keys";
import { verifySignedPayload } from "./keys";

export interface IndependentAnchorStore {
  publish(checkpoint: AnchorCheckpoint): string;
  latest(investigationId: string): AnchorCheckpoint | null;
}

export class FileAnchorStore implements IndependentAnchorStore {
  readonly directory: string;
  constructor(directory: string, databaseFilename: string) {
    if (!directory.trim()) throw new Error("An explicit independent anchor directory is required.");
    this.directory = path.resolve(directory); const databaseDirectory = path.dirname(path.resolve(databaseFilename));
    if (this.directory === databaseDirectory || this.directory.startsWith(`${databaseDirectory}${path.sep}`) || databaseDirectory.startsWith(`${this.directory}${path.sep}`)) throw new Error("The independent anchor directory must be outside the database directory boundary.");
    fs.mkdirSync(this.directory, { recursive: true });
  }
  publish(checkpoint: AnchorCheckpoint): string { const filename = `checkpoint-${checkpoint.investigationId}-${checkpoint.checkpointSequence}.json`; const finalPath = path.join(this.directory, filename); const tempPath = `${finalPath}.${randomUUID()}.tmp`; fs.writeFileSync(tempPath, JSON.stringify(checkpoint, null, 2), { encoding: "utf8", flag: "wx" }); fs.renameSync(tempPath, finalPath); return finalPath; }
  latest(investigationId: string): AnchorCheckpoint | null { const files = fs.readdirSync(this.directory).filter((file) => file.startsWith(`checkpoint-${investigationId}-`) && file.endsWith(".json")).sort((left, right) => Number(left.slice(`checkpoint-${investigationId}-`.length, -5)) - Number(right.slice(`checkpoint-${investigationId}-`.length, -5))); const latest = files.at(-1); if (!latest) return null; return JSON.parse(fs.readFileSync(path.join(this.directory, latest), "utf8")) as AnchorCheckpoint; }
}

export function configuredAnchorStore(databaseFilename: string): FileAnchorStore | null { const root = process.env.CAUSAL_PROOF_ANCHOR_DIR; return root ? new FileAnchorStore(root, databaseFilename) : null; }

export function createCheckpoint(repo: InvestigationRepository, security: SecurityStore, investigationId: string, actorUserId: string, keyProvider: SigningKeyProvider, anchorStore: IndependentAnchorStore, keyId: string, createdAt = new Date().toISOString()): AnchorCheckpoint {
  const events = repo.ledger(investigationId); const last = events.at(-1); if (!last) throw new Error("Cannot anchor an investigation with no ledger events."); const manifest = { investigationId, eventCount: events.length, ledgerHeadHash: last.eventHash, checkpointSequence: last.sequence, schemaVersion: repo.schemaVersion(), createdAt, keyId, algorithm: "Ed25519" as const }; const signature = keyProvider.sign(keyId, manifest); const checkpoint: AnchorCheckpoint = { checkpointId: `checkpoint-${hashCanonical(manifest).slice(7, 23)}`, investigationId, checkpointSequence: last.sequence, eventCount: events.length, ledgerHeadHash: last.eventHash, schemaVersion: repo.schemaVersion(), createdAt, keyId, algorithm: "Ed25519", signature, manifest, anchorPath: "" }; const anchorPath = anchorStore.publish(checkpoint); const stored = { ...checkpoint, anchorPath }; security.saveCheckpoint(stored); security.appendSecurity("anchor.published", actorUserId, investigationId, { checkpointId: stored.checkpointId, eventCount: stored.eventCount, keyId }, createdAt); repo.appendCustomEvent(investigationId, "anchor.published", { checkpointId: stored.checkpointId, checkpointSequence: stored.checkpointSequence }, actorUserId, createdAt); return stored;
}

export function verifyAgainstAnchor(repo: InvestigationRepository, security: SecurityStore, investigationId: string, anchorStore: IndependentAnchorStore | null): AnchorVerification {
  const local = repo.verifyIntegrity(investigationId); if (!anchorStore) return { status: "authenticity_unknown", valid: false, issues: ["No independent anchor directory is configured."], trustNote: "A local ledger is not an independent trust anchor." }; const checkpoint = anchorStore.latest(investigationId); if (!checkpoint) return { status: "missing_anchor", valid: false, issues: ["No external checkpoint exists for this investigation."], trustNote: "An investigation is not externally anchored until a checkpoint is published to a separate protected location." }; const issues: string[] = []; const key = security.getKey(checkpoint.keyId); if (!key) return { status: "unknown_signer", valid: false, checkpoint, issues: [`Unknown signing key ${checkpoint.keyId}.`], trustNote: "The verifier has no trusted public key for this checkpoint." }; if (!verifySignedPayload(checkpoint.manifest, checkpoint.signature, key.publicKeyPem)) issues.push("Checkpoint signature is invalid."); if (key.status === "revoked" && key.revokedAt && Date.parse(checkpoint.createdAt) > Date.parse(key.revokedAt)) issues.push("Checkpoint was signed after its key was revoked."); const events = repo.ledger(investigationId); if (events.length < checkpoint.eventCount) issues.push("Local ledger is truncated below the anchored event count."); else if (events[checkpoint.checkpointSequence - 1]?.eventHash !== checkpoint.ledgerHeadHash) issues.push("Local ledger does not match the anchored checkpoint prefix."); if (!local.valid) issues.push(...local.issues); return { status: issues.some((issue) => issue.includes("signature")) ? "signature_invalid" : issues.length ? "anchor_mismatch" : "externally_anchored", valid: issues.length === 0, checkpoint, issues, trustNote: "External anchoring verifies the signed checkpoint against a separate copy and trusted public-key registry. It does not prove trusted time, evidence truth, or legal admissibility." };
}
