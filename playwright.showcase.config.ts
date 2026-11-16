import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "showcase.spec.ts",
  fullyParallel: true,
  workers: 1,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:4174/causal-proof/", ...devices["Desktop Chrome"] },
  webServer: { command: "npm run preview:showcase -- --host 127.0.0.1 --port 4174", url: "http://127.0.0.1:4174/causal-proof/", reuseExistingServer: false, timeout: 120_000 },
});
