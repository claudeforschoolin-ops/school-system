/**
 * تحقق آلي من معيار قبول المرحلة ١: السحب بين أعمدة اللوحة يغيّر الحالة ويُسجَّل.
 */
import "dotenv/config";
import { chromium } from "@playwright/test";
import { rootDb } from "../src/server/db/client";

async function main() {
  const base = process.env.BASE_URL ?? "http://localhost:3000";
  const out = process.argv[2] ?? "docs/screenshots";
  const page0 = await rootDb.page.findFirstOrThrow({ where: { title: "الخطة التشغيلية" } });
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "ar-SA" });
  page.on("pageerror", (e) => console.error("[pageerror]", e.message));
  await page.goto(`${base}/login`);
  await page.fill('input[type="email"]', "vp.academic@demo.manassa.sa");
  await page.fill('input[type="password"]', "Manassa@2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/home/);
  await page.goto(`${base}/p/${page0.id}`);
  const todoCol = page.locator('section[aria-label="جديد"]');
  const doingCol = page.locator('section[aria-label="قيد التنفيذ"]');
  await todoCol.waitFor();
  const card = todoCol.locator("article").first();
  const title = (await card.locator("p").first().innerText()).trim();
  const before = await doingCol.locator("article").count();
  const from = (await card.boundingBox())!;
  const to = (await doingCol.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 20);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(from.x + from.width / 2 + ((to.x + to.width / 2 - (from.x + from.width / 2)) * i) / 12, from.y + 20 + ((to.y + 80 - (from.y + 20)) * i) / 12);
    await page.waitForTimeout(30);
  }
  await page.screenshot({ path: `${out}/board-dragging.png` });
  await page.mouse.up();
  await page.waitForTimeout(1500);
  const after = await doingCol.locator("article").count();
  await page.screenshot({ path: `${out}/board-after-drop.png` });
  const row = await rootDb.databaseRow.findFirstOrThrow({ where: { title, databaseId: (await rootDb.database.findFirstOrThrow({ where: { pageId: page0.id } })).id } });
  const statusProp = await rootDb.databaseProperty.findFirstOrThrow({ where: { databaseId: row.databaseId, name: "الحالة" } });
  const status = (row.values as Record<string, unknown>)[statusProp.id];
  const audit = await rootDb.auditLog.findFirst({ where: { entityId: row.id, action: "UPDATE" }, orderBy: { createdAt: "desc" } });
  console.log(JSON.stringify({ title, beforeCount: before, afterCount: after, status, audited: Boolean(audit), auditBy: audit?.userName }, null, 2));
  await browser.close();
  await rootDb.$disconnect();
  if (status !== "in_progress" || after !== before + 1 || !audit) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
