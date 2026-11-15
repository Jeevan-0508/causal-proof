import fs from "node:fs";
import path from "node:path";
import { hashCanonical } from "../domain/canonical";
import { InvestigationSchema, type DecisionReplay, type Investigation, type InvestigationBranch, type SimulationResult } from "../domain/types";
import { verifyLedgerEvents, type LedgerEvent, type LedgerVerification } from "./ledger";
import type { InvestigationRepository } from "./sqlite";

export const PORTABLE_PACKAGE_VERSION = "1.0";

export type IntegrityManifest = {
  manifestId: string;
  manifestHash: string;
  sectionHashes: Record<string, string>;
  auditEventCount: number;
  auditHeadHash: string | null;
  scientificLimitationsHash: string;
};

export type PortableInvestigationPackage = {
  packageVersion: string;
  exportedAt: string;
  metadata: { investigationId: string; title: string; status: Investigation["status"]; source: "causal-proof-local" };
  investigation: Investigation;
  evidenceMutations: Investigation["evidence"][number]["history"];
  graphVersions: Array<{ version: number; graphHash: string; graph: unknown; createdAt: string }>;
  replays: DecisionReplay[];
  branches: InvestigationBranch[];
  simulations: SimulationResult[];
  auditEvents: LedgerEvent[];
  scientificLimitations: string[];
  integrityManifest: IntegrityManifest;
};

const limitations = [
  "The package is synthetic/local-first evidence organization and scenario analysis, not a causal oracle.",
  "A local hash chain is tamper-evident but cannot prove complete authenticity without an external trusted anchor.",
  "A valid optional signature binds bytes to a trusted signing key; it does not establish that evidence is truthful.",
  "Simulations are deterministic illustrative scenarios, not empirical causal effects or legal findings.",
  "The default application has no authentication, authorization, multi-user security, or legal chain-of-custody guarantee.",
];

function sectionHashes(input: Omit<PortableInvestigationPackage, "integrityManifest">): Record<string, string> {
  return {
    metadata: hashCanonical(input.metadata),
    investigation: hashCanonical(input.investigation),
    evidenceMutations: hashCanonical(input.evidenceMutations),
    graphVersions: hashCanonical(input.graphVersions),
    replays: hashCanonical(input.replays),
    branches: hashCanonical(input.branches),
    simulations: hashCanonical(input.simulations),
    auditEvents: hashCanonical(input.auditEvents),
    scientificLimitations: hashCanonical(input.scientificLimitations),
  };
}

function assertNoSecrets(value: unknown, location = "package"): void {
  if (typeof value === "string") {
    if (/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|(?:private[_ -]?key|secret[_ -]?key|password|credential)\s*[:=]/i.test(value)) throw new Error(`Unsafe secret-like content at ${location}.`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((item, index) => assertNoSecrets(item, `${location}[${index}]`)); return; }
  if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, child]) => assertNoSecrets(child, `${location}.${key}`));
}

export function exportInvestigationPackage(repo: InvestigationRepository, investigationId: string, exportedAt = new Date().toISOString()): PortableInvestigationPackage {
  const investigation = repo.loadInvestigation(investigationId);
  repo.appendCustomEvent(investigationId, "package.exported", { packageVersion: PORTABLE_PACKAGE_VERSION }, "local-export", exportedAt);
  const auditEvents = repo.ledger(investigationId);
  const input = {
    packageVersion: PORTABLE_PACKAGE_VERSION,
    exportedAt,
    metadata: { investigationId, title: investigation.title, status: investigation.status, source: "causal-proof-local" as const },
    investigation,
    evidenceMutations: investigation.evidence.flatMap((record) => record.history),
    graphVersions: repo.listGraphVersions(investigationId),
    replays: repo.listReplays(investigationId),
    branches: repo.listBranches(investigationId),
    simulations: repo.listSimulations(investigationId),
    auditEvents,
    scientificLimitations: limitations,
  };
  const manifestWithoutHash = { manifestId: `manifest-${hashCanonical({ investigationId, exportedAt }).slice(7, 23)}`, sectionHashes: sectionHashes(input), auditEventCount: auditEvents.length, auditHeadHash: auditEvents.at(-1)?.eventHash ?? null, scientificLimitationsHash: hashCanonical(limitations) };
  const manifest = { ...manifestWithoutHash, manifestHash: hashCanonical(manifestWithoutHash) };
  repo.saveExportManifest(investigationId, manifest, exportedAt);
  return { ...input, integrityManifest: manifest };
}

