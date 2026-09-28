import "dotenv/config";
import { defineConfig } from "@playwright/test";

/**
 * اختبارات طرف-لطرف على قاعدة التطوير المعبأة بالبيانات التجريبية (npm run db:seed).
 * تعيد الاختبارات أي بيانات تغيّرها إلى حالتها الأصلية.
 */
const baseURL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "ar-SA",
    viewport: { width: 1440, height: 900 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" },
    trace: "retain-on-failure",
  },
  webServer: { command: "npm run dev", url: `${baseURL}/login`, reuseExistingServer: true, timeout: 120_000 },
});
