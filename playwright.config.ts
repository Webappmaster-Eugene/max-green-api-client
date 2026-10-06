import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "e2e",
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:18793" },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: "http://127.0.0.1:18793/health",
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "desktop",
      use: {
        viewport: { width: 1280, height: 800 },
        extraHTTPHeaders: { "X-Forwarded-For": "127.0.0.10" },
      },
    },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        extraHTTPHeaders: { "X-Forwarded-For": "127.0.0.20" },
      },
    },
  ],
});
