import "dotenv/config";
import { defineConfig } from "vitest/config";

/**
 * مشروعان: unit (منطق نقي دون قاعدة بيانات) و integration (على قاعدة اختبار حقيقية TEST_DATABASE_URL).
 * اختبارات التكامل لا تحذف أي بيانات: كل تشغيل ينشئ مستأجرين جدداً بمعرّفات فريدة.
 */
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
          // عميل Prisma يُنشأ عند الاستيراد ولا يتصل إلا عند أول استعلام
          env: { DATABASE_URL: "postgresql://unit:unit@127.0.0.1:1/unit", TZ: "UTC" },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          globalSetup: ["tests/integration/global-setup.ts"],
          env: { DATABASE_URL: testDatabaseUrl, TZ: "UTC" },
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
