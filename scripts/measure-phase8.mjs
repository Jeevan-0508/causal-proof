import crypto from "node:crypto";
import { performance } from "node:perf_hooks";

const hash = (value) => `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const sizes = [10, 100, 1000];
const measurements = sizes.map((size) => {
  const records = Array.from({ length: size }, (_, index) => ({ id: `ev-${index}`, knowledgeAt: new Date( Date.UTC(2026, 3, 8, 10, index % 60)).toISOString(), payload: { synthetic: "true", index: String(index) } }));
  const start = performance.now();
  const known = records.filter((record) => Date.parse(record.knowledgeAt) <= Date.parse("2026-04-08T10:59:00.000Z"));
  const digest = hash(known);
  const elapsedMs = Number((performance.now() - start).toFixed(3));
  return { records: size, knownRecords: known.length, historicalHash: digest, elapsedMs };
});
console.log(JSON.stringify({ tool: "phase8-synthetic-cutoff-hash", node: process.version, measurements }, null, 2));
