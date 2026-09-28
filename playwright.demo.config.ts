import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Demo E2E: its own dev server with DEMO_MODE on, so the regular suite never
// runs against demo routing. Run through `npm run test:e2e:demo`.
const port = 3101;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...base,
  testDir: "./tests/e2e-demo",
  webServer: {
    command: `next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { ...base.use, baseURL, trace: "on", screenshot: "on" },
  outputDir: "test-results/e2e-demo",
});
