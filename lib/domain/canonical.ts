import { sha256 } from "js-sha256";

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
  }
  return value;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

export function hashEvidencePayload(payload: Record<string, string>): string {
  return `sha256:${sha256(canonicalize(payload))}`;
}

export function hashCanonical(value: unknown): string {
  return `sha256:${sha256(canonicalize(value))}`;
}
