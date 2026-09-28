import { expect, test, type Locator, type Page } from "@playwright/test";
import { totp } from "../../src/server/auth/totp";
import { DEMO_PASSWORD, DEMO_TOTP_SECRET } from "../../prisma/seed/data/people";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
}

async function drag(page: Page, card: Locator, target: Locator) {
  const from = (await card.boundingBox())!;
  const to = (await target.boundingBox())!;
  const sx = from.x + from.width / 2;
  const sy = from.y + 20;
  const tx = to.x + to.width / 2;
  const ty = to.y + 80;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(sx + ((tx - sx) * i) / 14, sy + ((ty - sy) * i) / 14);
    await page.waitForTimeout(25);
  }
  await page.mouse.up();
}

test("كلمة مرور خاطئة تعرض رسالة عربية ولا تدخل", async ({ page }) => {
  await page.goto("/login");
  await page.fill('input[type="email"]', "teacher@demo.manassa.sa");
  await page.fill('input[type="password"]', "wrong-password");
  await page.click('button[type="submit"]');
  await expect(page.getByText(/غير صحيحة/)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("الدخول بالمصادقة الثنائية للمديرة", async ({ page }) => {
  await login(page, "principal@demo.manassa.sa");
  await page.waitForURL(/\/two-factor/);
  await page.fill('input[autocomplete="one-time-code"]', totp(DEMO_TOTP_SECRET));
  await page.getByRole("button", { name: "تحقق", exact: true }).click();
  await page.waitForURL(/\/home/);
  await expect(page.getByText("بيانات تجريبية").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("معيار القبول: السحب بين أعمدة اللوحة يغيّر الحالة والعدّادات", async ({ page }) => {
  await login(page, "vp.academic@demo.manassa.sa");
  await page.waitForURL(/\/home/);
  await page.getByRole("link", { name: "الخطة التشغيلية" }).first().click();
  const todo = page.locator('section[aria-label="جديد"]');
  const doing = page.locator('section[aria-label="قيد التنفيذ"]');
  await todo.waitFor();

  const card = todo.locator("article").first();
  const title = (await card.locator("p").first().innerText()).trim();
  const todoBefore = await todo.locator("article").count();
  const doingBefore = await doing.locator("article").count();

  await drag(page, card, doing);
  await expect(doing.locator("article", { hasText: title })).toBeVisible();
  await expect(doing.locator("article")).toHaveCount(doingBefore + 1);
  await expect(todo.locator("article")).toHaveCount(todoBefore - 1);

  // يبقى بعد إعادة التحميل (محفوظ في الخادم)
  await page.reload();
  await expect(page.locator('section[aria-label="قيد التنفيذ"] article', { hasText: title })).toBeVisible();

  // إعادة البطاقة لمكانها حتى تبقى البيانات التجريبية كما هي
  const back = page.locator('section[aria-label="قيد التنفيذ"] article', { hasText: title });
  await drag(page, back, page.locator('section[aria-label="جديد"]'));
  await expect(page.locator('section[aria-label="جديد"] article', { hasText: title })).toBeVisible();
});
