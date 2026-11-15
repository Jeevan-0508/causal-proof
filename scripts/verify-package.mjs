import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const filename = process.argv[2];
if (!filename) {
  console.error("Usage: npm run verify:package -- path/to/investigation.causalproof.json");
  process.exit(2);
}
const resolved = path.resolve(filename);
const pack = JSON.parse(fs.readFileSync(resolved, "utf8"));
const normalize = (value) => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)])) : value;
const hash = (value) => `sha256:${crypto.createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex")}`;
const issues = [];
const events = pack.auditEvents;
let previous = null;
for (let index = 0; index < events.length; index += 1) {
  const event = events[index];
  if (event.sequence !== index + 1) issues.push(`sequence ${event.eventId}`);
  if (event.previousEventHash !== previous) issues.push(`previous hash ${event.eventId}`);
  if (event.canonicalPayloadHash !== hash(event.payload)) issues.push(`payload hash ${event.eventId}`);
  const eventInput = { eventId: event.eventId, investigationId: event.investigationId, eventType: event.eventType, recordedAt: event.recordedAt, actorId: event.actorId, previousEventHash: event.previousEventHash, canonicalPayloadHash: event.canonicalPayloadHash, schemaVersion: event.schemaVersion };
  if (event.eventHash !== hash(eventInput)) issues.push(`event hash ${event.eventId}`);
  previous = event.eventHash;
}
if (pack.integrityManifest.auditEventCount !== events.length) issues.push("manifest event count");
if ((pack.integrityManifest.auditHeadHash ?? null) !== previous) issues.push("manifest audit head");
const sections = { metadata: hash(pack.metadata), investigation: hash(pack.investigation), evidenceMutations: hash(pack.evidenceMutations), graphVersions: hash(pack.graphVersions), replays: hash(pack.replays), branches: hash(pack.branches), simulations: hash(pack.simulations), auditEvents: hash(pack.auditEvents), scientificLimitations: hash(pack.scientificLimitations) };
for (const [key, value] of Object.entries(sections)) if (pack.integrityManifest.sectionHashes[key] !== value) issues.push(`manifest section ${key}`);
const manifestInput = { manifestId: pack.integrityManifest.manifestId, sectionHashes: sections, auditEventCount: pack.integrityManifest.auditEventCount, auditHeadHash: pack.integrityManifest.auditHeadHash, scientificLimitationsHash: pack.integrityManifest.scientificLimitationsHash };
if (pack.integrityManifest.manifestHash !== hash(manifestInput)) issues.push("manifest hash");
if (issues.length) { console.error(`INVALID PACKAGE: ${issues.join(", ")}`); process.exit(1); }
console.log(`VALID PACKAGE: ${pack.metadata.investigationId}; ${events.length} audit events; head ${previous ?? "none"}`);
