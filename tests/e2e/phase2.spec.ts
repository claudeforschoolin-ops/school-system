import { expect, test, type Page } from "@playwright/test";
import { rootDb } from "../../src/server/db/client";
import { findConflicts } from "../../src/lib/timetable/generator";
import { toISODate } from "../../src/lib/dates";
import { DEMO_PASSWORD } from "../../prisma/seed/data/people";
import { createTenantDb } from "../../src/server/db/tenant";
import { createSession, validateSessionToken } from "../../src/server/auth/session";
import { cancelInvoice } from "../../src/server/services/finance/billing.service";

/**
 * المرحلة ٢ طرف-لطرف على البيانات التجريبية. كل اختبار يعيد ما غيّره إلى حالته الأصلية.
 */
async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', DEMO_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/home/);
}

async function accountantSession() {
  const user = await rootDb.user.findFirstOrThrow({ where: { email: "accountant@demo.manassa.sa" } });
  const tenantId = (await rootDb.userRole.findFirstOrThrow({ where: { userId: user.id } })).tenantId;
  const { token, sessionId } = await createSession({ tenantId, userId: user.id, twoFactorVerified: true, userAgent: "e2e" });
  const session = (await validateSessionToken(token))!;
  return { session, sessionId, db: createTenantDb({ tenantId, actor: { id: user.id, name: user.name } }) };
}

async function userId(email: string) {
  return (await rootDb.user.findFirstOrThrow({ where: { email }, select: { id: true } })).id;
}

/** آخر يوم دراسي (اليوم إن كان من الأحد للخميس) بتوقيت الرياض */
function lastSchoolDay() {
  let d = new Date(`${toISODate(new Date(), "Asia/Riyadh")}T12:00:00Z`);
  while (d.getUTCDay() > 4) d = new Date(d.getTime() - 86_400_000);
  return d.toISOString().slice(0, 10);
}

test.afterAll(async () => {
  await rootDb.$disconnect();
});

test("التحضير: تغيير حالة طالب وحفظها يظهر في السجل ثم يُعاد", async ({ page }) => {
  const vp = await userId("vp.students@demo.manassa.sa");
  const role = await rootDb.userRole.findFirstOrThrow({ where: { userId: vp, branchId: { not: null } } });
  const year = await rootDb.academicYear.findFirstOrThrow({ where: { isCurrent: true, tenantId: role.tenantId } });
  const section = await rootDb.section.findFirstOrThrow({ where: { branchId: role.branchId!, academicYearId: year.id, deletedAt: null, students: { some: { status: "ACTIVE" } } }, include: { grade: true } });
  const date = lastSchoolDay();
  const first = await rootDb.student.findFirstOrThrow({ where: { sectionId: section.id, status: "ACTIVE", deletedAt: null }, orderBy: { fullName: "asc" } });
  const before = await rootDb.attendance.findFirst({ where: { studentId: first.id, date: new Date(`${date}T00:00:00Z`), period: 0 } });
  const target = before?.status === "LATE" ? "حاضر" : "متأخر";
  const targetKey = before?.status === "LATE" ? "PRESENT" : "LATE";

  try {
    await login(page, "vp.students@demo.manassa.sa");
    await page.goto(`/attendance/${section.id}?date=${date}`);
    const row = page.locator("li", { hasText: first.fullName }).first();
    await row.getByRole("radio", { name: target }).click();
    await expect(row.getByRole("radio", { name: target })).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "حفظ التحضير" }).click();
    await expect(page.getByText(/حُفظ التحضير/).first()).toBeVisible();
    const saved = await rootDb.attendance.findFirstOrThrow({ where: { studentId: first.id, date: new Date(`${date}T00:00:00Z`), period: 0 } });
    expect(saved.status).toBe(targetKey);
    // يظهر في تبويب الحضور بملف الطالب
    await page.goto(`/students/${first.id}?tab=attendance`);
    await expect(page.getByText("نسبة الحضور (العام)")).toBeVisible();
  } finally {
    if (before) await rootDb.attendance.update({ where: { id: before.id }, data: { status: before.status, reason: before.reason, minutesLate: before.minutesLate, source: before.source, updatedById: before.updatedById } });
    else await rootDb.attendance.deleteMany({ where: { studentId: first.id, date: new Date(`${date}T00:00:00Z`), period: 0 } });
  }
});

