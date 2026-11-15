import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const args = process.argv.slice(2);
const filename = args.find((arg) => !arg.startsWith("--"));
const checkpointFile = args[args.indexOf("--checkpoint") + 1];
const publicKeyFile = args[args.indexOf("--public-key") + 1];
if (!filename) { console.error("Usage: npm run verify:package -- path/to/investigation.causalproof.json [--checkpoint checkpoint.json --public-key public.pem]"); process.exit(2); }
const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)])) : value;
const hash = (value) => `sha256:${crypto.createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex")}`;
const issues = [];
const fail = (code, message) => issues.push(`${code}: ${message}`);
const inspectSecrets = (value, location = "package") => { if (typeof value === "string") { if (/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|(?:private[_ -]?key|secret[_ -]?key|password|credential)\s*[:=]/i.test(value)) fail("SECRET_LIKE_CONTENT", location); return; } if (Array.isArray(value)) value.forEach((item, index) => inspectSecrets(item, `${location}[${index}]`)); else if (value && typeof value === "object") Object.entries(value).forEach(([key, child]) => { if (/^(?:password|passphrase|token|secret|credential|private[_ -]?key|authorization|api[_ -]?key)$/i.test(key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`))) fail("SECRET_LIKE_CONTENT", `${location}.${key}`); inspectSecrets(child, `${location}.${key}`); }); };
let pack;
try { pack = JSON.parse(fs.readFileSync(path.resolve(filename), "utf8")); } catch (error) { console.error(`INVALID PACKAGE: PACKAGE_READ_FAILED: ${error.message}`); process.exit(1); }
if (!pack || typeof pack !== "object") fail("STRUCTURE_INVALID", "Package must be an object.");
inspectSecrets(pack);
if (pack?.packageVersion !== "1.0") fail("PACKAGE_VERSION_UNSUPPORTED", `Expected 1.0, received ${String(pack?.packageVersion)}.`);
for (const section of ["metadata", "investigation", "evidenceMutations", "graphVersions", "replays", "branches", "simulations", "auditEvents", "scientificLimitations", "integrityManifest"]) if (!(section in (pack ?? {}))) fail("SECTION_MISSING", section);
const investigation = pack?.investigation;
if (!investigation?.id || !Array.isArray(investigation?.evidence) || !Array.isArray(investigation?.events)) fail("INVESTIGATION_SCHEMA_INVALID", "Investigation identity, evidence, or events are missing.");
if (pack?.metadata?.investigationId !== investigation?.id) fail("IDENTITY_MISMATCH", "Metadata and investigation identities differ.");
const evidenceIds = new Set((investigation?.evidence ?? []).map((record) => record.id));
const eventIds = new Set((investigation?.events ?? []).map((event) => event.id));
const events = Array.isArray(pack?.auditEvents) ? pack.auditEvents : [];
let previous = null;
for (let index = 0; index < events.length; index += 1) {
  const event = events[index];
  if (event.investigationId !== investigation?.id) fail("CROSS_REFERENCE_INVALID", `Audit event ${event.eventId} belongs to another investigation.`);
  if (event.sequence !== index + 1) fail("LEDGER_SEQUENCE_INVALID", `Audit event ${event.eventId}.`);
  if (event.previousEventHash !== previous) fail("LEDGER_PREVIOUS_HASH_INVALID", `Audit event ${event.eventId}.`);
  if (event.canonicalPayloadHash !== hash(event.payload)) fail("LEDGER_PAYLOAD_HASH_INVALID", `Audit event ${event.eventId}.`);
  const eventInput = { eventId: event.eventId, investigationId: event.investigationId, eventType: event.eventType, recordedAt: event.recordedAt, actorId: event.actorId, previousEventHash: event.previousEventHash, canonicalPayloadHash: event.canonicalPayloadHash, schemaVersion: event.schemaVersion };
  if (event.eventHash !== hash(eventInput)) fail("LEDGER_EVENT_HASH_INVALID", `Audit event ${event.eventId}.`);
  previous = event.eventHash;
}
const expectedMutations = (investigation?.evidence ?? []).flatMap((record) => record.history ?? []);
if (hash(expectedMutations) !== hash(pack?.evidenceMutations ?? [])) fail("MUTATION_SET_MISMATCH", "Evidence mutation section differs from investigation histories.");
const graphHashes = new Set();
for (let index = 0; index < (pack?.graphVersions ?? []).length; index += 1) { const version = pack.graphVersions[index]; if (version.version !== index + 1) fail("GRAPH_VERSION_SEQUENCE_INVALID", String(version.version)); if (graphHashes.has(version.graphHash)) fail("GRAPH_VERSION_DUPLICATE", version.graphHash); graphHashes.add(version.graphHash); if (hash(version.graph) !== version.graphHash) fail("GRAPH_HASH_MISMATCH", String(version.version)); }
const replayIds = new Set();
const replayHashes = new Set();
for (const replay of pack?.replays ?? []) { replayIds.add(replay.replayId); replayHashes.add(replay.replayHash); const { replayHash, ...withoutHash } = replay; if (replayHash !== hash(withoutHash)) fail("REPLAY_HASH_MISMATCH", replay.replayId); if (replay.investigationId !== investigation?.id) fail("CROSS_REFERENCE_INVALID", replay.replayId); if ([...(replay.knownEventIds ?? []), ...(replay.generatedAlertIds ?? [])].some((id) => !eventIds.has(id)) || (replay.knownEvidenceIds ?? []).some((id) => !evidenceIds.has(id))) fail("REPLAY_REFERENCE_INVALID", replay.replayId); if ((replay.knownEventIds ?? []).some((id) => (replay.hindsightExcludedEventIds ?? []).includes(id)) || (replay.knownEvidenceIds ?? []).some((id) => (replay.hindsightExcludedEvidenceIds ?? []).includes(id))) fail("HINDSIGHT_BOUNDARY_INVALID", replay.replayId); }
for (const simulation of pack?.simulations ?? []) { const { inputHash, ...withoutHash } = simulation.input; if (inputHash !== hash(withoutHash)) fail("SIMULATION_INPUT_HASH_MISMATCH", simulation.controlId); if (simulation.scenarioId !== investigation?.id || simulation.input?.scenarioId !== investigation?.id) fail("CROSS_REFERENCE_INVALID", simulation.controlId); }
for (const branch of pack?.branches ?? []) { if (!replayHashes.has(branch.replayHash)) fail("BRANCH_REPLAY_INVALID", branch.id); if ((branch.availableEventIds ?? []).some((id) => !eventIds.has(id)) || (branch.availableEvidenceIds ?? []).some((id) => !evidenceIds.has(id))) fail("BRANCH_REFERENCE_INVALID", branch.id); }
const suggestionIds = new Set((pack?.copilotRuns ?? []).flatMap((run) => (run.answer?.recommendations ?? []).map((recommendation) => recommendation.actionId)));
for (const run of pack?.copilotRuns ?? []) { if (run.investigationId !== investigation?.id || run.answer?.investigationId !== investigation?.id) fail("COPILOT_IDENTITY_INVALID", run.runId); for (const claim of run.answer?.claims ?? []) for (const citation of claim.evidenceReferences ?? []) if (!evidenceIds.has(citation.evidenceId) || citation.investigationId !== investigation?.id) fail("COPILOT_CITATION_INVALID", claim.claimId); }
for (const review of pack?.copilotReviews ?? []) if (review.investigationId !== investigation?.id || !suggestionIds.has(review.suggestionId)) fail("REVIEW_REFERENCE_INVALID", review.reviewId);
const manifest = pack?.integrityManifest;
if (!manifest) fail("MANIFEST_MISSING", "Integrity manifest is required.");
if (manifest) { if (manifest.auditEventCount !== events.length) fail("MANIFEST_LEDGER_COUNT_MISMATCH", "Event count."); if ((manifest.auditHeadHash ?? null) !== previous) fail("MANIFEST_LEDGER_HEAD_MISMATCH", "Ledger head."); const sections = { metadata: hash(pack.metadata), investigation: hash(pack.investigation), evidenceMutations: hash(pack.evidenceMutations), graphVersions: hash(pack.graphVersions), replays: hash(pack.replays), branches: hash(pack.branches), simulations: hash(pack.simulations), auditEvents: hash(pack.auditEvents), scientificLimitations: hash(pack.scientificLimitations) }; if (pack.copilotRuns !== undefined) sections.copilotRuns = hash(pack.copilotRuns); if (pack.copilotReviews !== undefined) sections.copilotReviews = hash(pack.copilotReviews); for (const [key, value] of Object.entries(sections)) if (manifest.sectionHashes?.[key] !== value) fail("MANIFEST_SECTION_HASH_MISMATCH", key); if (manifest.scientificLimitationsHash !== hash(pack.scientificLimitations)) fail("LIMITATIONS_HASH_MISMATCH", "Scientific limitations."); const manifestInput = { manifestId: manifest.manifestId, sectionHashes: sections, auditEventCount: manifest.auditEventCount, auditHeadHash: manifest.auditHeadHash, scientificLimitationsHash: manifest.scientificLimitationsHash }; if (manifest.manifestHash !== hash(manifestInput)) fail("MANIFEST_HASH_MISMATCH", "Manifest."); }
let trustedCheckpoint = false;
if (checkpointFile) { try { const checkpoint = JSON.parse(fs.readFileSync(path.resolve(checkpointFile), "utf8")); if (checkpoint.investigationId !== investigation?.id || checkpoint.ledgerHeadHash !== (previous ?? null)) fail("CHECKPOINT_MISMATCH", "Checkpoint does not match package identity or ledger head."); else if (publicKeyFile && checkpoint.signature) { const publicKey = crypto.createPublicKey(fs.readFileSync(path.resolve(publicKeyFile), "utf8")); const signed = { investigationId: checkpoint.investigationId, checkpointSequence: checkpoint.checkpointSequence, eventCount: checkpoint.eventCount, ledgerHeadHash: checkpoint.ledgerHeadHash, schemaVersion: checkpoint.schemaVersion }; trustedCheckpoint = crypto.verify(null, Buffer.from(JSON.stringify(normalize(signed))), publicKey, Buffer.from(checkpoint.signature, "base64")); if (!trustedCheckpoint) fail("CHECKPOINT_SIGNATURE_INVALID", "Explicit offline public key did not verify checkpoint."); } else fail("CHECKPOINT_KEY_MISSING", "A checkpoint requires an explicitly supplied public key; embedded keys are never trusted."); } catch (error) { fail("CHECKPOINT_READ_FAILED", error.message); } }
if (issues.length) { console.error(`INVALID PACKAGE: ${issues.join("; ")}`); process.exit(1); }
console.log(JSON.stringify({ valid: true, structuralValid: true, semanticValid: true, trust: trustedCheckpoint ? "trusted_checkpoint" : "untrusted_self_consistent", authenticity: "not_established", investigationId: investigation.id, auditEvents: events.length, head: previous ?? null }));
