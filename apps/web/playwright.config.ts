import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", workers: 1, fullyParallel: false,
  globalSetup: "./e2e/global-setup.ts",
  // Authentication artifacts and screenshots can contain customer data. Do not persist them.
  use: { baseURL: "https://st-pq-soul.rainailab.com", trace: "off", screenshot: "off", video: "off" },
});