test("القبول: قبول طلب في مرحلة المقابلة ينشئ ملف الطالب برقم أكاديمي ثم يُعاد الطلب كما كان", async ({ page }) => {
  const staff = await userId("admissions@demo.manassa.sa");
  const role = await rootDb.userRole.findFirstOrThrow({ where: { userId: staff } });
  const year = await rootDb.academicYear.findFirstOrThrow({ where: { isCurrent: true, tenantId: role.tenantId } });
  const candidates = await rootDb.admission.findMany({ where: { tenantId: role.tenantId, stage: "ASSESSMENT", studentId: null, deletedAt: null, ...(role.branchId ? { branchId: role.branchId } : {}) }, orderBy: { number: "asc" } });
  // طلب في صف فيه مقاعد متاحة
  let admission: (typeof candidates)[number] | undefined;
  for (const a of candidates) {
    const sections = await rootDb.section.findMany({ where: { branchId: a.branchId, gradeId: a.requestedGradeId!, academicYearId: year.id, deletedAt: null } });
    const occupied = await rootDb.student.count({ where: { branchId: a.branchId, gradeId: a.requestedGradeId!, academicYearId: year.id, status: "ACTIVE", deletedAt: null } });
    if (sections.reduce((s, x) => s + x.capacity, 0) > occupied) {
      admission = a;
      break;
    }
  }
  test.skip(!admission, "لا يوجد طلب في مرحلة المقابلة بمقاعد متاحة في البيانات الحالية");
  const a = admission!;
  const startedAt = new Date();
  try {
    await login(page, "admissions@demo.manassa.sa");
    await page.goto(`/admissions/${a.id}`);
    await expect(page.getByRole("heading", { name: a.fullName })).toBeVisible();
    await page.getByRole("button", { name: "قبول", exact: true }).click();
    await expect(page.getByText("حُدّثت مرحلة الطلب").first()).toBeVisible();
    const updated = await rootDb.admission.findUniqueOrThrow({ where: { id: a.id } });
    expect(updated.stage).toBe("ACCEPTED");
    expect(updated.studentId).toBeTruthy();
    const student = await rootDb.student.findUniqueOrThrow({ where: { id: updated.studentId! } });
    await expect(page.getByText(student.academicNumber).first()).toBeVisible();
  } finally {
    const updated = await rootDb.admission.findUniqueOrThrow({ where: { id: a.id } });
    await rootDb.admission.update({ where: { id: a.id }, data: { stage: a.stage, studentId: null, decisionAt: a.decisionAt, decisionReason: a.decisionReason, updatedById: a.updatedById } });
    const invoices = updated.studentId ? await rootDb.invoice.findMany({ where: { studentId: updated.studentId } }) : [];
    if (updated.studentId && invoices.length) {
      // المرحلة ٣: القبول يصدر فاتورة رسوم التسجيل؛ تُلغى بقيد عكسي، والملف يُحذف حذفاً ناعماً لأن المستندات المالية لا تُحذف
      const acc = await accountantSession();
      for (const inv of invoices.filter((i) => i.status !== "CANCELLED")) await cancelInvoice(acc.db, acc.session, inv.id, "اختبار آلي — إلغاء قبول");
      await rootDb.session.delete({ where: { id: acc.sessionId } });
      await rootDb.student.update({ where: { id: updated.studentId }, data: { deletedAt: new Date(), sectionId: null, nationalIdHash: null } });
    } else if (updated.studentId) {
      const links = await rootDb.studentGuardian.findMany({ where: { studentId: updated.studentId } });
      await rootDb.student.delete({ where: { id: updated.studentId } });
      for (const l of links) {
        const others = await rootDb.studentGuardian.count({ where: { guardianId: l.guardianId } });
        const g = await rootDb.guardian.findUnique({ where: { id: l.guardianId } });
        if (!others && g && g.createdAt >= startedAt) await rootDb.guardian.delete({ where: { id: g.id } });
      }
    }
  }
});

