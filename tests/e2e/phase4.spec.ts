import { expect, test, type Page } from "@playwright/test";
import { rootDb } from "../../src/server/db/client";
import { totp } from "../../src/server/auth/totp";
import { DEMO_PASSWORD, DEMO_TOTP_SECRET } from "../../prisma/seed/data/people";

/**
 * المرحلة ٤ طرف-لطرف على البيانات التجريبية؛ كل ما يغيّره الاختبار يُعاد كما كان.
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

test("جدول الرصد كالإكسل: تحقق فوري من العظمى، تنقل بالأسهم، لصق من Excel، وحفظ تلقائي", async ({ page }) => {
  const teacher = await rootDb.user.findFirstOrThrow({ where: { email: "teacher@demo.manassa.sa" } });
  const sheet = await rootDb.assessment.findFirstOrThrow({ where: { teacherId: teacher.id, status: "DRAFT", componentKey: "quizzes" }, include: { marks: true } });
  const original = sheet.marks.map((m) => ({ id: m.id, scoreTenths: m.scoreTenths, absent: m.absent }));
  try {
    await login(page, "teacher@demo.manassa.sa");
    await page.goto(`/assessment/grades/${sheet.sectionId}/${sheet.subjectId}?term=${sheet.termId}`);
    const grid = page.getByRole("grid", { name: "جدول رصد الدرجات" });
    await expect(grid).toBeVisible();
    const cells = grid.locator(`input[aria-label$="— ${sheet.title}"]`);
    const first = cells.nth(0);
    await first.fill("15");
    await expect(first).toHaveAttribute("aria-invalid", "true");
    await first.fill("8.5");
    await expect(first).toHaveAttribute("aria-invalid", "false");
    await first.press("ArrowDown");
    await expect(cells.nth(1)).toBeFocused();
    // لصق عمود من Excel في الخلية الثانية
    await cells.nth(1).evaluate((el) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", "7\n9\n");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await expect(cells.nth(1)).toHaveValue("7");
    await expect(page.getByText("كل التعديلات محفوظة")).toBeVisible({ timeout: 15_000 });
    const saved = await rootDb.mark.findMany({ where: { assessmentId: sheet.id } });
    expect(saved.map((m) => m.scoreTenths).filter((v) => v === 85).length).toBeGreaterThan(0);
    expect(saved.some((m) => m.scoreTenths === 70)).toBe(true);
  } finally {
    await rootDb.mark.deleteMany({ where: { assessmentId: sheet.id, id: { notIn: original.map((o) => o.id) } } });
    for (const o of original) await rootDb.mark.update({ where: { id: o.id }, data: { scoreTenths: o.scoreTenths, absent: o.absent } });
  }
});

test("وليّ الأمر: شهادة متاحة، وأخرى محجوبة لمتأخرات، والتحقق العام برمز QR", async ({ page }) => {
  await login(page, "parent@demo.manassa.sa");
  await page.goto("/assessment/my-results");
  await expect(page.getByText("محجوبة لوجود مستحقات متأخرة")).toBeVisible();
  await page.getByRole("button", { name: "عرض الشهادة" }).first().click();
  await expect(page.getByText("تقرير متابعة أداء الطالب").first()).toBeVisible();
  const parent = await rootDb.user.findFirstOrThrow({ where: { email: "parent@demo.manassa.sa" } });
  const kids = await rootDb.student.findMany({ where: { guardians: { some: { guardian: { userId: parent.id } } } }, select: { id: true } });
  const card = await rootDb.reportCard.findFirstOrThrow({ where: { studentId: { in: kids.map((k) => k.id) } } });
  // صفحة التحقق عامة (دون جلسة)
  await page.context().clearCookies();
  await page.goto(`/verify/${card.verifyCode}`);
  await expect(page.getByText("شهادة صحيحة صادرة من المنصة")).toBeVisible();
  await expect(page.getByText("بيانات تجريبية — ليست شهادة حقيقية")).toBeVisible();
  await page.goto("/verify/ABCDEFGHJK");
  await expect(page.getByText("رمز التحقق غير صحيح")).toBeVisible();
});

test("الخدمة الذاتية: الموظف يسجل حضوره ويرى رصيد إجازاته وقسيمة راتبه", async ({ page }) => {
  const user = await rootDb.user.findFirstOrThrow({ where: { email: "teacher@demo.manassa.sa" } });
  const employee = await rootDb.employee.findFirstOrThrow({ where: { userId: user.id } });
  const before = await rootDb.employeeAttendance.findMany({ where: { employeeId: employee.id }, select: { id: true } });
  try {
    await login(page, "teacher@demo.manassa.sa");
    await page.goto("/hr/me");
    await expect(page.getByText("أرصدة إجازاتي")).toBeVisible();
    await page.getByRole("button", { name: "تسجيل الحضور" }).click();
    await expect(page.getByText("سُجّل حضورك")).toBeVisible();
    await expect(page.getByRole("button", { name: "تسجيل الحضور" })).toBeDisabled();
    const rec = await rootDb.employeeAttendance.findFirstOrThrow({ where: { employeeId: employee.id, id: { notIn: before.map((b) => b.id) } } });
    expect(rec.source).toBe("SELF");
    await page.getByRole("button", { name: /قسيمة/ }).first().click();
    await expect(page.getByText("صافي الراتب")).toBeVisible();
  } finally {
    await rootDb.employeeAttendance.deleteMany({ where: { employeeId: employee.id, id: { notIn: before.map((b) => b.id) } } });
  }
});

test("الرواتب: مسير سبتمبر معتمد بقيد آلي، وملف حماية الأجور يُنزَّل", async ({ page }) => {
  await login(page, "hr.manager@demo.manassa.sa");
  await page.goto("/hr/payroll");
  await page.getByRole("link", { name: /سبتمبر/ }).first().click();
  await expect(page.getByText("معتمد — بانتظار الصرف").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "قيد الاستحقاق" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "ملف حماية الأجور" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^WPS-\d{4}-\d{2}\.csv$/);
});
