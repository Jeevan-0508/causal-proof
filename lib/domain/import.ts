import { EventSchema, type IncidentEvent } from "./types";

const DEFAULT_LIMITS = { maxBytes: 1_000_000, maxRecords: 5_000 };
const CSV_HEADERS = ["id", "kind", "occurredAt", "ingestedAt", "actorId", "accountId", "summary", "amountCents", "sourceRef", "attributes"];

function enforceLimits(text: string, maxBytes: number) {
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`Import exceeds the ${maxBytes}-byte limit.`);
}

export function validateImportedEvents(input: unknown, maxRecords = DEFAULT_LIMITS.maxRecords): IncidentEvent[] {
  if (!Array.isArray(input)) throw new Error("Imported JSON must contain an array of event records.");
  if (input.length > maxRecords) throw new Error(`Import exceeds the ${maxRecords}-record limit.`);
  return input.map((record, index) => {
    const result = EventSchema.safeParse(record);
    if (!result.success) throw new Error(`Invalid event at row ${index + 1}: ${result.error.issues[0]?.message ?? "schema error"}`);
    return result.data;
  });
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { cells.push(cell.trim()); cell = ""; }
    else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  cells.push(cell.trim());
  return cells;
}

export function parseEventImport(text: string, format: "json" | "csv", options: Partial<typeof DEFAULT_LIMITS> = {}): IncidentEvent[] {
  const limits = { ...DEFAULT_LIMITS, ...options };
  enforceLimits(text, limits.maxBytes);
  if (format === "json") {
    try { return validateImportedEvents(JSON.parse(text), limits.maxRecords); }
    catch (error) { throw new Error(error instanceof Error ? error.message : "Invalid JSON import."); }
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) throw new Error("CSV must include a header and at least one event row.");
  const headers = parseCsvLine(lines[0]);
  if (headers.length !== CSV_HEADERS.length || headers.some((header) => !CSV_HEADERS.includes(header))) throw new Error(`CSV headers must be exactly: ${CSV_HEADERS.join(", ")}.`);
  const rows = lines.slice(1);
  if (rows.length > limits.maxRecords) throw new Error(`Import exceeds the ${limits.maxRecords}-record limit.`);
  const records = rows.map((line, index) => {
    const cells = parseCsvLine(line);
    if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${cells.length} cells; expected ${headers.length}.`);
    const values = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex]])) as Record<string, string>;
    let attributes: Record<string, string>;
    try { attributes = values.attributes ? JSON.parse(values.attributes) : {}; }
    catch { throw new Error(`CSV row ${index + 2} contains invalid attributes JSON.`); }
    return { ...values, amountCents: values.amountCents ? Number(values.amountCents) : undefined, attributes };
  });
  return validateImportedEvents(records, limits.maxRecords);
}
