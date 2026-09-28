/**
 * تهيئة قاعدة الاختبار: تطبيق الترحيلات فقط (دون حذف بيانات).
 * يتطلب TEST_DATABASE_URL في .env يشير إلى قاعدة منفصلة عن قاعدة التطوير.
 */
import "dotenv/config";
import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL غير مضبوط — أضفه إلى .env لتشغيل اختبارات التكامل");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL يجب أن يختلف عن DATABASE_URL");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
