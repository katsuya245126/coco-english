import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { defineConfig, devices } from "@playwright/test";

const envPath = resolve(process.cwd(), ".env.local");

if (existsSync(envPath)) {
  loadEnvFile(envPath);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const localSupabase =
  !supabaseUrl ||
  /^(https?:\/\/)?(127\.0\.0\.1|localhost)(:\d+)?(?:\/|$)/.test(supabaseUrl);

if (
  !localSupabase &&
  process.env.E2E_ALLOW_HOSTED_SUPABASE_WRITES !== "true"
) {
  throw new Error(
    "Refusing to run Playwright against hosted Supabase. Use npm run test:e2e:local or explicitly set E2E_ALLOW_HOSTED_SUPABASE_WRITES=true.",
  );
}

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  expect: { timeout: 15_000 },
  webServer: {
    command: `next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
