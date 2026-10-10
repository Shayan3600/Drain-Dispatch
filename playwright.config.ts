import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://localhost:5174",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
      : {},
  },
  webServer: [
    {
      command: "npx tsx tests/e2e-server.ts",
      url: "http://localhost:3002/api/health",
      reuseExistingServer: false,
      timeout: 60000,
    },
    {
      command: "npm run dev -w client -- --port 5174",
      url: "http://localhost:5174",
      env: { API_PROXY_TARGET: "http://localhost:3002" },
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
  reporter: "list",
});
