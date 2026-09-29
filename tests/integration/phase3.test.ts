import { describe, expect, it } from "vitest";
import { rootDb } from "@/server/db/client";
import { callerFor, makeTenant, makeUser, uid } from "./helpers";
import { fakeNationalId, makeSchool } from "./school-fixture";

const today = () => new Date().toISOString().slice(0, 10);

/** مدرسة بجدول رسوم: دراسية ١٨٬٠٠٠ وتسجيل ١٬٠٠٠ وكتب ٨٠٠ */
async function financeSchool() {
  const s = await makeSchool();
  const accountant = await makeUser(s.t, "ACCOUNTANT", { name: "المحاسب" });
  const acc = await callerFor(s.tenantId, accountant.id);
  const setup = await acc.caller.finance.setup.get();
  const item = (code: string) => setup.items.find((i) => i.code === code)!;
  await acc.caller.finance.setup.saveSchedule({
    academicYearId: s.year.id,
    name: "رسوم عامة",
    branchId: null,
    stageId: null,
    gradeId: null,
    isActive: true,
    lines: [
      { feeItemId: item("TUITION").id, amountMinor: 1_800_000, optional: false },
      { feeItemId: item("REGISTRATION").id, amountMinor: 100_000, optional: true },
      { feeItemId: item("BOOKS").id, amountMinor: 80_000, optional: false },
    ],
  });
  return { ...s, accountant, acc: acc.caller, item, setup };
}

