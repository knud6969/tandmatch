import { defineConfig, devices } from "@playwright/test";

// Kør via `npm run test:e2e` (tests/e2e/run.sh starter appen mod lokal Supabase og sætter E2E_BASE_URL).
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3102";
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(baseURL)) {
  throw new Error("E2E_BASE_URL skal pege på localhost.");
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL, trace: "retain-on-failure", locale: "da-DK" },
  projects: [
    { name: "mobil", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  outputDir: "test-results",
});
