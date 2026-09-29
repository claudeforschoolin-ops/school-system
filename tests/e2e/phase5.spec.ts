import { expect, test, type Page } from "@playwright/test";
import { rootDb } from "../../src/server/db/client";
import { totp } from "../../src/server/auth/totp";
import { toISODate } from "../../src/lib/dates";
import { DEMO_PASSWORD, DEMO_TOTP_SECRET } from "../../prisma/seed/data/people";

/**
 * المرحلة ٥ طرف-لطرف على البيانات التجريبية؛ ما يغيّره الاختبار يُلغى أو يُحذف في نهايته.
 */
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(home|two-factor)/);
  if (page.url().includes("two-factor")) {
    await page.fill('input[autocomplete="one-time-code"]', totp(DEMO_TOTP_SECRET));
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/home/);
  }
}

test.afterAll(async () => {
  await rootDb.$disconnect();
});

test("المقصف: بيع بالمحفظة يخصم الرصيد، وإلغاء البيع في يومه يعيده", async ({ page }) => {
  const canteen = await rootDb.user.findFirstOrThrow({ where: { email: "canteen@demo.manassa.sa" } });
  const today = toISODate(new Date(), "Asia/Riyadh");
  // محفظة في فرع البنين (فرع مسؤول المقصف) يسمح حدها اليومي بالشراء ولا أصناف ممنوعة فيها
  const boys = await rootDb.branch.findFirstOrThrow({ where: { tenantId: canteen.tenantId, gender: "BOYS" } });
  const candidates = await rootDb.studentWallet.findMany({ where: { tenantId: canteen.tenantId, isActive: true, balanceMinor: { gte: 1_000 } } });
  const students = await rootDb.student.findMany({ where: { id: { in: candidates.map((w) => w.studentId) }, branchId: boys.id }, select: { id: true, fullName: true } });
  const boughtToday = await rootDb.walletTransaction.findMany({ where: { walletId: { in: candidates.map((w) => w.id) }, kind: "PURCHASE", createdAt: { gte: new Date(Date.now() - 36 * 3_600_000) } }, select: { walletId: true, createdAt: true, amountMinor: true } });
  const spentToday = (id: string) => -boughtToday.filter((t) => t.walletId === id && toISODate(t.createdAt, "Asia/Riyadh") === today).reduce((a, t) => a + t.amountMinor, 0);
  const wallet = candidates.find((w) => students.some((x) => x.id === w.studentId) && (!Array.isArray(w.blockedCategories) || !w.blockedCategories.length) && (w.dailyLimitMinor === null || w.dailyLimitMinor - spentToday(w.id) >= 500));
  expect(wallet, "محفظة تجريبية متاحة").toBeTruthy();
  const student = students.find((x) => x.id === wallet!.studentId)!;
  const before = wallet!.balanceMinor;

  await login(page, "canteen@demo.manassa.sa");
  await page.goto("/canteen");
  await page.getByRole("button", { name: /مياه معبأة/ }).click();
  await page.getByRole("tab", { name: "المحفظة", exact: true }).click();
  await page.getByText("ابحث عن طالب…").click();
  await page.getByPlaceholder("الاسم، الرقم الأكاديمي، أو آخر ٤ أرقام من الهوية").fill(student.fullName);
  await page.getByRole("button", { name: new RegExp(student.fullName) }).first().click();
  await expect(page.getByText(/الرصيد .* صُرف اليوم/)).toBeVisible();
  await page.getByRole("button", { name: /إتمام البيع/ }).click();
  await expect(page.getByRole("button", { name: "عملية جديدة" })).toBeVisible();

  const afterSale = await rootDb.studentWallet.findUniqueOrThrow({ where: { id: wallet!.id } });
  expect(afterSale.balanceMinor).toBeLessThan(before);
  const sale = await rootDb.sale.findFirstOrThrow({ where: { tenantId: canteen.tenantId, studentId: wallet!.studentId, paymentMethod: "WALLET" }, orderBy: { number: "desc" } });
  expect(before - afterSale.balanceMinor).toBe(sale.totalMinor);

  // الإلغاء من سجل المبيعات يعيد الرصيد والمخزون ويعكس القيد
  await page.getByRole("button", { name: "عملية جديدة" }).click();
  await page.goto("/canteen/sales");
  await page.locator("tr", { hasText: student.fullName }).first().getByRole("button", { name: "إلغاء" }).click();
  await page.getByLabel("السبب").fill("اختبار آلي — إلغاء");
  await page.getByRole("button", { name: /إلغاء العملية/ }).click();
  await expect.poll(async () => (await rootDb.sale.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe("VOIDED");
  expect((await rootDb.studentWallet.findUniqueOrThrow({ where: { id: wallet!.id } })).balanceMinor).toBe(before);
});

test("الصيانة: معلم يبلّغ عن عطل ويصل لفريق الصيانة", async ({ page }) => {
  const title = `تسرب مياه — اختبار ${Date.now()}`;
  try {
    await login(page, "teacher@demo.manassa.sa");
    await page.goto("/maintenance");
    await page.getByRole("button", { name: "بلاغ صيانة" }).first().click();
    await page.getByPlaceholder("مثال: تسرب مياه في دورة المياه").fill(title);
    await page.getByPlaceholder("الدور الثاني — الممر الشرقي").fill("الدور الأول — قرب المختبر");
    await page.getByRole("button", { name: "إرسال" }).click();
    await page.waitForURL(/\/maintenance\/[a-z0-9]+$/);
    await expect(page.getByText(title).first()).toBeVisible();
    const req = await rootDb.maintenanceRequest.findFirstOrThrow({ where: { title } });
    expect(req.status).toBe("NEW");
  } finally {
    await rootDb.maintenanceRequest.deleteMany({ where: { title } });
  }
});

test("ولي الأمر: محفظة المقصف وحافلة الأبناء ومكتبتهم والمفوضون بالاستلام", async ({ page }) => {
  const parent = await rootDb.user.findFirstOrThrow({ where: { email: "parent@demo.manassa.sa" } });
  const kids = await rootDb.student.findMany({ where: { tenantId: parent.tenantId, guardians: { some: { guardian: { userId: parent.id } } } }, select: { fullName: true } });
  const first = kids[0]!.fullName.split(" ")[0]!;
  await login(page, "parent@demo.manassa.sa");
  for (const [path, marker] of [
    ["/canteen/wallet", /الرصيد/],
    ["/transport/my", /خط|المحطة/],
    ["/library/my", /إعارة|الكتب|الحجوزات/],
    ["/safety/my-pickups", /المفوض|استلام/],
  ] as const) {
    await page.goto(path);
    await expect(page.getByText(marker).first()).toBeVisible();
    await expect(page.getByText(new RegExp(first)).first()).toBeVisible();
    await expect(page.getByText("ليست لديك صلاحية")).toHaveCount(0);
  }
});
