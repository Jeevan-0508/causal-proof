import path from "node:path";
import type { InvestigationRepository } from "../persistence/sqlite";

export type DemoIsolationStatus = { enabled: true; databasePath: string; keyDirectory: string; anchorDirectory: string; dedicatedPath: true };

function required(name: string): string { const value = process.env[name]?.trim(); if (!value) throw new Error(`DEMO_ISOLATION_CONFIG_MISSING: ${name} is required.`); return path.resolve(value); }

export function assertDemoIsolation(): DemoIsolationStatus {
  if (process.env.NODE_ENV === "production" || process.env.CAUSAL_PROOF_DEMO_MODE !== "true") throw new Error("DEMO_ISOLATION_DISABLED: explicit non-production demo mode is required.");
  const databasePath = required("CAUSAL_PROOF_DEMO_DB_PATH");
  const configuredDatabase = required("CAUSAL_PROOF_DB_PATH");
  const keyDirectory = required("CAUSAL_PROOF_DEMO_KEY_DIR");
  const configuredKeyDirectory = required("CAUSAL_PROOF_KEY_DIR");
  const anchorDirectory = required("CAUSAL_PROOF_DEMO_ANCHOR_DIR");
  const configuredAnchorDirectory = required("CAUSAL_PROOF_ANCHOR_DIR");
  if (databasePath !== configuredDatabase) throw new Error("DEMO_ISOLATION_DATABASE_MISMATCH: the running process must use the dedicated demo database path.");
  if (keyDirectory !== configuredKeyDirectory) throw new Error("DEMO_ISOLATION_KEY_MISMATCH: the running process must use the dedicated demo key directory.");
  if (anchorDirectory !== configuredAnchorDirectory) throw new Error("DEMO_ISOLATION_ANCHOR_MISMATCH: the running process must use the dedicated demo anchor directory.");
  const marker = `${databasePath} ${keyDirectory} ${anchorDirectory}`.toLowerCase();
  if (!marker.includes("demo")) throw new Error("DEMO_ISOLATION_PATH_NOT_DEDICATED: configured demo paths must visibly identify the synthetic demo boundary.");
  return { enabled: true, databasePath, keyDirectory, anchorDirectory, dedicatedPath: true };
}

export function assertOnlySyntheticInvestigation(repo: InvestigationRepository, syntheticId: string): void {
  const ordinary = repo.listInvestigations().filter((item) => item.id !== syntheticId);
  if (ordinary.length) throw new Error(`DEMO_ISOLATION_ORDINARY_DATA: ${ordinary.length} ordinary investigation(s) are present in the demo database.`);
}