describe("المرحلة ٣ — النظام المحاسبي", () => {
  it("معيار القبول: قبول طالب ← فاتورة تسجيل ← دفعة ← قيود آلية متوازنة ← أثرها في ميزان المراجعة وقائمة الدخل", async () => {
    const s = await financeSchool();
    const staff = await makeUser(s.t, "ADMISSIONS", { branchId: s.branch.id });
    const adm = await callerFor(s.tenantId, staff.id);
    const admission = await adm.caller.admissions.create({
      branchId: s.branch.id,
      requestedGradeId: s.g1.id,
      firstName: "سلمان",
      fatherName: "خالد",
      grandfatherName: "سعد",
      familyName: "الدوسري",
      gender: "MALE",
      nationality: "SA",
      idType: "NATIONAL_ID",
      nationalId: fakeNationalId(Number(uid().replace(/\D/g, "").slice(0, 6) || "7")),
      birthDate: new Date("2019-03-01"),
      guardianName: "خالد سعد الدوسري",
      guardianRelation: "FATHER",
      guardianPhone: "0551112233",
    });
    await adm.caller.admissions.setStage({ id: admission.id, stage: "ACCEPTED" });
    const accepted = await rootDb.admission.findUniqueOrThrow({ where: { id: admission.id } });

    // فاتورة التسجيل صدرت آلياً برقم ١ وقيدها متوازن
    const invoice = await rootDb.invoice.findFirstOrThrow({ where: { tenantId: s.tenantId, studentId: accepted.studentId!, source: "ADMISSION" } });
    expect(invoice.number).toBe(1);
    expect(invoice.status).toBe("ISSUED");
    expect(invoice.totalMinor).toBe(100_000); // مواطن: الضريبة تتحملها الدولة (٠٪)
    const issueEntry = await rootDb.journalEntry.findUniqueOrThrow({ where: { id: invoice.journalEntryId! }, include: { lines: true } });
    const sum = (k: "debitMinor" | "creditMinor") => issueEntry.lines.reduce((a, l) => a + Number(l[k]), 0);
    expect(sum("debitMinor")).toBe(sum("creditMinor"));

    // التحصيل
    const receipt = await s.acc.finance.receipts.create({ guardianId: invoice.guardianId!, amountMinor: 100_000, method: "CASH", date: today() });
    expect(receipt.number).toBe(1);
    const paid = await rootDb.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(paid.status).toBe("PAID");
    expect(paid.paidMinor).toBe(100_000);

    // ميزان المراجعة متوازن، وقائمة الدخل تظهر إيراد التسجيل، والميزانية متوازنة
    const tb = await s.acc.finance.reports.trialBalance({ from: today().slice(0, 8) + "01", to: today() });
    expect(tb.balanced).toBe(true);
    expect(tb.totals.debit).toBe(200_000);
    const is = await s.acc.finance.reports.incomeStatement({ from: today().slice(0, 8) + "01", to: today() });
    expect(is.sections[0]!.rows.find((r) => r.code === "4201")?.amount).toBe(100_000);
    expect(is.net).toBe(100_000);
    const bs = await s.acc.finance.reports.balanceSheet({ asOf: today() });
    expect(bs.balanced).toBe(true);
    expect(bs.assets.find((a) => a.code === "1101")?.amount).toBe(100_000);
    // النزول من القيد إلى المستند المصدر
    const entry = await s.acc.finance.accounting.entry({ id: receipt.journalEntryId! });
    expect(entry.sourceLink).toBe(`/finance/receipts/${receipt.id}`);
  });

  it("قاعدة البيانات ترفض القيد غير المتوازن وتعديل القيد المرحّل وحذفه والترحيل في فترة مقفلة", async () => {
    const s = await financeSchool();
    const [cash, rev] = await Promise.all([rootDb.account.findFirstOrThrow({ where: { tenantId: s.tenantId, systemKey: "CASH" } }), rootDb.account.findFirstOrThrow({ where: { tenantId: s.tenantId, code: "4801" } })]);
    const period = await rootDb.fiscalPeriod.findFirstOrThrow({ where: { tenantId: s.tenantId, startDate: { lte: new Date(today()) }, endDate: { gte: new Date(today()) } } });
    const base = { tenantId: s.tenantId, date: new Date(today()), periodId: period.id, description: "اختبار", source: "MANUAL" as const };
    // غير متوازن (حتى بالعميل الجذري المتجاوز للتطبيق)
    await expect(
      rootDb.journalEntry.create({ data: { ...base, number: 9001, totalMinor: 500n, lines: { create: [{ tenantId: s.tenantId, accountId: cash.id, debitMinor: 500n }, { tenantId: s.tenantId, accountId: rev.id, creditMinor: 400n }] } } }),
    ).rejects.toThrow();
    // سطر بمدين ودائن معاً
    await expect(
      rootDb.journalEntry.create({ data: { ...base, number: 9002, totalMinor: 500n, lines: { create: [{ tenantId: s.tenantId, accountId: cash.id, debitMinor: 500n, creditMinor: 500n }, { tenantId: s.tenantId, accountId: rev.id, creditMinor: 0n }] } } }),
    ).rejects.toThrow();
    // قيد صحيح عبر الواجهة ثم محاولة تعديله وحذفه
    const ok = await s.acc.finance.accounting.createEntry({ date: today(), description: "تأجير الصالة لجهة خارجية", lines: [{ accountId: cash.id, debit: 50_000, credit: 0 }, { accountId: rev.id, debit: 0, credit: 50_000 }] });
    const line = await rootDb.journalLine.findFirstOrThrow({ where: { entryId: ok.id } });
    await expect(rootDb.journalLine.update({ where: { id: line.id }, data: { debitMinor: 1n } })).rejects.toThrow();
    await expect(rootDb.journalLine.delete({ where: { id: line.id } })).rejects.toThrow();
    await expect(rootDb.journalEntry.delete({ where: { id: ok.id } })).rejects.toThrow();
    // الخدمة ترفض عدم التوازن برسالة واضحة
    await expect(s.acc.finance.accounting.createEntry({ date: today(), description: "غير متوازن", lines: [{ accountId: cash.id, debit: 10, credit: 0 }, { accountId: rev.id, debit: 0, credit: 9 }] })).rejects.toMatchObject({ message: expect.stringContaining("غير متوازن") });
    // الفترة المقفلة
    await rootDb.fiscalPeriod.update({ where: { id: period.id }, data: { status: "CLOSED" } });
    await expect(s.acc.finance.accounting.createEntry({ date: today(), description: "بعد الإقفال", lines: [{ accountId: cash.id, debit: 10, credit: 0 }, { accountId: rev.id, debit: 0, credit: 10 }] })).rejects.toMatchObject({ message: expect.stringContaining("مقفلة") });
    await expect(rootDb.journalEntry.create({ data: { ...base, number: 9003, totalMinor: 10n, lines: { create: [{ tenantId: s.tenantId, accountId: cash.id, debitMinor: 10n }, { tenantId: s.tenantId, accountId: rev.id, creditMinor: 10n }] } } })).rejects.toThrow(/مقفلة/);
    // المحاسب لا يملك الترحيل الاستثنائي؛ المدير يملكه ويُعلَّم القيد
    await expect(s.acc.finance.accounting.createEntry({ date: today(), description: "استثناء", allowClosedPeriod: true, closedReason: "تصحيح", lines: [{ accountId: cash.id, debit: 10, credit: 0 }, { accountId: rev.id, debit: 0, credit: 10 }] })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const principal = await makeUser(s.t, "PRINCIPAL");
    const p = await callerFor(s.tenantId, principal.id);
    const override = await p.caller.finance.accounting.createEntry({ date: today(), description: "تصحيح معتمد", allowClosedPeriod: true, closedReason: "تصحيح خطأ مطابقة", lines: [{ accountId: cash.id, debit: 10, credit: 0 }, { accountId: rev.id, debit: 0, credit: 10 }] });
    expect(override.postedInClosedPeriod).toBe(true);
  });

  it("الفوترة الجماعية: خصم الأشقاء تلقائياً، الضريبة لغير المواطن، أرقام متتالية بلا فجوات، وتخطي المفوتر", async () => {
    const s = await financeSchool();
    const a = await s.student(s.g1.id, s.s1a.id, "الأكبر");
    const b = await s.student(s.g1.id, s.s1a.id, "الأصغر");
    const c = await s.student(s.g1.id, s.s1b.id, "مقيم");
    await rootDb.student.update({ where: { id: a.id }, data: { birthDate: new Date("2016-01-01") } });
    await rootDb.student.update({ where: { id: b.id }, data: { birthDate: new Date("2018-01-01") } });
    await rootDb.student.update({ where: { id: c.id }, data: { nationality: "EG" } });
    // الأصغر يُربط بولي أمر الأكبر كولي أساسي
    const ga = await rootDb.studentGuardian.findFirstOrThrow({ where: { studentId: a.id } });
    await rootDb.studentGuardian.updateMany({ where: { studentId: b.id }, data: { isPrimary: false } });
    await rootDb.studentGuardian.create({ data: { tenantId: s.tenantId, studentId: b.id, guardianId: ga.guardianId, relation: "FATHER", isPrimary: true } });

    const input = { academicYearId: s.year.id, gradeIds: [s.g1.id], feeItemIds: [s.item("TUITION").id, s.item("BOOKS").id], planId: null, issueDate: today(), applyDiscounts: true };
    const preview = await s.acc.finance.invoices.bulkPreview(input);
    expect(preview.count).toBe(3);
    const row = (id: string) => preview.rows.find((r) => r.studentId === id)!;
    expect(row(a.id).discount).toBe(0);
    expect(row(b.id).discount).toBe(90_000); // ٥٪ من ١٨٬٠٠٠
    expect(row(c.id).tax).toBe(Math.round((1_880_000 * 1500) / 10000)); // ١٥٪ على الدراسية والكتب
    const issued = await s.acc.finance.invoices.bulkIssue({ ...input, description: "رسوم الفصل الأول", notify: false });
    expect(issued.count).toBe(3);
    const numbers = (await rootDb.invoice.findMany({ where: { tenantId: s.tenantId }, select: { number: true }, orderBy: { number: "asc" } })).map((i) => i.number);
    expect(numbers).toEqual([1, 2, 3]);
    // إعادة التشغيل لا تكرر الفوترة
    const again = await s.acc.finance.invoices.bulkPreview(input);
    expect(again.count).toBe(0);
    // الإيراد الدراسي مؤجل، والخصم في حسابه المقابل
    const tb = await s.acc.finance.reports.trialBalance({ from: today(), to: today() });
    const code = (c2: string) => tb.rows.find((r) => r.code === c2);
    expect(code("2201")!.credit).toBe(3 * 1_800_000);
    expect(code("4901")!.debit).toBe(90_000);
    // الكتب خاضعة ١٥٪ للجميع، والدراسية للمقيم فقط
    expect(code("2401")!.credit).toBe(row(a.id).tax + row(b.id).tax + row(c.id).tax);
    expect(row(a.id).tax).toBe(12_000);
    expect(tb.balanced).toBe(true);
  });

  it("الاعتراف الشهري بالإيراد المؤجل ينقل حصة الشهر من المؤجل إلى الإيراد", async () => {
    const s = await financeSchool();
    const st = await s.student(s.g1.id, s.s1a.id);
    await s.acc.finance.invoices.create({ studentId: st.id, feeItemIds: [s.item("TUITION").id], issueDate: today(), notify: false });
    const period = await rootDb.fiscalPeriod.findFirstOrThrow({ where: { tenantId: s.tenantId, startDate: { lte: new Date(today()) }, endDate: { gte: new Date(today()) } } });
    const r = await s.acc.finance.accounting.recognize({ periodId: period.id });
    expect(r.posted).toBe(true);
    expect(r.total).toBeGreaterThan(0);
    expect(r.total).toBeLessThan(1_800_000);
    // التشغيل الثاني لا يكرر
    const again = await s.acc.finance.accounting.recognize({ periodId: period.id });
    expect(again.posted).toBe(false);
    const def = await s.acc.finance.reports.deferred({});
    expect(def.totals.recognized).toBe(r.total);
    expect(def.totals.deferred).toBe(1_800_000 - r.total);
    expect(def.ledgerBalance).toBe(def.totals.deferred);
  });

  it("الدفعة الزائدة رصيد دائن، والشيك المرتد يعيد الدين، والإشعار الدائن والاسترداد بموافقة المدير", async () => {
    const s = await financeSchool();
    const st = await s.student(s.g1.id, s.s1a.id);
    const inv = await s.acc.finance.invoices.create({ studentId: st.id, feeItemIds: [s.item("BOOKS").id], issueDate: today(), notify: false });
    const guardianId = inv.guardianId!;
    // دفعة زائدة
    await s.acc.finance.receipts.create({ guardianId, amountMinor: 100_000, method: "BANK_TRANSFER", reference: "TRX-1", date: today() });
    let fam = await s.acc.finance.receipts.family({ guardianId });
    expect(inv.totalMinor).toBe(92_000); // الكتب ٨٠٠ + ١٥٪ حتى للمواطن
    expect(fam.creditBalance).toBe(8_000);
    expect(fam.totals.due).toBe(0);
    // فاتورة ثانية تُسدَّد بشيك يرتد
    const inv2 = await s.acc.finance.invoices.create({ studentId: st.id, lines: [{ feeItemId: s.item("TUITION").id, description: "رسوم دراسية", unitMinor: 50_000 }], issueDate: today(), notify: false, applyDiscounts: false });
    const cheque = await s.acc.finance.receipts.create({ guardianId, amountMinor: 50_000, method: "CHEQUE", chequeNumber: "000123", chequeBank: "البنك الأهلي", chequeDate: today(), date: today(), allocations: [{ invoiceId: inv2.id, amountMinor: 50_000 }] });
    expect((await rootDb.invoice.findUniqueOrThrow({ where: { id: inv2.id } })).status).toBe("PAID");
    await s.acc.finance.receipts.cheque({ receiptId: cheque.id, action: "BOUNCE", date: today(), note: "رصيد غير كافٍ" });
    expect((await rootDb.invoice.findUniqueOrThrow({ where: { id: inv2.id } })).status).toBe("ISSUED");
    // استخدام الرصيد الدائن
    await s.acc.finance.receipts.applyCredit({ guardianId });
    fam = await s.acc.finance.receipts.family({ guardianId });
    expect(fam.creditBalance).toBe(0);
    expect(fam.totals.due).toBe(42_000);
    // إشعار دائن بالمتبقي
    await s.acc.finance.invoices.creditNote({ invoiceId: inv2.id, totalMinor: 42_000, reason: "إعفاء جزئي بقرار الإدارة", kind: "ADJUSTMENT" });
    expect((await rootDb.invoice.findUniqueOrThrow({ where: { id: inv2.id } })).status).toBe("PAID");
    // استرداد: يلزم رصيد دائن ثم موافقة المدير
    await s.acc.finance.receipts.create({ guardianId, amountMinor: 5_000, method: "CASH", date: today() });
    const refund = await s.acc.finance.receipts.requestRefund({ guardianId, amountMinor: 5_000, method: "CASH", reason: "استرداد الرصيد الزائد" });
    await expect(s.acc.finance.receipts.payRefund({ id: refund.id, date: today() })).rejects.toMatchObject({ message: expect.stringContaining("لم يُعتمد") });
    const principal = await makeUser(s.t, "PRINCIPAL");
    const p = await callerFor(s.tenantId, principal.id);
    await p.caller.approval.decide({ requestId: refund.approvalRequestId!, decision: "APPROVED" });
    await s.acc.finance.receipts.payRefund({ id: refund.id, date: today() });
    fam = await s.acc.finance.receipts.family({ guardianId });
    expect(fam.creditBalance).toBe(0);
    const tb = await s.acc.finance.reports.trialBalance({ from: today(), to: today() });
    expect(tb.balanced).toBe(true);
    expect(tb.rows.find((r) => r.code === "1220")?.closingDebit ?? 0).toBe(0);
  });

  it("الصلاحيات: أمين الصندوق يحتاج وردية للنقد ولا يصل للقيود، والمدقق يقرأ ولا يعدّل، وعزل المدارس", async () => {
    const s = await financeSchool();
    const st = await s.student(s.g1.id, s.s1a.id);
    const inv = await s.acc.finance.invoices.create({ studentId: st.id, feeItemIds: [s.item("BOOKS").id], issueDate: today(), notify: false });
    const cashier = await makeUser(s.t, "CASHIER");
    const c = await callerFor(s.tenantId, cashier.id);
    await expect(c.caller.finance.receipts.create({ guardianId: inv.guardianId!, amountMinor: 1000, method: "CASH", date: today() })).rejects.toMatchObject({ message: expect.stringContaining("وردية") });
    await c.caller.finance.receipts.openSession({ openingFloatMinor: 50_000 });
    await c.caller.finance.receipts.create({ guardianId: inv.guardianId!, amountMinor: 80_000, method: "CASH", date: today() });
    await expect(c.caller.finance.accounting.createEntry({ date: today(), description: "محاولة", lines: [] as never })).rejects.toBeTruthy();
    await expect(c.caller.finance.accounting.entries({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    // عجز ١٠ ريالات عند الإغلاق يُقيَّد
    const closed = await c.caller.finance.receipts.closeSession({ countedMinor: 129_000 });
    expect(closed.differenceMinor).toBe(-1_000);
    expect(closed.differenceEntryId).toBeTruthy();

    const auditor = await makeUser(s.t, "AUDITOR");
    const a = await callerFor(s.tenantId, auditor.id);
    await expect(a.caller.finance.reports.trialBalance({ from: today(), to: today() })).resolves.toHaveProperty("balanced", true);
    await expect(a.caller.finance.invoices.cancel({ id: inv.id, reason: "محاولة" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const other = await makeTenant();
    const owner = await makeUser(other, "OWNER");
    const o = await callerFor(other.tenant.id, owner.id);
    await expect(o.caller.finance.invoices.get({ id: inv.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const otherTb = await o.caller.finance.reports.trialBalance({ from: today(), to: today() });
    expect(otherTb.rows).toHaveLength(0);
  });

  it("الانسحاب: المديونية تمنع شهادة النقل، والتسوية التناسبية تُصدر إشعاراً دائناً بالأشهر غير المستهلكة", async () => {
    const s = await financeSchool();
    const st = await s.student(s.g1.id, s.s1a.id);
    const inv = await s.acc.finance.invoices.create({ studentId: st.id, feeItemIds: [s.item("TUITION").id], issueDate: today(), notify: false });
    const settlement = await s.acc.finance.invoices.settlement({ studentId: st.id, effectiveDate: today() });
    expect(settlement.outstanding).toBe(inv.totalMinor);
    expect(settlement.proposals.length).toBe(1);
    expect(settlement.totalCredit).toBeGreaterThan(0);
    expect(settlement.totalCredit).toBeLessThan(inv.totalMinor);
    await s.acc.finance.invoices.applySettlement({ studentId: st.id, effectiveDate: today() });
    const after = await rootDb.invoice.findUniqueOrThrow({ where: { id: inv.id } });
    expect(after.creditedMinor).toBe(settlement.totalCredit);
    await expect(s.acc.finance.invoices.applySettlement({ studentId: st.id, effectiveDate: today() })).rejects.toMatchObject({ message: expect.stringContaining("مسبقاً") });
    const tb = await s.acc.finance.reports.trialBalance({ from: today(), to: today() });
    expect(tb.balanced).toBe(true);
  });
});
