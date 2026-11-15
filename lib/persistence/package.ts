import fs from "node:fs";
import path from "node:path";
import { hashCanonical } from "../domain/canonical";
import { InvestigationSchema, type DecisionReplay, type Investigation, type InvestigationBranch, type SimulationResult } from "../domain/types";
import { verifyLedgerEvents, type LedgerEvent, type LedgerVerification } from "./ledger";
import type { InvestigationRepository } from "./sqlite";
import type { CopilotReview, CopilotRun } from "../copilot/types";
import { CopilotAnswerSchema } from "../copilot/types";

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
  copilotRuns?: CopilotRun[];
  copilotReviews?: CopilotReview[];
  auditEvents: LedgerEvent[];
  scientificLimitations: string[];
  integrityManifest: IntegrityManifest;
};

const limitations = [
  "The package is synthetic/local-first evidence organization and scenario analysis, not a causal oracle.",
  "A local hash chain is tamper-evident but cannot prove complete authenticity without an external trusted anchor.",
  "A valid optional signature binds bytes to a trusted signing key; it does not establish that evidence is truthful.",
  "Simulations are deterministic illustrative scenarios, not empirical causal effects or legal findings.",
  "Authentication and authorization are enforced locally, but this package is not a legal chain-of-custody guarantee.",
];

