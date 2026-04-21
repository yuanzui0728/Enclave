import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: /.*\.browser\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 8_000,
  },
  reporter: "list",
  outputDir: "./node_modules/.playwright-artifacts",
  use: {
    browserName: "chromium",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
});