export function verifyInvestigationPackage(input: unknown): { valid: boolean; integrity: LedgerVerification; issues: string[] } {
  const issues: string[] = [];
  if (!input || typeof input !== "object") return { valid: false, integrity: { valid: false, status: "integrity_failure", checkedEvents: 0, headHash: null, issues: ["Package must be an object."], authenticityNote: "Package is not valid." }, issues: ["Package must be an object."] };
  const pack = input as Partial<PortableInvestigationPackage>;
  if (pack.packageVersion !== PORTABLE_PACKAGE_VERSION) issues.push(`Unsupported package version: ${String(pack.packageVersion)}.`);
  if (!Array.isArray(pack.auditEvents) || !Array.isArray(pack.replays) || !Array.isArray(pack.branches) || !Array.isArray(pack.simulations) || !Array.isArray(pack.scientificLimitations)) issues.push("Package sections are malformed.");
  const parsedInvestigation = InvestigationSchema.safeParse(pack.investigation);
  if (!parsedInvestigation.success) issues.push("Package investigation fails the domain schema.");
  if (parsedInvestigation.success && pack.metadata && pack.metadata.investigationId !== parsedInvestigation.data.id) issues.push("Package metadata investigation ID does not match the domain record.");
  if (parsedInvestigation.success && Array.isArray(pack.auditEvents)) {
    pack.auditEvents.forEach((event) => { if (event.investigationId !== parsedInvestigation.data.id) issues.push(`Cross-investigation audit event reference: ${event.eventId}.`); });
  }
  if (parsedInvestigation.success && Array.isArray(pack.branches)) {
    pack.branches.forEach((branch) => { if (branch.parentInvestigationId !== parsedInvestigation.data.id) issues.push(`Cross-investigation branch reference: ${branch.id}.`); });
  }
  try { assertNoSecrets(input); } catch (error) { issues.push(error instanceof Error ? error.message : "Package contains unsafe secret-like content."); }
  const integrity = Array.isArray(pack.auditEvents) ? verifyLedgerEvents(pack.auditEvents) : { valid: false, status: "integrity_failure" as const, checkedEvents: 0, headHash: null, issues: ["Audit events are malformed."], authenticityNote: "Package is not valid." };
  issues.push(...integrity.issues);
  if (pack.integrityManifest && typeof pack.integrityManifest === "object") {
    const manifest = pack.integrityManifest;
    if (manifest.auditEventCount !== pack.auditEvents?.length) issues.push("Manifest event count does not match the package.");
    if ((manifest.auditHeadHash ?? null) !== integrity.headHash) issues.push("Manifest audit head does not match the package.");
    const inputWithoutManifest = { packageVersion: pack.packageVersion, exportedAt: pack.exportedAt, metadata: pack.metadata, investigation: pack.investigation, evidenceMutations: pack.evidenceMutations, graphVersions: pack.graphVersions, replays: pack.replays, branches: pack.branches, simulations: pack.simulations, auditEvents: pack.auditEvents, scientificLimitations: pack.scientificLimitations } as Omit<PortableInvestigationPackage, "integrityManifest">;
    const calculatedSections = sectionHashes(inputWithoutManifest);
    Object.entries(calculatedSections).forEach(([key, value]) => { if (manifest.sectionHashes?.[key] !== value) issues.push(`Manifest section hash mismatch: ${key}.`); });
    const calculatedManifest = { manifestId: manifest.manifestId, sectionHashes: calculatedSections, auditEventCount: manifest.auditEventCount, auditHeadHash: manifest.auditHeadHash, scientificLimitationsHash: manifest.scientificLimitationsHash };
    if (manifest.manifestHash !== hashCanonical(calculatedManifest)) issues.push("Manifest hash mismatch.");
  } else issues.push("Integrity manifest is missing.");
  return { valid: issues.length === 0, integrity, issues };
}

export function importInvestigationPackage(repo: InvestigationRepository, input: unknown, actorId = "package-import"): Investigation {
  const verification = verifyInvestigationPackage(input);
  if (!verification.valid) throw new Error(`Package verification failed: ${verification.issues.join(" ")}`);
  return repo.importPortablePackage(input as PortableInvestigationPackage, actorId);
}

export function writeInvestigationPackage(filename: string, pack: PortableInvestigationPackage): void {
  if (filename.split(/[\\/]/).includes("..")) throw new Error("Unsafe package path.");
  const resolved = path.resolve(filename);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(pack, null, 2), { encoding: "utf8", flag: "wx" });
}

export function readInvestigationPackage(filename: string): PortableInvestigationPackage {
  if (filename.split(/[\\/]/).includes("..")) throw new Error("Unsafe package path.");
  const resolved = path.resolve(filename);
  const parsed: unknown = JSON.parse(fs.readFileSync(resolved, "utf8"));
  const verification = verifyInvestigationPackage(parsed);
  if (!verification.valid) throw new Error(`Package verification failed: ${verification.issues.join(" ")}`);
  return parsed as PortableInvestigationPackage;
}
