import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2eDatabase = path.join(os.tmpdir(), `causal-proof-e2e-${process.pid}.sqlite`);
const e2eKeyDirectory = path.join(os.tmpdir(), `causal-proof-e2e-demo-keys-${process.pid}`);
const e2eAnchorDirectory = path.join(os.tmpdir(), `causal-proof-e2e-demo-anchors-${process.pid}`);
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${e2eDatabase}${suffix}`, { force: true });

export default defineConfig({
  testDir: "./tests/e2e",
  // The demo suite mutates one local SQLite investigation; parallel workers race on shared state.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://localhost:3100", trace: "on-first-retry" },
  webServer: { command: "npm run dev -- --port 3100", url: "http://localhost:3100", reuseExistingServer: false, timeout: 120_000, env: { CAUSAL_PROOF_DB_PATH: e2eDatabase, CAUSAL_PROOF_DEMO_DB_PATH: e2eDatabase, CAUSAL_PROOF_KEY_DIR: e2eKeyDirectory, CAUSAL_PROOF_DEMO_KEY_DIR: e2eKeyDirectory, CAUSAL_PROOF_ANCHOR_DIR: e2eAnchorDirectory, CAUSAL_PROOF_DEMO_ANCHOR_DIR: e2eAnchorDirectory, CAUSAL_PROOF_DEMO_MODE: "true", CAUSAL_PROOF_BOOTSTRAP_TOKEN: "playwright-only-bootstrap" } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