function sectionHashes(input: Omit<PortableInvestigationPackage, "integrityManifest">): Record<string, string> {
  const hashes: Record<string, string> = {
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
  if (input.copilotRuns !== undefined) hashes.copilotRuns = hashCanonical(input.copilotRuns);
  if (input.copilotReviews !== undefined) hashes.copilotReviews = hashCanonical(input.copilotReviews);
  return hashes;
}

export function assertNoSecrets(value: unknown, location = "package"): void {
  if (typeof value === "string") {
    if (/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|(?:private[_ -]?key|secret[_ -]?key|password|credential)\s*[:=]/i.test(value)) throw new Error(`Unsafe secret-like content at ${location}.`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((item, index) => assertNoSecrets(item, `${location}[${index}]`)); return; }
  if (value && typeof value === "object") Object.entries(value as Record<string, unknown>).forEach(([key, child]) => { if (/^(?:password|passphrase|token|secret|credential|private[_ -]?key|authorization|api[_ -]?key)$/i.test(key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`))) throw new Error(`Unsafe secret-like field at ${location}.${key}.`); assertNoSecrets(child, `${location}.${key}`); });
}

export function exportInvestigationPackage(repo: InvestigationRepository, investigationId: string, exportedAt = new Date().toISOString()): PortableInvestigationPackage {
  const investigation = repo.loadInvestigation(investigationId);
  assertNoSecrets(investigation, "investigation");
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
    copilotRuns: repo.listCopilotRuns(investigationId),
    copilotReviews: repo.listCopilotReviews(investigationId),
    auditEvents,
    scientificLimitations: limitations,
  };
  const manifestWithoutHash = { manifestId: `manifest-${hashCanonical({ investigationId, exportedAt }).slice(7, 23)}`, sectionHashes: sectionHashes(input), auditEventCount: auditEvents.length, auditHeadHash: auditEvents.at(-1)?.eventHash ?? null, scientificLimitationsHash: hashCanonical(limitations) };
  const manifest = { ...manifestWithoutHash, manifestHash: hashCanonical(manifestWithoutHash) };
  repo.saveExportManifest(investigationId, manifest, exportedAt);
  return { ...input, integrityManifest: manifest };
}

export type PortableVerification = {
  valid: boolean;
  structuralValid: boolean;
  semanticValid: boolean;
  integrity: LedgerVerification;
  issues: string[];
  codes: string[];
  trust: "untrusted_self_consistent" | "trusted_checkpoint_not_supplied";
  authenticity: "not_established";
};

export function verifyInvestigationPackage(input: unknown): PortableVerification {
  const issues: string[] = [];
  const codes: string[] = [];
  const fail = (code: string, message: string) => { codes.push(code); issues.push(`${code}: ${message}`); };
  if (!input || typeof input !== "object") return { valid: false, structuralValid: false, semanticValid: false, integrity: { valid: false, status: "integrity_failure", checkedEvents: 0, headHash: null, issues: ["Package must be an object."], authenticityNote: "Package is not valid." }, issues: ["STRUCTURE_INVALID: Package must be an object."], codes: ["STRUCTURE_INVALID"], trust: "untrusted_self_consistent", authenticity: "not_established" };
  const pack = input as Partial<PortableInvestigationPackage>;
  if (pack.packageVersion !== PORTABLE_PACKAGE_VERSION) fail("PACKAGE_VERSION_UNSUPPORTED", `Unsupported package version: ${String(pack.packageVersion)}.`);
  const requiredSections = ["metadata", "investigation", "evidenceMutations", "graphVersions", "replays", "branches", "simulations", "auditEvents", "scientificLimitations", "integrityManifest"] as const;
  for (const section of requiredSections) if (!(section in pack)) fail("SECTION_MISSING", `Required section is missing: ${section}.`);
  if (!Array.isArray(pack.auditEvents) || !Array.isArray(pack.replays) || !Array.isArray(pack.branches) || !Array.isArray(pack.simulations) || !Array.isArray(pack.evidenceMutations) || !Array.isArray(pack.graphVersions) || !Array.isArray(pack.scientificLimitations) || (pack.copilotRuns !== undefined && !Array.isArray(pack.copilotRuns)) || (pack.copilotReviews !== undefined && !Array.isArray(pack.copilotReviews))) fail("SECTION_MALFORMED", "One or more package sections are malformed.");
  const parsedInvestigation = InvestigationSchema.safeParse(pack.investigation);
  if (!parsedInvestigation.success) fail("INVESTIGATION_SCHEMA_INVALID", "Package investigation fails the domain schema.");
  const investigation = parsedInvestigation.success ? parsedInvestigation.data : undefined;
  if (investigation && pack.metadata && pack.metadata.investigationId !== investigation.id) fail("IDENTITY_MISMATCH", "Package metadata investigation ID does not match the domain record.");
  if (investigation && pack.metadata && pack.metadata.title !== investigation.title) fail("IDENTITY_MISMATCH", "Package metadata title does not match the domain record.");
  if (parsedInvestigation.success && Array.isArray(pack.auditEvents)) {
    pack.auditEvents.forEach((event) => { if (event.investigationId !== parsedInvestigation.data.id) fail("CROSS_REFERENCE_INVALID", `Cross-investigation audit event reference: ${event.eventId}.`); });
  }
  if (parsedInvestigation.success && Array.isArray(pack.branches)) {
    pack.branches.forEach((branch) => { if (branch.parentInvestigationId !== parsedInvestigation.data.id) fail("CROSS_REFERENCE_INVALID", `Cross-investigation branch reference: ${branch.id}.`); });
  }
  try { assertNoSecrets(input); } catch (error) { fail("SECRET_LIKE_CONTENT", error instanceof Error ? error.message : "Package contains unsafe secret-like content."); }
  const integrity = Array.isArray(pack.auditEvents) ? verifyLedgerEvents(pack.auditEvents) : { valid: false, status: "integrity_failure" as const, checkedEvents: 0, headHash: null, issues: ["Audit events are malformed."], authenticityNote: "Package is not valid." };
  for (const issue of integrity.issues) fail("LEDGER_INVALID", issue);
  if (investigation && Array.isArray(pack.evidenceMutations)) {
    const expected = investigation.evidence.flatMap((record) => record.history);
    if (hashCanonical(expected) !== hashCanonical(pack.evidenceMutations)) fail("MUTATION_SET_MISMATCH", "Evidence mutation section does not match the immutable investigation histories.");
    for (const mutation of pack.evidenceMutations) if (mutation.evidenceId && !investigation.evidence.some((record) => record.id === mutation.evidenceId)) fail("CROSS_REFERENCE_INVALID", `Mutation references unknown evidence: ${mutation.id}.`);
    if (investigation.evidence.some((record) => record.history.some((mutation, index, all) => index > 0 && Date.parse(mutation.recordedAt) < Date.parse(all[index - 1]!.recordedAt)))) fail("MUTATION_ORDER_INVALID", "Evidence mutation history is not ordered by recorded time.");
  }
  const evidenceIds = new Set(investigation?.evidence.map((record) => record.id) ?? []);
  const eventIds = new Set(investigation?.events.map((event) => event.id) ?? []);
  const graphHashes = new Set<string>();
  if (Array.isArray(pack.graphVersions)) pack.graphVersions.forEach((version, index) => {
    if (Number(version.version) !== index + 1) fail("GRAPH_VERSION_SEQUENCE_INVALID", `Graph version sequence is invalid at ${version.version}.`);
    if (graphHashes.has(version.graphHash)) fail("GRAPH_VERSION_DUPLICATE", `Duplicate graph version hash: ${version.graphHash}.`);
    graphHashes.add(version.graphHash);
    if (version.graph && hashCanonical(version.graph) !== version.graphHash) fail("GRAPH_HASH_MISMATCH", `Graph hash mismatch at version ${version.version}.`);
  });
  const replayIds = new Set<string>();
  const replayHashes = new Set<string>();
  if (Array.isArray(pack.replays)) pack.replays.forEach((replay) => {
    replayIds.add(replay.replayId);
    replayHashes.add(replay.replayHash);
    const { replayHash, ...replayWithoutHash } = replay;
    if (replayHash !== hashCanonical(replayWithoutHash)) fail("REPLAY_HASH_MISMATCH", `Replay hash mismatch: ${replay.replayId}.`);
    if (replay.investigationId !== investigation?.id) fail("CROSS_REFERENCE_INVALID", `Replay belongs to another investigation: ${replay.replayId}.`);
    if (replay.knownEventIds.some((id) => !eventIds.has(id)) || replay.generatedAlertIds.some((id) => !eventIds.has(id)) || replay.knownEvidenceIds.some((id) => !evidenceIds.has(id))) fail("REPLAY_REFERENCE_INVALID", `Replay references unknown records: ${replay.replayId}.`);
    if (replay.hindsightExcludedEventIds.some((id) => replay.knownEventIds.includes(id)) || replay.hindsightExcludedEvidenceIds.some((id) => replay.knownEvidenceIds.includes(id))) fail("HINDSIGHT_BOUNDARY_INVALID", `Replay known and excluded sets overlap: ${replay.replayId}.`);
  });
  if (Array.isArray(pack.simulations)) pack.simulations.forEach((simulation) => {
    const { inputHash, ...inputWithoutHash } = simulation.input;
    if (inputHash !== hashCanonical(inputWithoutHash)) fail("SIMULATION_INPUT_HASH_MISMATCH", `Simulation input hash mismatch: ${simulation.controlId}.`);
    if (simulation.input.scenarioId !== investigation?.id || simulation.scenarioId !== investigation?.id) fail("CROSS_REFERENCE_INVALID", `Simulation scenario does not match the investigation: ${simulation.controlId}.`);
  });
  if (Array.isArray(pack.branches)) pack.branches.forEach((branch) => {
    if (!replayHashes.has(branch.replayHash)) fail("BRANCH_REPLAY_INVALID", `Branch replay is not present in the package: ${branch.id}.`);
    if (branch.availableEventIds.some((id) => !eventIds.has(id)) || branch.availableEvidenceIds.some((id) => !evidenceIds.has(id))) fail("BRANCH_REFERENCE_INVALID", `Branch references unknown records: ${branch.id}.`);
  });
  for (const run of pack.copilotRuns ?? []) {
    if (run.investigationId !== investigation?.id || run.answer.investigationId !== investigation?.id) fail("COPILOT_IDENTITY_INVALID", `Copilot run belongs to another investigation: ${run.runId}.`);
    if (!CopilotAnswerSchema.safeParse(run.answer).success) fail("COPILOT_SCHEMA_INVALID", `Copilot answer is malformed: ${run.runId}.`);
    for (const claim of run.answer.claims) for (const citation of claim.evidenceReferences) if (!evidenceIds.has(citation.evidenceId) || citation.investigationId !== investigation?.id) fail("COPILOT_CITATION_INVALID", `Copilot citation is not package-authorized: ${claim.claimId}.`);
  }
  const suggestionIds = new Set((pack.copilotRuns ?? []).flatMap((run) => run.answer.recommendations.map((recommendation) => recommendation.actionId)));
  for (const review of pack.copilotReviews ?? []) if (review.investigationId !== investigation?.id || !suggestionIds.has(review.suggestionId)) fail("REVIEW_REFERENCE_INVALID", `Copilot review references an unavailable suggestion: ${review.reviewId}.`);
  if (pack.integrityManifest && typeof pack.integrityManifest === "object") {
    const manifest = pack.integrityManifest;
    if (manifest.auditEventCount !== pack.auditEvents?.length) fail("MANIFEST_LEDGER_COUNT_MISMATCH", "Manifest event count does not match the package.");
    if ((manifest.auditHeadHash ?? null) !== integrity.headHash) fail("MANIFEST_LEDGER_HEAD_MISMATCH", "Manifest audit head does not match the package.");
    const inputWithoutManifest = { packageVersion: pack.packageVersion, exportedAt: pack.exportedAt, metadata: pack.metadata, investigation: pack.investigation, evidenceMutations: pack.evidenceMutations, graphVersions: pack.graphVersions, replays: pack.replays, branches: pack.branches, simulations: pack.simulations, auditEvents: pack.auditEvents, scientificLimitations: pack.scientificLimitations, ...(pack.copilotRuns !== undefined ? { copilotRuns: pack.copilotRuns } : {}), ...(pack.copilotReviews !== undefined ? { copilotReviews: pack.copilotReviews } : {}) } as Omit<PortableInvestigationPackage, "integrityManifest">;
    const calculatedSections = sectionHashes(inputWithoutManifest);
    Object.entries(calculatedSections).forEach(([key, value]) => { if (manifest.sectionHashes?.[key] !== value) fail("MANIFEST_SECTION_HASH_MISMATCH", `Manifest section hash mismatch: ${key}.`); });
    const calculatedManifest = { manifestId: manifest.manifestId, sectionHashes: calculatedSections, auditEventCount: manifest.auditEventCount, auditHeadHash: manifest.auditHeadHash, scientificLimitationsHash: manifest.scientificLimitationsHash };
    if (manifest.manifestHash !== hashCanonical(calculatedManifest)) fail("MANIFEST_HASH_MISMATCH", "Manifest hash mismatch.");
    if (manifest.scientificLimitationsHash !== hashCanonical(pack.scientificLimitations)) fail("LIMITATIONS_HASH_MISMATCH", "Scientific limitations hash mismatch.");
  } else fail("MANIFEST_MISSING", "Integrity manifest is missing.");
  const structuralValid = !codes.some((code) => ["PACKAGE_VERSION_UNSUPPORTED", "SECTION_MISSING", "SECTION_MALFORMED", "INVESTIGATION_SCHEMA_INVALID", "SECRET_LIKE_CONTENT"].includes(code));
  const semanticValid = !codes.some((code) => ["IDENTITY_MISMATCH", "CROSS_REFERENCE_INVALID", "MUTATION_SET_MISMATCH", "MUTATION_ORDER_INVALID", "GRAPH_VERSION_SEQUENCE_INVALID", "GRAPH_VERSION_DUPLICATE", "GRAPH_HASH_MISMATCH", "REPLAY_HASH_MISMATCH", "REPLAY_REFERENCE_INVALID", "HINDSIGHT_BOUNDARY_INVALID", "SIMULATION_INPUT_HASH_MISMATCH", "BRANCH_REPLAY_INVALID", "BRANCH_REFERENCE_INVALID", "COPILOT_IDENTITY_INVALID", "COPILOT_SCHEMA_INVALID", "COPILOT_CITATION_INVALID", "REVIEW_REFERENCE_INVALID"].includes(code));
  return { valid: issues.length === 0, structuralValid, semanticValid, integrity, issues, codes, trust: "untrusted_self_consistent", authenticity: "not_established" };
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