test("الجدول: سحب حصة إلى حصة أخرى في اليوم نفسه يبدّلهما دون تعارض ثم يُعاد", async ({ page }) => {
  const vp = await userId("vp.academic@demo.manassa.sa");
  const role = await rootDb.userRole.findFirstOrThrow({ where: { userId: vp } });
  const year = await rootDb.academicYear.findFirstOrThrow({ where: { isCurrent: true, tenantId: role.tenantId } });
  const section = await rootDb.section.findFirstOrThrow({ where: { academicYearId: year.id, deletedAt: null, ...(role.branchId ? { branchId: role.branchId } : {}) }, orderBy: { gradeId: "asc" } });
  const all = await rootDb.timetableSlot.findMany({ where: { academicYearId: year.id } });
  const mine = all.filter((s) => s.sectionId === section.id && !s.locked);
  // زوج في اليوم نفسه يصح تبديله (نفحصه بالقيود نفسها)
  let pair: [(typeof mine)[number], (typeof mine)[number]] | null = null;
  for (const a of mine) {
    for (const b of mine) {
      if (a.id === b.id || a.day !== b.day || a.subjectId === b.subjectId) continue;
      const swapped = all.map((s) => (s.id === a.id ? { ...s, period: b.period } : s.id === b.id ? { ...s, period: a.period } : s));
      if (!findConflicts(swapped, { periods: 7, maxConsecutive: 4 }).length) {
        pair = [a, b];
        break;
      }
    }
    if (pair) break;
  }
  test.skip(!pair, "لا يوجد زوج قابل للتبديل");
  const [a, b] = pair!;
  try {
    await login(page, "vp.academic@demo.manassa.sa");
    await page.goto(`/academic/timetable?view=section&id=${section.id}`);
    const source = page.locator(`[data-slot="${a.id}"]`);
    const target = page.locator(`[data-cell="${b.day}-${b.period}"]`);
    await source.waitFor();
    const from = (await source.boundingBox())!;
    const to = (await target.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(from.x + from.width / 2 + ((to.x - from.x) * i) / 12, from.y + from.height / 2 + ((to.y - from.y) * i) / 12);
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await expect(page.locator(`[data-cell="${b.day}-${b.period}"] [data-slot="${a.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-cell="${a.day}-${a.period}"] [data-slot="${b.id}"]`)).toBeVisible();
    const after = await rootDb.timetableSlot.findMany({ where: { academicYearId: year.id } });
    expect(findConflicts(after, { periods: 7, maxConsecutive: 4 })).toEqual([]);
  } finally {
    await rootDb.$transaction([
      rootDb.timetableSlot.update({ where: { id: a.id }, data: { day: -1, period: -1 } }),
      rootDb.timetableSlot.update({ where: { id: b.id }, data: { day: b.day, period: b.period } }),
      rootDb.timetableSlot.update({ where: { id: a.id }, data: { day: a.day, period: a.period } }),
    ]);
  }
});

test("الأنشطة: قاعدة البيانات بعروضها وفتح صفحة نشاط بالتسجيل والموافقات", async ({ page }) => {
  await login(page, "vp.academic@demo.manassa.sa");
  await page.goto("/activities");
  await expect(page.getByText("موافقات أولياء أمور معلّقة")).toBeVisible();
  const views = page.getByRole("tablist", { name: "عروض قاعدة البيانات" });
  await views.getByRole("tab", { name: /التقويم/ }).click();
  await expect(views.getByRole("tab", { name: /التقويم/ })).toHaveAttribute("aria-selected", "true");
  await views.getByRole("tab", { name: /حسب الحالة/ }).click();
  const card = page.locator("article").filter({ hasText: "رحلة" }).first();
  await card.click();
  await page.waitForURL(/\/activities\/.+/);
  await expect(page.getByText("موافقات أولياء الأمور").first()).toBeVisible();
  await expect(page.getByText(/المسجلون/).first()).toBeVisible();
});
