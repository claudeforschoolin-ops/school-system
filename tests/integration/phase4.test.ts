import { describe, expect, it } from "vitest";
import { rootDb } from "@/server/db/client";
import { validateSessionToken, createSession } from "@/server/auth/session";
import { verifyReportCard } from "@/server/services/assessment/results.service";
import { callerFor, makeTenant, makeUser, uid } from "./helpers";
import { fakeNationalId, makeSchool } from "./school-fixture";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (iso: string) => {
  let d = iso;
  while ([5, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDays(d, 1);
  return d;
};
/** آيبان سعودي صالح (MOD-97) للاختبار */
function iban(seed: number) {
  const bban = `80${String(seed).padStart(18, "0")}`;
  const digits = (bban + "SA00").replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, "0")}${bban}`;
}

/** مدرسة بمادة مسندة لمعلم في فصل (ثلاثة طلاب)، ووكيل أكاديمي ومدير */
async function gradedSchool() {
  const s = await makeSchool();
  const subject = await rootDb.subject.create({ data: { tenantId: s.tenantId, code: `M${uid()}`, name: "الرياضيات" } });
  await rootDb.gradeSubject.create({ data: { tenantId: s.tenantId, gradeId: s.g2.id, subjectId: subject.id, weeklyPeriods: 5 } });
  const teacherU = await makeUser(s.t, "TEACHER", { branchId: s.branch.id, name: "المعلم" });
  await rootDb.teacherAssignment.create({ data: { tenantId: s.tenantId, academicYearId: s.year.id, sectionId: s.s2a.id, subjectId: subject.id, teacherId: teacherU.id, weeklyPeriods: 5 } });
  const vpU = await makeUser(s.t, "VP_ACADEMIC", { branchId: s.branch.id, name: "الوكيل" });
  const principalU = await makeUser(s.t, "PRINCIPAL", { name: "المدير" });
  const students = [await s.student(s.g2.id, s.s2a.id, "أحمد"), await s.student(s.g2.id, s.s2a.id, "خالد"), await s.student(s.g2.id, s.s2a.id, "سعد")];
  const term = await rootDb.term.findFirstOrThrow({ where: { tenantId: s.tenantId } });
  const as = async (userId: string) => (await callerFor(s.tenantId, userId)).caller;
  return { ...s, subject, teacherU, vpU, principalU, students, term, as };
}

describe("المرحلة ٤ — التقييم", () => {
  it("مسار الاعتماد: المعلم ← رئيس القسم ← الوكيل، والقفل تفرضه قاعدة البيانات، والتعديل بطلب معتمد يُسجَّل", async () => {
    const s = await gradedSchool();
    const headU = await makeUser(s.t, "TEACHER", { branchId: s.branch.id, name: "رئيس القسم" });
    const principal = await s.as(s.principalU.id);
    await principal.moduleSettings.update({ key: "assessment", patch: { subjectHeads: { [s.subject.id]: headU.id } } });
    const teacher = await s.as(s.teacherU.id);
    const key = { sectionId: s.s2a.id, subjectId: s.subject.id, termId: s.term.id };

    const a = await teacher.assessment.grades.createAssessment({ ...key, componentKey: "classwork", title: "المشاركة", maxTenths: 100 });
    // تحقق فوري من الحد الأعلى
    await expect(teacher.assessment.grades.saveMarks({ assessmentId: a.id, marks: [{ studentId: s.students[0]!.id, scoreTenths: 110, absent: false, excused: false }] })).rejects.toThrow(/بين/);
    await teacher.assessment.grades.saveMarks({ assessmentId: a.id, marks: s.students.slice(0, 2).map((st) => ({ studentId: st.id, scoreTenths: 85, absent: false, excused: false })) });
    // لا إرسال قبل اكتمال الرصد
    await expect(teacher.assessment.grades.transition({ ids: [a.id], action: "SUBMIT" })).rejects.toThrow(/بلا درجة/);
    await teacher.assessment.grades.saveMarks({ assessmentId: a.id, marks: [{ studentId: s.students[2]!.id, scoreTenths: null, absent: true, excused: false }] });
    await teacher.assessment.grades.transition({ ids: [a.id], action: "SUBMIT" });
    await expect(teacher.assessment.grades.transition({ ids: [a.id], action: "APPROVE" })).rejects.toThrow();
    const vp = await s.as(s.vpU.id);
    await expect(vp.assessment.grades.transition({ ids: [a.id], action: "APPROVE" })).rejects.toThrow(/رئيس القسم/);
    const head = await s.as(headU.id);
    expect((await head.assessment.grades.pending()).map((p) => p.id)).toContain(a.id);
    await head.assessment.grades.transition({ ids: [a.id], action: "REVIEW" });
    await vp.assessment.grades.transition({ ids: [a.id], action: "APPROVE" });
    expect((await rootDb.assessment.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("APPROVED");

    // القفل: حتى العميل الجذري لا يعدّل درجة معتمدة
    const mark = await rootDb.mark.findFirstOrThrow({ where: { assessmentId: a.id, studentId: s.students[0]!.id } });
    await expect(rootDb.mark.update({ where: { id: mark.id }, data: { scoreTenths: 100 } })).rejects.toThrow(/مقفلة/);
    await expect(teacher.assessment.grades.saveMarks({ assessmentId: a.id, marks: [{ studentId: s.students[0]!.id, scoreTenths: 90, absent: false, excused: false }] })).rejects.toThrow(/طلب تعديل/);

    // طلب تعديل ← موافقة المدير ← تطبيق مع سجل تدقيق بالقيمتين
    const req = await teacher.assessment.grades.requestChange({ assessmentId: a.id, studentId: s.students[0]!.id, newTenths: 95, newAbsent: false, reason: "خطأ في جمع الدرجات بعد التظلم" });
    await expect(teacher.assessment.grades.requestChange({ assessmentId: a.id, studentId: s.students[0]!.id, newTenths: 96, newAbsent: false, reason: "طلب مكرر للاختبار" })).rejects.toThrow(/معلق/);
    await principal.approval.decide({ requestId: req.approvalRequestId!, decision: "APPROVED" });
    expect((await rootDb.mark.findUniqueOrThrow({ where: { id: mark.id } })).scoreTenths).toBe(95);
    expect((await rootDb.gradeChangeRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPLIED");
    const audit = await rootDb.auditLog.findFirst({ where: { tenantId: s.tenantId, action: "OVERRIDE", entityType: "Mark" } });
    expect(audit?.oldValue).toMatchObject({ scoreTenths: 85 });
    expect(audit?.newValue).toMatchObject({ scoreTenths: 95 });
  });

  it("المعدلات والترتيب والنتيجة، والشهادات برمز تحقق، والنشر في موعده مع حجب من عليه متأخرات", async () => {
    const s = await gradedSchool();
    const principal = await s.as(s.principalU.id);
    const schemes = await principal.assessment.results.schemes();
    const base = schemes.schemes[0]!;
    await principal.assessment.results.saveScheme({ id: base.id, stageId: null, name: base.name, components: [{ key: "classwork", name: "أعمال السنة", weight: 40 }, { key: "final", name: "النهائي", weight: 60 }], bands: base.bands, passBp: 5000, maxSecondRoundSubjects: 1, display: "PERCENT" });
    // مادة ثانية ليكون الرسوب في مادة واحدة «دور ثانٍ»
    const sci = await rootDb.subject.create({ data: { tenantId: s.tenantId, code: `S${uid()}`, name: "العلوم" } });
    await rootDb.gradeSubject.create({ data: { tenantId: s.tenantId, gradeId: s.g2.id, subjectId: sci.id } });
    await rootDb.teacherAssignment.create({ data: { tenantId: s.tenantId, academicYearId: s.year.id, sectionId: s.s2a.id, subjectId: sci.id, teacherId: s.teacherU.id, weeklyPeriods: 4 } });
    const teacher = await s.as(s.teacherU.id);
    const [A, B, C] = s.students;
    const scores: Record<string, Record<string, [number, number]>> = {
      [s.subject.id]: { [A!.id]: [100, 360], [B!.id]: [50, 200], [C!.id]: [20, 100] },
      [sci.id]: { [A!.id]: [90, 400], [B!.id]: [60, 240], [C!.id]: [80, 320] },
    };
    const ids: string[] = [];
    for (const subjectId of [s.subject.id, sci.id]) {
      const key = { sectionId: s.s2a.id, subjectId, termId: s.term.id };
      const cw = await teacher.assessment.grades.createAssessment({ ...key, componentKey: "classwork", title: "أعمال", maxTenths: 100 });
      const fn = await teacher.assessment.grades.createAssessment({ ...key, componentKey: "final", title: "النهائي", maxTenths: 400 });
      await teacher.assessment.grades.saveMarks({ assessmentId: cw.id, marks: s.students.map((st) => ({ studentId: st.id, scoreTenths: scores[subjectId]![st.id]![0], absent: false, excused: false })) });
      await teacher.assessment.grades.saveMarks({ assessmentId: fn.id, marks: s.students.map((st) => ({ studentId: st.id, scoreTenths: scores[subjectId]![st.id]![1], absent: false, excused: false })) });
      ids.push(cw.id, fn.id);
    }
    const vp = await s.as(s.vpU.id);
    await expect(vp.assessment.cards.issue({ termId: s.term.id, sectionIds: [s.s2a.id] })).rejects.toThrow(/لم يُعتمد/);
    await teacher.assessment.grades.transition({ ids, action: "SUBMIT" });
    await vp.assessment.grades.transition({ ids, action: "APPROVE" });

    const res = await vp.assessment.results.section({ sectionId: s.s2a.id, termId: s.term.id, approvedOnly: true });
    const row = (id: string) => res.rows.find((r) => r.student.id === id)!;
    // الرياضيات: A = 40%×100 + 60%×90 = 94٪؛ C = 40%×20 + 60%×25 = 23٪ (راسب في مادة واحدة)
    expect(row(A!.id).subjects[s.subject.id]!.bp).toBe(9400);
    expect(row(C!.id).subjects[s.subject.id]!.bp).toBe(2300);
    expect(row(A!.id).term.result).toBe("PASS");
    expect(row(B!.id).term.result).toBe("PASS");
    expect(row(C!.id).term.result).toBe("SECOND_ROUND");
    expect(row(A!.id).rank.section).toBe(1);
    expect(res.summary.secondRound).toBe(1);
    const year = await vp.assessment.results.section({ sectionId: s.s2a.id, termId: "YEAR" });
    expect(year.rows.find((r) => r.student.id === A!.id)!.term.averageBp).toBe(row(A!.id).term.averageBp);

    const issued = await vp.assessment.cards.issue({ termId: s.term.id, sectionIds: [s.s2a.id] });
    expect(issued.issued).toBe(3);
    const cardA = await rootDb.reportCard.findFirstOrThrow({ where: { studentId: A!.id } });
    expect(cardA.verifyCode).toMatch(/^[A-Z0-9]{10}$/);
    expect((await verifyReportCard(cardA.verifyCode))?.student).toContain("أحمد");
    expect(await verifyReportCard("XXXXXXXXXX")).toBeNull();

    // وليّا أمر: A بلا متأخرات، وC عليه فاتورة متأخرة
    const link = async (studentId: string) => {
      const u = await makeUser(s.t, "PARENT");
      const g = await rootDb.studentGuardian.findFirstOrThrow({ where: { studentId } });
      await rootDb.guardian.update({ where: { id: g.guardianId }, data: { userId: u.id } });
      return s.as(u.id);
    };
    const parentA = await link(A!.id);
    const parentC = await link(C!.id);
    const accountant = await makeUser(s.t, "ACCOUNTANT");
    const acc = await s.as(accountant.id);
    const setup = await acc.finance.setup.get();
    const books = setup.items.find((i) => i.code === "BOOKS")!;
    const past = addDays(today(), -5);
    await acc.finance.invoices.create({ studentId: C!.id, lines: [{ feeItemId: books.id, description: "كتب", unitMinor: 50_000 }], issueDate: past, dueDate: past, notify: false, applyDiscounts: false });
    // قسط مستقبلي لا يحجب (A)
    await acc.finance.invoices.create({ studentId: A!.id, lines: [{ feeItemId: books.id, description: "كتب", unitMinor: 50_000 }], issueDate: today(), dueDate: addDays(today(), 20), notify: false, applyDiscounts: false });

    expect((await parentA.assessment.cards.family()).students[0]!.cards[0]!.status).toBe("NOT_YET");
    await principal.assessment.cards.setPublication({ termId: s.term.id, publishAt: new Date(Date.now() - 60_000), withholdOnDebt: true });
    const famA = (await parentA.assessment.cards.family()).students[0]!.cards[0]!;
    expect(famA.status).toBe("VISIBLE");
    expect(famA.snapshot?.averageBp).toBe(cardA.averageBp);
    const famC = (await parentC.assessment.cards.family()).students[0]!.cards[0]!;
    expect(famC.status).toBe("WITHHELD");
    expect(famC.snapshot).toBeNull();
    // لا يطبع ولي الأمر شهادة محجوبة ولا شهادة غير أبنائه
    expect((await parentC.assessment.cards.print({ termId: s.term.id })).cards).toHaveLength(0);
    expect((await parentA.assessment.cards.print({ termId: s.term.id, cardIds: [cardA.id, (await rootDb.reportCard.findFirstOrThrow({ where: { studentId: C!.id } })).id] })).cards.map((c) => c.id)).toEqual([cardA.id]);
  });

  it("الاختبارات: جدولة تلقائية، لجان بتوزيع متداخل ومراقبين، ومحضر الغياب يُعبّأ في كشف الرصد", async () => {
    const s = await gradedSchool();
    const sci = await rootDb.subject.create({ data: { tenantId: s.tenantId, code: `S${uid()}`, name: "العلوم" } });
    await rootDb.gradeSubject.create({ data: { tenantId: s.tenantId, gradeId: s.g1.id, subjectId: sci.id } });
    for (let i = 0; i < 3; i++) await s.student(s.g1.id, s.s1a.id, "فهد");
    await rootDb.room.create({ data: { tenantId: s.tenantId, branchId: s.branch.id, code: "R1", name: "قاعة ١", capacity: 30 } });
    const vp = await s.as(s.vpU.id);
    const start = weekday(addDays(today(), 3));
    const exam = await vp.assessment.exams.create({ termId: s.term.id, title: "اختبارات منتصف الفصل", kind: "MIDTERM", gradeIds: [s.g1.id, s.g2.id], branchId: s.branch.id, startDate: start, endDate: addDays(start, 7) });
    expect(exam.componentKey).toBe("midterm");
    const sched = await vp.assessment.exams.autoSchedule({ examId: exam.id, startTime: "08:00", durationMin: 90 });
    expect(sched.sessions).toBe(2);
    const com = await vp.assessment.exams.autoCommittees({ examId: exam.id, capacity: 30, invigilatorsPerCommittee: 1, interleaveGrades: true });
    expect(com.seats).toBe(6);
    const committee = await rootDb.examCommittee.findFirstOrThrow({ where: { examId: exam.id }, include: { seats: { orderBy: { seatNumber: "asc" } } } });
    expect(committee.invigilatorIds).toContain(s.teacherU.id);
    const gradeOf = new Map((await rootDb.student.findMany({ where: { tenantId: s.tenantId } })).map((x) => [x.id, x.gradeId]));
    const seq = committee.seats.map((x) => gradeOf.get(x.studentId));
    expect(seq[0]).not.toBe(seq[1]);
    expect(committee.seats[0]!.seatNumber).toBe(1001);

    // المراقب يرفع المحضر بغياب طالب، ثم تُولَّد كشوف الرصد
    const session = await rootDb.examSession.findFirstOrThrow({ where: { examId: exam.id, gradeId: s.g2.id } });
    const teacher = await s.as(s.teacherU.id);
    await teacher.assessment.exams.saveReport({ sessionId: session.id, committeeId: committee.id, absentStudentIds: [s.students[1]!.id], incidents: [{ studentId: s.students[0]!.id, kind: "حيازة جوال", note: "سُلّم للوكيل" }] });
    const outsider = await makeUser(s.t, "TEACHER", { branchId: s.branch.id });
    await expect((await s.as(outsider.id)).assessment.exams.saveReport({ sessionId: session.id, committeeId: committee.id, absentStudentIds: [], incidents: [] })).rejects.toThrow(/مراقبي/);
    const sheets = await vp.assessment.exams.createSheets({ sessionId: session.id });
    expect(sheets).toMatchObject({ created: 1, absences: 1 });
    const sheet = await rootDb.assessment.findFirstOrThrow({ where: { examSessionId: session.id }, include: { marks: true } });
    expect(sheet).toMatchObject({ componentKey: "midterm", teacherId: s.teacherU.id, sectionId: s.s2a.id });
    expect(sheet.marks.find((m) => m.studentId === s.students[1]!.id)?.absent).toBe(true);
    // لا تُعدَّل المادة/العظمى بعد توليد الكشوف
    await expect(vp.assessment.exams.saveSession({ examId: exam.id, id: session.id, gradeId: session.gradeId, subjectId: session.subjectId, date: start, startTime: "08:00", durationMin: 90, maxTenths: 300 })).rejects.toThrow(/كشوف/);
  });
});

// =====================================================================
// الموارد البشرية والرواتب
// =====================================================================

async function hrSchool() {
  const s = await makeSchool();
  const hrm = await makeUser(s.t, "HR_MANAGER", { name: "مديرة الموارد البشرية" });
  const hro = await makeUser(s.t, "HR_OFFICER", { name: "أخصائي الموارد البشرية" });
  const principalU = await makeUser(s.t, "PRINCIPAL", { name: "المدير" });
  const accountantU = await makeUser(s.t, "ACCOUNTANT", { name: "المحاسب" });
  const as = async (userId: string) => (await callerFor(s.tenantId, userId)).caller;
  const acc = await as(accountantU.id);
  const bank = await acc.finance.banking.saveAccount({ name: "الحساب الجاري", bankName: "مصرف الراجحي", iban: iban(7), isActive: true });
  const base = { gender: "MALE" as const, nationality: "SA", idType: "NATIONAL_ID" as const, category: "ACADEMIC" as const, gosiRegistered: true, branchId: s.branch.id };
  return { ...s, hrm, hro, principalU, accountantU, as, bank, base };
}

describe("المرحلة ٤ — الموارد البشرية والرواتب", () => {
  it("المسير: الاحتساب (تأمينات، غياب، سلفة، مكافأة) ← المراجعة والاعتماد ← قيد متوازن ← الصرف وملف حماية الأجور والقسيمة", async () => {
    const s = await hrSchool();
    const hro = await s.as(s.hro.id);
    const hrm = await s.as(s.hrm.id);
    const teacherU = await makeUser(s.t, "TEACHER", { branchId: s.branch.id });
    const saudi = await hro.hr.employees.create({ ...s.base, fullName: "سعد بن محمد بن علي الغامدي", nationalId: fakeNationalId(Number(uid().replace(/\D/g, "").slice(0, 6) || "4")), hireDate: "2022-01-01", iban: iban(11) });
    await hrm.hr.employees.linkUser({ employeeId: saudi.id, userId: teacherU.id });
    const expat = await hro.hr.employees.create({ ...s.base, fullName: "راجيش كومار ناير سينغ", nationality: "IN", idType: "IQAMA", category: "SERVICES", hireDate: "2021-05-01", iban: iban(12) });
    await expect(hro.hr.employees.create({ ...s.base, fullName: "اسم ثلاثي كامل للاختبار", hireDate: "2022-01-01", iban: "SA0000000000000000000000" })).rejects.toThrow(/آيبان/);
    // هيكل الراتب لموظفي الرواتب فقط (لا المعلم)
    await expect((await s.as(teacherU.id)).hr.employees.saveContract({ employeeId: saudi.id, type: "UNLIMITED", startDate: "2022-01-01", basicMinor: 1_000_000, housingMinor: 250_000, transportMinor: 100_000, otherAllowances: [], hoursPerDay: 8, annualLeaveDays: 21 })).rejects.toThrow();
    await hrm.hr.employees.saveContract({ employeeId: saudi.id, type: "UNLIMITED", startDate: "2022-01-01", basicMinor: 1_000_000, housingMinor: 250_000, transportMinor: 100_000, otherAllowances: [], hoursPerDay: 8, annualLeaveDays: 21 });
    await hrm.hr.employees.saveContract({ employeeId: expat.id, type: "UNLIMITED", startDate: "2021-05-01", basicMinor: 300_000, housingMinor: 75_000, transportMinor: 30_000, otherAllowances: [], hoursPerDay: 8, annualLeaveDays: 21 });

    const month = today().slice(0, 7);
    const saudiEmp = await rootDb.employee.findUniqueOrThrow({ where: { id: saudi.id } });
    await hro.hr.time.import({ rows: [{ number: saudiEmp.number, date: today(), checkIn: null, checkOut: null }] });
    await hro.hr.payroll.saveAdjustment({ employeeId: expat.id, month, kind: "BONUS", amountMinor: 50_000, hours: null, description: "مكافأة أداء" });
    // سلفة بطلب الموظف ← اعتماد ← صرف
    const self = await s.as(teacherU.id);
    const loan = await self.hr.payroll.requestLoan({ amountMinor: 300_000, installmentMinor: 100_000, startMonth: month, reason: "ظرف طارئ" });
    await hrm.approval.decide({ requestId: loan.approvalRequestId!, decision: "APPROVED" });
    await hrm.hr.payroll.disburseLoan({ id: loan.id, bankAccountId: s.bank.id, date: today() });

    const run = await hro.hr.payroll.create({ month });
    const detail = await hro.hr.payroll.run({ id: run.id });
    const lineS = detail.lines.find((l) => l.employeeId === saudi.id)!;
    const lineE = detail.lines.find((l) => l.employeeId === expat.id)!;
    expect(lineS.grossMinor).toBe(1_350_000);
    expect(lineS.gosiEmployeeMinor).toBe(121_875); // ٩٫٧٥٪ من ١٢٬٥٠٠
    expect(lineS.gosiEmployerMinor).toBe(146_875);
    expect(lineS.absenceMinor).toBe(45_000); // يوم غياب بأجر اليوم
    expect(lineS.loanMinor).toBe(100_000);
    expect(lineS.netMinor).toBe(1_350_000 - 121_875 - 45_000 - 100_000);
    expect(lineE.gosiEmployeeMinor).toBe(0);
    expect(lineE.gosiEmployerMinor).toBe(7_500); // ٢٪ أخطار مهنية
    expect(lineE.bonusMinor).toBe(50_000);
    expect(lineE.netMinor).toBe(455_000);
    expect(lineS.eosAccrualMinor).toBe(56_250); // نصف شهر ÷ ١٢

    const submitted = await hro.hr.payroll.submit({ id: run.id });
    await expect(hro.approval.decide({ requestId: submitted.approvalRequestId!, decision: "APPROVED" })).rejects.toThrow();
    await hrm.approval.decide({ requestId: submitted.approvalRequestId!, decision: "APPROVED" });
    const principal = await s.as(s.principalU.id);
    await principal.approval.decide({ requestId: submitted.approvalRequestId!, decision: "APPROVED" });
    const approved = await rootDb.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(approved.status).toBe("APPROVED");
    const entry = await rootDb.journalEntry.findUniqueOrThrow({ where: { id: approved.journalEntryId! }, include: { lines: { include: { account: true } } } });
    const total = (k: "debitMinor" | "creditMinor") => entry.lines.reduce((a, l) => a + Number(l[k]), 0);
    expect(total("debitMinor")).toBe(total("creditMinor"));
    const credit = (key: string) => entry.lines.filter((l) => l.account.systemKey === key).reduce((a, l) => a + Number(l.creditMinor), 0);
    expect(credit("SALARIES_PAYABLE")).toBe(approved.netMinor);
    expect(credit("GOSI_PAYABLE")).toBe(121_875 + 146_875 + 7_500);
    expect(credit("AR_STAFF")).toBe(100_000);
    expect((await rootDb.employeeLoan.findUniqueOrThrow({ where: { id: loan.id } })).repaidMinor).toBe(100_000);
    await expect(hro.hr.payroll.recalc({ id: run.id })).rejects.toThrow(/المسودة/);
    await expect(hro.hr.payroll.saveAdjustment({ employeeId: expat.id, month, kind: "BONUS", amountMinor: 10_000, hours: null, description: "بعد الاعتماد" })).rejects.toThrow(/معتمد/);

    // القسيمة: للموظف نفسه فقط
    expect((await self.hr.payroll.payslip({ lineId: lineS.id })).line.netMinor).toBe(lineS.netMinor);
    await expect(self.hr.payroll.payslip({ lineId: lineE.id })).rejects.toThrow();
    await expect(self.hr.payroll.runs()).rejects.toThrow();

    const wps = await hrm.hr.payroll.wps({ id: run.id });
    expect(wps.content).toContain(iban(11));
    expect(wps.content.split("\n")).toHaveLength(3);
    await hrm.hr.payroll.pay({ id: run.id, bankAccountId: s.bank.id, date: today() });
    const paid = await rootDb.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(paid.status).toBe("PAID");
    const pay = await rootDb.journalEntry.findUniqueOrThrow({ where: { id: paid.paymentEntryId! }, include: { lines: true } });
    expect(pay.lines.reduce((a, l) => a + Number(l.debitMinor), 0)).toBe(paid.netMinor);
  });

  it("منصة دولية: تغيير الدولة يغيّر صيغ الهوية والآيبان وتعريف المواطن، وقواعد التأمين والجزاءات من الإعدادات", async () => {
    const s = await hrSchool();
    const owner = await s.as((await makeUser(s.t, "OWNER", { name: "المالك" })).id);
    let hro = await s.as(s.hro.id);
    let hrm = await s.as(s.hrm.id);
    // أخصائي الموارد البشرية لا يعدّل إعدادات الإقليم
    await expect(hro.moduleSettings.update({ key: "region", patch: { country: "EG" } })).rejects.toThrow();
    const r = await owner.moduleSettings.update({ key: "region", patch: { country: "EG" } });
    expect(r.values).toMatchObject({ country: "EG", ibanCountry: "EG", citizenIdLabel: "رقم قومي" });
    await expect(owner.moduleSettings.update({ key: "region", patch: { citizenIdPattern: "([" } })).rejects.toThrow();
    await hrm.moduleSettings.update({ key: "hr", patch: { insuranceSchemes: [{ name: "التأمينات الاجتماعية", appliesTo: "ALL", employeeBp: 1100, employerBp: 1875 }], insuranceBase: "FULL", insuranceCapMinor: 0, penaltiesTreatment: "LIABILITY", eosEnabled: false } });
    // الجلسة تُحمَّل مع كل طلب: جلسات جديدة بالإعدادات المحدثة
    hro = await s.as(s.hro.id);
    hrm = await s.as(s.hrm.id);

    const base = { ...s.base, nationality: "EG" };
    // هوية سعودية وآيبان سعودي لم يعودا مقبولين
    await expect(hro.hr.employees.create({ ...base, fullName: "محمد أحمد علي حسن", nationalId: fakeNationalId(9), hireDate: "2022-01-01" })).rejects.toThrow(/رقم قومي/);
    await expect(hro.hr.employees.create({ ...base, fullName: "محمد أحمد علي حسن", hireDate: "2022-01-01", iban: iban(21) })).rejects.toThrow(/آيبان/);
    const eg = await hro.hr.employees.create({ ...base, fullName: "محمد أحمد علي حسن", nationalId: "29001011234567", hireDate: "2022-01-01" });
    const sa = await hro.hr.employees.create({ ...base, nationality: "SA", idType: "PASSPORT", nationalId: "K1234567", fullName: "سعد بن محمد الغامدي", hireDate: "2022-01-01" });
    for (const id of [eg.id, sa.id]) await hrm.hr.employees.saveContract({ employeeId: id, type: "UNLIMITED", startDate: "2022-01-01", basicMinor: 1_000_000, housingMinor: 250_000, transportMinor: 100_000, otherAllowances: [], hoursPerDay: 8, annualLeaveDays: 21 });
    const month = today().slice(0, 7);
    await hro.hr.payroll.saveAdjustment({ employeeId: eg.id, month, kind: "PENALTY", amountMinor: 20_000, hours: null, description: "جزاء تأخر متكرر" });
    const run = await hro.hr.payroll.create({ month });
    const detail = await hro.hr.payroll.run({ id: run.id });
    const lEg = detail.lines.find((l) => l.employeeId === eg.id)!;
    const lSa = detail.lines.find((l) => l.employeeId === sa.id)!;
    // النظام على الجميع، على الأجر الكامل وبلا سقف
    expect(lEg.gosiEmployeeMinor).toBe(148_500);
    expect(lSa.gosiEmployeeMinor).toBe(148_500);
    expect(lEg.gosiEmployerMinor).toBe(253_125);
    expect(lEg.eosAccrualMinor).toBe(0);
    const submitted = await hro.hr.payroll.submit({ id: run.id });
    await hrm.approval.decide({ requestId: submitted.approvalRequestId!, decision: "APPROVED" });
    await (await s.as(s.principalU.id)).approval.decide({ requestId: submitted.approvalRequestId!, decision: "APPROVED" });
    const approved = await rootDb.payrollRun.findUniqueOrThrow({ where: { id: run.id } });
    const entry = await rootDb.journalEntry.findUniqueOrThrow({ where: { id: approved.journalEntryId! }, include: { lines: { include: { account: true } } } });
    expect(entry.lines.reduce((a, l) => a + Number(l.debitMinor), 0)).toBe(entry.lines.reduce((a, l) => a + Number(l.creditMinor), 0));
    expect(entry.lines.filter((l) => l.account.systemKey === "PENALTIES_PAYABLE").reduce((a, l) => a + Number(l.creditMinor), 0)).toBe(20_000);
  });

  it("الإجازة: طلب ذاتي ← المدير المباشر ← الموارد البشرية ← خصم الرصيد وتسجيل الحضور، والإجازة غير المدفوعة تُخصم من الراتب", async () => {
    const s = await hrSchool();
    const hro = await s.as(s.hro.id);
    const hrm = await s.as(s.hrm.id);
    const staffU = await makeUser(s.t, "TEACHER", { branchId: s.branch.id });
    const managerU = await makeUser(s.t, "VP_ACADEMIC", { branchId: s.branch.id });
    const manager = await hro.hr.employees.create({ ...s.base, fullName: "نورة بنت علي بن سعد القحطاني", gender: "FEMALE", hireDate: "2018-01-01" });
    await hrm.hr.employees.linkUser({ employeeId: manager.id, userId: managerU.id });
    const staff = await hro.hr.employees.create({ ...s.base, fullName: "هند بنت عبدالرحمن بن فهد السديري", gender: "FEMALE", hireDate: "2020-01-01", iban: iban(21) });
    await hrm.hr.employees.linkUser({ employeeId: staff.id, userId: staffU.id });
    await rootDb.employee.update({ where: { id: staff.id }, data: { managerId: manager.id } });
    await hrm.hr.employees.saveContract({ employeeId: staff.id, type: "UNLIMITED", startDate: "2020-01-01", basicMinor: 900_000, housingMinor: 0, transportMinor: 0, otherAllowances: [], hoursPerDay: 8, annualLeaveDays: 21 });
    const types = await hrm.hr.time.leaveTypes();
    const annual = types.find((t) => t.code === "ANNUAL")!;
    const unpaid = types.find((t) => t.code === "UNPAID")!;
    const me = await s.as(staffU.id);
    const start = weekday(addDays(today(), 7));
    const req = await me.hr.time.requestLeave({ leaveTypeId: annual.id, startDate: start, endDate: start });
    await expect(me.hr.time.requestLeave({ leaveTypeId: annual.id, startDate: start, endDate: start })).rejects.toThrow(/متداخل/);
    await expect(hrm.approval.decide({ requestId: req.approvalRequestId!, decision: "APPROVED" })).rejects.toThrow(/المعتمد/);
    await (await s.as(managerU.id)).approval.decide({ requestId: req.approvalRequestId!, decision: "APPROVED" });
    await hrm.approval.decide({ requestId: req.approvalRequestId!, decision: "APPROVED" });
    expect((await rootDb.staffLeaveRequest.findUniqueOrThrow({ where: { id: req.id } })).status).toBe("APPROVED");
    const bal = (await me.hr.time.me()).balances!.find((b) => b.type.id === annual.id)!;
    expect(bal.used).toBe(1);
    // خدمة تتجاوز خمس سنوات ← ٣٠ يوماً (المادة ١٠٩)
    expect(bal.entitled).toBe(30);
    expect(bal.remaining).toBe(29);
    expect((await rootDb.employeeAttendance.findFirstOrThrow({ where: { employeeId: staff.id, date: new Date(start) } })).status).toBe("ON_LEAVE");

    // إجازة غير مدفوعة يوم عمل من الشهر الحالي تُخصم بأجر اليوم (٣٠٠ ر.س.)
    const month = today().slice(0, 7);
    const day = [...Array(28).keys()].map((i) => `${month}-${String(i + 1).padStart(2, "0")}`).find((d) => ![5, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()))!;
    const u = await hro.hr.time.requestLeave({ employeeId: staff.id, leaveTypeId: unpaid.id, startDate: day, endDate: day, reason: "ظرف خاص" });
    await (await s.as(managerU.id)).approval.decide({ requestId: u.approvalRequestId!, decision: "APPROVED" });
    await hrm.approval.decide({ requestId: u.approvalRequestId!, decision: "APPROVED" });
    const run = await hro.hr.payroll.create({ month });
    const line = (await hro.hr.payroll.run({ id: run.id })).lines.find((l) => l.employeeId === staff.id)!;
    expect(line.unpaidLeaveMinor).toBe(30_000);
  });

  it("نهاية الخدمة: الاستقالة بثلث المكافأة ← اعتمادان ← قيد ← إيقاف الحساب وإبطال الجلسات وإعادة إسناد الفصول للمدير", async () => {
    const s = await hrSchool();
    const hro = await s.as(s.hro.id);
    const hrm = await s.as(s.hrm.id);
    const staffU = await makeUser(s.t, "TEACHER", { branchId: s.branch.id });
    const managerU = await makeUser(s.t, "VP_ACADEMIC", { branchId: s.branch.id });
    const hire = addDays(today(), -(365 * 3 - 1));
    const manager = await hro.hr.employees.create({ ...s.base, fullName: "فهد بن سعد بن ناصر السبيعي", hireDate: "2015-01-01" });
    await hrm.hr.employees.linkUser({ employeeId: manager.id, userId: managerU.id });
    const staff = await hro.hr.employees.create({ ...s.base, fullName: "رائد بن حمود بن علي الحارثي", hireDate: hire, iban: iban(31) });
    await hrm.hr.employees.linkUser({ employeeId: staff.id, userId: staffU.id });
    await rootDb.employee.update({ where: { id: staff.id }, data: { managerId: manager.id } });
    await hrm.hr.employees.saveContract({ employeeId: staff.id, type: "UNLIMITED", startDate: hire, basicMinor: 900_000, housingMinor: 225_000, transportMinor: 75_000, otherAllowances: [], hoursPerDay: 8, annualLeaveDays: 21 });
    const subject = await rootDb.subject.create({ data: { tenantId: s.tenantId, code: `E${uid()}`, name: "الإنجليزية" } });
    await rootDb.teacherAssignment.create({ data: { tenantId: s.tenantId, academicYearId: s.year.id, sectionId: s.s2a.id, subjectId: subject.id, teacherId: staffU.id, weeklyPeriods: 4 } });
    const { token } = await createSession({ tenantId: s.tenantId, userId: staffU.id, twoFactorVerified: true, ip: null, userAgent: "vitest" });

    const preview = await hrm.hr.eos.preview({ employeeId: staff.id, reason: "RESIGNATION", lastWorkingDay: today() });
    expect(preview.serviceDays).toBe(365 * 3);
    expect(preview.eos.fullMinor).toBe(1_800_000); // ٣ سنوات × نصف شهر × ١٢٬٠٠٠
    expect(preview.eos.awardMinor).toBe(600_000); // الثلث
    const settlement = await hro.hr.eos.create({ employeeId: staff.id, reason: "RESIGNATION", lastWorkingDay: today() });
    await expect(hro.hr.eos.create({ employeeId: staff.id, reason: "RESIGNATION", lastWorkingDay: today() })).rejects.toThrow(/توجد تصفية/);
    await hrm.approval.decide({ requestId: settlement.approvalRequestId!, decision: "APPROVED" });
    await (await s.as(s.principalU.id)).approval.decide({ requestId: settlement.approvalRequestId!, decision: "APPROVED" });

    const done = await rootDb.endOfService.findUniqueOrThrow({ where: { id: settlement.id } });
    expect(done.status).toBe("APPROVED");
    const entry = await rootDb.journalEntry.findUniqueOrThrow({ where: { id: done.journalEntryId! }, include: { lines: { include: { account: true } } } });
    expect(entry.lines.reduce((a, l) => a + Number(l.debitMinor) - Number(l.creditMinor), 0)).toBe(0);
    // لا مخصص متراكم في مدرسة جديدة ← المكافأة كلها مصروف
    expect(entry.lines.find((l) => l.account.systemKey === "EOS_EXPENSE")?.debitMinor).toBe(BigInt(600_000));
    expect((await rootDb.employee.findUniqueOrThrow({ where: { id: staff.id } })).status).toBe("TERMINATED");
    expect((await rootDb.user.findUniqueOrThrow({ where: { id: staffU.id } })).status).toBe("SUSPENDED");
    expect(await validateSessionToken(token)).toBeNull();
    expect((await rootDb.teacherAssignment.findFirstOrThrow({ where: { subjectId: subject.id } })).teacherId).toBe(managerU.id);
    const audit = await rootDb.auditLog.findFirst({ where: { tenantId: s.tenantId, entityType: "Employee", entityId: staff.id, summary: { contains: "إنهاء خدمة" } } });
    expect(audit).not.toBeNull();

    await hrm.hr.eos.pay({ id: settlement.id, bankAccountId: s.bank.id, date: today() });
    expect((await rootDb.endOfService.findUniqueOrThrow({ where: { id: settlement.id } })).status).toBe("PAID");
  });

  it("عزل المستأجرين والصلاحيات: لا يرى موظفو مدرسة أخرى ولا المعلمُ الموظفين أو الرواتب", async () => {
    const a = await hrSchool();
    const b = await makeTenant("مدرسة أخرى");
    const hrB = await makeUser(b, "HR_MANAGER");
    const empA = await (await a.as(a.hro.id)).hr.employees.create({ ...a.base, fullName: "موظف بن مدرسة بن أولى الاختباري", hireDate: "2020-01-01" });
    const callerB = (await callerFor(b.tenant.id, hrB.id)).caller;
    expect((await callerB.hr.employees.list({})).map((e) => e.id)).not.toContain(empA.id);
    await expect(callerB.hr.employees.get({ id: empA.id })).rejects.toThrow();
    const teacherU = await makeUser(a.t, "TEACHER", { branchId: a.branch.id });
    const teacher = await a.as(teacherU.id);
    await expect(teacher.hr.employees.list({})).rejects.toThrow();
    await expect(teacher.hr.eos.list()).rejects.toThrow();
    // الخدمة الذاتية متاحة لكل موظف (بلا ملف مرتبط: رسالة واضحة)
    expect((await teacher.hr.time.me()).employee).toBeNull();
  });
});
