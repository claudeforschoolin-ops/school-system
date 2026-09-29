import { expect, test, type Page } from "@playwright/test";
import { rootDb } from "../../src/server/db/client";
import { createTenantDb } from "../../src/server/db/tenant";
import { createSession, validateSessionToken } from "../../src/server/auth/session";
import { totp } from "../../src/server/auth/totp";
import { voidReceipt } from "../../src/server/services/finance/collections.service";
import { DEMO_PASSWORD, DEMO_TOTP_SECRET } from "../../prisma/seed/data/people";

/**
 * المرحلة ٣ طرف-لطرف على البيانات التجريبية. القيود لا تُحذف (تفرضه قاعدة البيانات)،
 * فما يُنشئه الاختبار يُلغى بقيد عكسي فيعود أثره المحاسبي صفراً.
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

async function accountantSession() {
  const user = await rootDb.user.findFirstOrThrow({ where: { email: "accountant@demo.manassa.sa" } });
  const tenantId = (await rootDb.userRole.findFirstOrThrow({ where: { userId: user.id } })).tenantId;
  const { token, sessionId } = await createSession({
    tenantId,
    userId: user.id,
    twoFactorVerified: true,
    userAgent: "e2e",
  });
  const session = (await validateSessionToken(token))!;
  return { session, sessionId, db: createTenantDb({ tenantId, actor: { id: user.id, name: user.name } }) };
}

test.afterAll(async () => {
  await rootDb.$disconnect();
});

test("سند قبض سريع بلوحة المفاتيح: بحث ← Enter ← مبلغ ← Ctrl+Enter، وقيد متوازن آلياً", async ({ page }) => {
  // أسرة عليها مستحقات
  const inv = await rootDb.invoice.findFirstOrThrow({
    where: { status: "ISSUED", source: "BULK", guardianId: { not: null } },
    include: { student: true },
    orderBy: { number: "asc" },
  });
  const before = {
    paid: inv.paidMinor,
    count: await rootDb.receipt.count({ where: { tenantId: inv.tenantId } }),
  };
  let receiptId: string | null = null;
  try {
    await login(page, "accountant@demo.manassa.sa");
    await page.goto("/finance/collect");
    const search = page.getByRole("textbox", { name: "بحث عن الطالب أو ولي الأمر" });
    await search.fill(inv.student.academicNumber);
    await expect(page.getByRole("option").first()).toContainText(inv.student.fullName);
    await search.press("Enter");
    const amount = page.getByRole("textbox", { name: "المبلغ المستلم" });
    await expect(amount).toBeFocused();
    await amount.fill("250");
    await page.getByRole("radio", { name: "تحويل" }).click();
    await page.getByLabel("رقم المرجع").fill("E2E-TRX-1");
    await page.keyboard.press("Control+Enter");
    await expect(page.getByText(/سند قبض رقم/).first()).toBeVisible();

    const receipt = await rootDb.receipt.findFirstOrThrow({
      where: { tenantId: inv.tenantId, reference: "E2E-TRX-1" },
      orderBy: { createdAt: "desc" },
    });
    receiptId = receipt.id;
    expect(receipt.amountMinor).toBe(25_000);
    // القيد الآلي متوازن ويخص الذمم
    const lines = await rootDb.journalLine.findMany({
      where: { entryId: receipt.journalEntryId! },
      include: { account: true },
    });
    const dr = lines.reduce((s, l) => s + l.debitMinor, 0n);
    const cr = lines.reduce((s, l) => s + l.creditMinor, 0n);
    expect(dr).toBe(cr);
    expect(dr).toBe(25_000n);
    expect(lines.some((l) => l.account.code.startsWith("12") && l.creditMinor > 0n)).toBe(true);
    // الفاتورة الأقدم استحقاقاً للأسرة زاد مدفوعها
    const paidNow = await rootDb.invoice.aggregate({
      where: { guardianId: inv.guardianId, status: { in: ["PARTIAL", "PAID", "ISSUED"] } },
      _sum: { paidMinor: true },
    });
    expect(paidNow._sum.paidMinor).toBeGreaterThan(0);
    // يظهر في صفحة السند
    await page.getByRole("link", { name: "عرض وطباعة" }).click();
    await expect(page.getByText("استلمنا من")).toBeVisible();
  } finally {
    if (receiptId) {
      const a = await accountantSession();
      await voidReceipt(a.db, a.session, receiptId, "اختبار آلي — إلغاء");
      await rootDb.session.delete({ where: { id: a.sessionId } });
      const restored = await rootDb.invoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect(restored.paidMinor).toBe(before.paid);
    }
  }
});

test("القيد اليدوي: مؤشر التوازن الحيّ يمنع الترحيل حتى يتساوى المدين والدائن", async ({ page }) => {
  await login(page, "accountant@demo.manassa.sa");
  await page.goto("/finance/accounting/new");
  await page.getByPlaceholder(/إثبات مصروف/).fill("اختبار مؤشر التوازن");
  const accounts = page.getByRole("textbox", { name: "الحساب" });
  await accounts.nth(0).click();
  await accounts.nth(0).fill("6501");
  await accounts.nth(0).press("Enter");
  await accounts.nth(1).click();
  await accounts.nth(1).fill("1111");
  await accounts.nth(1).press("Enter");
  const indicator = page.getByTestId("balance-indicator");
  const post = page.getByRole("button", { name: "ترحيل القيد" });
  await page.getByRole("textbox", { name: "مدين" }).first().fill("1000");
  await page.getByRole("textbox", { name: "دائن" }).nth(1).fill("900");
  await expect(indicator).toHaveAttribute("data-balanced", "false");
  await expect(indicator).toContainText("غير متوازن");
  await expect(post).toBeDisabled();
  await page.getByRole("textbox", { name: "دائن" }).nth(1).fill("1000");
  await expect(indicator).toHaveAttribute("data-balanced", "true");
  await expect(indicator).toContainText("القيد متوازن");
  await expect(post).toBeEnabled();
  // لا نرحّل: القيود المرحّلة لا تُحذف
});

test("الفاتورة الضريبية: رمز QR والرقم الضريبي، وتقرير ميزان المراجعة متوازن", async ({ page }) => {
  const inv = await rootDb.invoice.findFirstOrThrow({
    where: { source: "BULK", status: { not: "CANCELLED" } },
    orderBy: { number: "asc" },
  });
  await login(page, "accountant@demo.manassa.sa");
  await page.goto(`/finance/invoices/${inv.id}`);
  await expect(page.getByText("فاتورة ضريبية مبسطة")).toBeVisible();
  await expect(page.getByRole("img", { name: "رمز الاستجابة السريعة للفاتورة الضريبية" })).toBeVisible();
  await page.goto("/finance/reports/trial-balance");
  await expect(page.getByText("متوازن: مجموع المدين = مجموع الدائن")).toBeVisible();
});

test("أمين الصندوق لا يصل إلى دفتر اليومية", async ({ page }) => {
  await login(page, "cashier@demo.manassa.sa");
  await page.goto("/finance/accounting");
  await expect(page.getByText("لا يمكن عرض القيود")).toBeVisible();
  await page.goto("/finance/collect");
  await expect(page.getByRole("textbox", { name: "بحث عن الطالب أو ولي الأمر" })).toBeVisible();
});
