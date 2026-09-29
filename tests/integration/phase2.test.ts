import { describe, expect, it } from "vitest";
import { rootDb } from "@/server/db/client";
import { findConflicts } from "@/lib/timetable/generator";
import { callerFor, makeTenant, makeUser } from "./helpers";
import { fakeNationalId, makeSchool, pastSchoolDay } from "./school-fixture";

describe("المرحلة ٢ — مسارات العمل المتكاملة", () => {
  it("قبول طلب الالتحاق ينشئ ملف الطالب وولي الأمر ويرسل رسالة القبول ويُسجَّل في التدقيق، ويمنع تكرار الهوية", async () => {
    const s = await makeSchool();
    const staff = await makeUser(s.t, "ADMISSIONS", { branchId: s.branch.id });
    const { caller } = await callerFor(s.tenantId, staff.id);
    const nationalId = fakeNationalId(424242);
    const input = {
      branchId: s.branch.id,
      requestedGradeId: s.g1.id,
      firstName: "سعد",
      fatherName: "فهد",
      grandfatherName: "علي",
      familyName: "الحربي",
      gender: "MALE" as const,
      nationality: "SA",
      idType: "NATIONAL_ID" as const,
      nationalId,
      birthDate: new Date("2019-05-01"),
      guardianName: "فهد علي الحربي",
      guardianRelation: "FATHER" as const,
      guardianPhone: "0551234567",
    };
    const admission = await caller.admissions.create(input);
    await expect(caller.admissions.create(input)).rejects.toMatchObject({ message: expect.stringContaining("طلب قبول مفتوح") });
    await caller.admissions.setStage({ id: admission.id, stage: "ACCEPTED" });
    const updated = await rootDb.admission.findUniqueOrThrow({ where: { id: admission.id } });
    expect(updated.stage).toBe("ACCEPTED");
    const student = await rootDb.student.findUniqueOrThrow({ where: { id: updated.studentId! }, include: { guardians: { include: { guardian: true } } } });
    expect(student.fullName).toBe("سعد فهد علي الحربي");
    expect(student.nationalIdEnc).not.toContain(nationalId);
    expect(student.nationalIdLast4).toBe(nationalId.slice(-4));
    expect(student.guardians[0]?.guardian.phone).toBe("0551234567");
    const messages = await rootDb.outboundMessage.findMany({ where: { tenantId: s.tenantId, to: "0551234567" } });
    expect(messages.some((m) => m.body.includes("قبول") && m.body.includes(student.academicNumber))).toBe(true);
    const audit = await rootDb.auditLog.findFirst({ where: { tenantId: s.tenantId, entityType: "Admission", entityId: admission.id, action: "APPROVE" } });
    expect(audit?.userId).toBe(staff.id);
    // الطالب مسجّل الآن: التقديم بالهوية نفسها ممنوع
    await expect(caller.admissions.create({ ...input, firstName: "سعود" })).rejects.toMatchObject({ message: expect.stringContaining("مسجّل مسبقاً") });
  });

  it("الغياب يرسل لولي الأمر، وبلوغ حد الغياب ينشئ ملاحظة سلوكية ويرسل تنبيه الحد", async () => {
    const s = await makeSchool({ settings: { attendance: { absenceThreshold: 2 } } });
    const vp = await makeUser(s.t, "VP_STUDENTS", { branchId: s.branch.id });
    const st = await s.student(s.g1.id, s.s1a.id);
    const earlier = pastSchoolDay(3);
    await rootDb.attendance.create({ data: { tenantId: s.tenantId, branchId: s.branch.id, studentId: st.id, sectionId: s.s1a.id, date: new Date(earlier), period: 0, status: "ABSENT" } });
    const { caller } = await callerFor(s.tenantId, vp.id);
    const result = await caller.attendance.save({ sectionId: s.s1a.id, date: pastSchoolDay(1), entries: [{ studentId: st.id, status: "ABSENT" }] });
    expect(result.thresholdAlerts).toBe(1);
    const behavior = await rootDb.behaviorRecord.findFirst({ where: { studentId: st.id, source: "ATTENDANCE_THRESHOLD" } });
    expect(behavior?.kind).toBe("NEGATIVE");
    const msgs = await rootDb.outboundMessage.findMany({ where: { tenantId: s.tenantId } });
    expect(msgs.some((m) => m.body.includes("تجاوز غياب"))).toBe(true);
    // التكرار في الفصل الدراسي نفسه لا يكرر التنبيه
    const again = await caller.attendance.save({ sectionId: s.s1a.id, date: pastSchoolDay(2), entries: [{ studentId: st.id, status: "ABSENT" }] });
    expect(again.thresholdAlerts).toBe(0);
  });

  it("الحالات الإرشادية سرّية: المعلم ومرشد آخر لا يطّلعان، والمرشد المسؤول والمدير يطّلعان", async () => {
    const s = await makeSchool();
    const counselor = await makeUser(s.t, "COUNSELOR", { branchId: s.branch.id });
    const other = await makeUser(s.t, "COUNSELOR", { branchId: s.branch.id });
    const teacher = await makeUser(s.t, "TEACHER", { branchId: s.branch.id });
    const principal = await makeUser(s.t, "PRINCIPAL");
    await rootDb.section.update({ where: { id: s.s1a.id }, data: { homeroomUserId: teacher.id } });
    const st = await s.student(s.g1.id, s.s1a.id);
    const c = await callerFor(s.tenantId, counselor.id);
    const created = await c.caller.behavior.createCase({ studentId: st.id, title: "متابعة ظروف أسرية", category: "family", severity: "HIGH", counselorId: counselor.id, description: "تفاصيل سرية" });
    await expect(c.caller.behavior.getCase({ id: created.id })).resolves.toMatchObject({ title: "متابعة ظروف أسرية" });
    const o = await callerFor(s.tenantId, other.id);
    await expect(o.caller.behavior.getCase({ id: created.id })).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN|NOT_FOUND/) });
    const t = await callerFor(s.tenantId, teacher.id);
    await expect(t.caller.behavior.getCase({ id: created.id })).rejects.toMatchObject({ code: expect.stringMatching(/FORBIDDEN|NOT_FOUND/) });
    const p = await callerFor(s.tenantId, principal.id);
    await expect(p.caller.behavior.getCase({ id: created.id })).resolves.toMatchObject({ id: created.id });
  });

  it("الانسحاب لا يُنفَّذ ولا تُصدر شهادته قبل خلو الطرف المالي", async () => {
    const s = await makeSchool();
    const requester = await makeUser(s.t, "VP_STUDENTS", { branchId: s.branch.id, name: "وكيل ١" });
    const vp = await makeUser(s.t, "VP_STUDENTS", { branchId: s.branch.id, name: "وكيل ٢" });
    const principal = await makeUser(s.t, "PRINCIPAL");
    const accountant = await makeUser(s.t, "ACCOUNTANT");
    const st = await s.student(s.g1.id, s.s1a.id);
    const r = await callerFor(s.tenantId, requester.id);
    const transfer = await r.caller.transfers.create({ studentId: st.id, type: "WITHDRAWAL", reason: "انتقال الأسرة إلى مدينة أخرى", effectiveDate: pastSchoolDay(1) });
    const approvalId = transfer.approvalRequestId!;
    const v = await callerFor(s.tenantId, vp.id);
    await v.caller.approval.decide({ requestId: approvalId, decision: "APPROVED" });
    const p = await callerFor(s.tenantId, principal.id);
    await p.caller.approval.decide({ requestId: approvalId, decision: "APPROVED" });
    // الموافقات الإدارية تمت، لكن المالية لم تعتمد بعد
    await expect(r.caller.transfers.complete({ id: transfer.id })).rejects.toMatchObject({ message: expect.stringMatching(/الموافقات|خلو الطرف/) });
    const a = await callerFor(s.tenantId, accountant.id);
    await a.caller.approval.decide({ requestId: approvalId, decision: "APPROVED" });
    const done = await r.caller.transfers.complete({ id: transfer.id });
    expect(done.certificateNumber).toBeTruthy();
    const student = await rootDb.student.findUniqueOrThrow({ where: { id: st.id } });
    expect(student.status).toBe("WITHDRAWN");
    expect(student.sectionId).toBeNull();
  });

  it("الفصول: لا تُخفض الطاقة تحت عدد الطلاب، والتوزيع التلقائي يحترم الطاقة", async () => {
    const s = await makeSchool();
    const vp = await makeUser(s.t, "VP_ACADEMIC", { branchId: s.branch.id });
    const { caller } = await callerFor(s.tenantId, vp.id);
    await s.student(s.g1.id, s.s1a.id);
    await s.student(s.g1.id, s.s1a.id);
    await expect(caller.academic.updateSection({ id: s.s1a.id, patch: { capacity: 1 } })).rejects.toMatchObject({ message: expect.stringContaining("أقل من عدد الطلاب") });
    for (let i = 0; i < 5; i++) await s.student(s.g1.id, null);
    const preview = await caller.academic.distribute({ branchId: s.branch.id, gradeId: s.g1.id, mode: "unassigned", dryRun: true });
    // الطاقة ٣+٣ والمسكّن ٢ ← يتسع لـ٤ فقط من ٥
    expect(preview.moved).toBe(4);
    expect(preview.unplaced).toHaveLength(1);
    expect(await rootDb.student.count({ where: { sectionId: null, gradeId: s.g1.id } })).toBe(5);
    const applied = await caller.academic.distribute({ branchId: s.branch.id, gradeId: s.g1.id, mode: "unassigned" });
    expect(applied.result.every((r) => r.count <= r.capacity)).toBe(true);
    expect(await rootDb.student.count({ where: { sectionId: null, gradeId: s.g1.id } })).toBe(1);
  });

  it("الإسناد ثم توليد الجدول: كل الحصص مسكّنة بلا تعارض، والنقل اليدوي يرفض ازدواج المعلم", async () => {
    const s = await makeSchool();
    const vp = await makeUser(s.t, "VP_ACADEMIC", { branchId: s.branch.id });
    const t1 = await makeUser(s.t, "TEACHER", { branchId: s.branch.id, name: "معلم الرياضيات" });
    const t2 = await makeUser(s.t, "TEACHER", { branchId: s.branch.id, name: "معلم العربية" });
    await rootDb.user.updateMany({ where: { id: { in: [t1.id, t2.id] } }, data: { status: "ACTIVE" } });
    const { caller } = await callerFor(s.tenantId, vp.id);
    const math = await caller.curriculum.saveSubject({ code: "MATH", name: "الرياضيات", color: "purple", roomKind: null });
    const arb = await caller.curriculum.saveSubject({ code: "ARB", name: "اللغة العربية", color: "navy", roomKind: null });
    for (const g of [s.g1.id, s.g2.id]) {
      await caller.curriculum.savePlanItem({ gradeId: g, subjectId: math.id, weeklyPeriods: 4, heavy: true });
      await caller.curriculum.savePlanItem({ gradeId: g, subjectId: arb.id, weeklyPeriods: 6, heavy: true });
    }
    await caller.assignments.saveLoad({ userId: t1.id, quota: 24, freeDay: 4, subjectIds: [math.id] });
    await caller.assignments.saveLoad({ userId: t2.id, quota: 24, freeDay: null, subjectIds: [arb.id] });
    const auto = await caller.assignments.auto({ branchId: s.branch.id });
    expect(auto.created).toBe(6);
    const gen = await caller.timetable.generate({ branchId: s.branch.id, seed: 7 });
    expect(gen.unplaced).toEqual([]);
    expect(gen.placed).toBe(30);
    expect(gen.freeDayViolations).toBe(0);
    const slots = await rootDb.timetableSlot.findMany({ where: { tenantId: s.tenantId } });
    expect(findConflicts(slots, { periods: 7, maxConsecutive: 4 })).toEqual([]);
    expect(slots.some((x) => x.teacherId === t1.id && x.day === 4)).toBe(false);
    // نقل حصة لمعلم الرياضيات إلى خانة يُدرّس فيها فصلاً آخر ← مرفوض
    const a = slots.find((x) => x.teacherId === t1.id && x.sectionId === s.s1a.id)!;
    const busy = slots.find((x) => x.teacherId === t1.id && x.sectionId !== s.s1a.id && !slots.some((y) => y.sectionId === s.s1a.id && y.day === x.day && y.period === x.period))!;
    if (busy) await expect(caller.timetable.move({ slotId: a.id, day: busy.day, period: busy.period })).rejects.toMatchObject({ message: expect.stringContaining("المعلم") });
    // المعلم يرى جدوله، ولا يولّد
    const teacher = await callerFor(s.tenantId, t1.id);
    const mine = await teacher.caller.timetable.grid({ kind: "teacher", id: t1.id });
    expect(mine.slots).toHaveLength(12);
    await expect(teacher.caller.timetable.generate({ branchId: s.branch.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("إنهاء العام: ترفيع الطلاب، والصف الأخير يتخرج، والمحدد للإعادة يبقى، وتُنسخ الفصول", async () => {
    const s = await makeSchool();
    const principal = await makeUser(s.t, "PRINCIPAL");
    const a = await s.student(s.g1.id, s.s1a.id);
    const b = await s.student(s.g1.id, s.s1a.id);
    const c = await s.student(s.g2.id, s.s2a.id);
    const { caller } = await callerFor(s.tenantId, principal.id);
    const preview = await caller.academic.yearEndPreview();
    expect(preview.grades.find((g) => g.id === s.g2.id)?.nextGrade).toBeNull();
    await expect(caller.academic.closeYear({ name: "عام جديد", startDate: preview.suggested.startDate, endDate: preview.suggested.endDate, retainStudentIds: [], confirm: "خطأ" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const r = await caller.academic.closeYear({ name: "عام جديد", startDate: preview.suggested.startDate, endDate: preview.suggested.endDate, retainStudentIds: [b.id], confirm: s.year.name });
    expect(r).toMatchObject({ promoted: 1, retained: 1, graduated: 1, sections: 3 });
    const [na, nb, nc] = await Promise.all([a, b, c].map((x) => rootDb.student.findUniqueOrThrow({ where: { id: x.id }, include: { section: true } })));
    expect(na!.gradeId).toBe(s.g2.id);
    expect(na!.section?.name).toBe("أ");
    expect(na!.academicYearId).toBe(r.yearId);
    expect(nb!.gradeId).toBe(s.g1.id);
    expect(nc!.status).toBe("GRADUATED");
    const years = await rootDb.academicYear.findMany({ where: { tenantId: s.tenantId, isCurrent: true } });
    expect(years.map((y) => y.id)).toEqual([r.yearId]);
    // المعلم لا يملك إنهاء العام
    const teacher = await makeUser(s.t, "TEACHER", { branchId: s.branch.id });
    const tc = await callerFor(s.tenantId, teacher.id);
    await expect(tc.caller.academic.yearEndPreview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("الأنشطة: الزائد عن الطاقة للانتظار، والإلغاء يرقّي المنتظر، والمشاركة تتطلب موافقة ولي الأمر", async () => {
    const s = await makeSchool();
    const vp = await makeUser(s.t, "VP_ACADEMIC", { branchId: s.branch.id });
    await makeUser(s.t, "VP_STUDENTS", { branchId: s.branch.id });
    const students = [await s.student(s.g1.id, s.s1a.id), await s.student(s.g1.id, s.s1a.id), await s.student(s.g1.id, s.s1b.id)];
    const { caller } = await callerFor(s.tenantId, vp.id);
    const activity = await caller.activities.create({ title: "رحلة علمية", kind: "TRIP", branchId: s.branch.id, capacity: 2, feeMinor: 5000, startAt: new Date(Date.now() + 5 * 86_400_000), gradeIds: [s.g1.id] });
    expect(activity.requiresConsent).toBe(true);
    const reg = await caller.activities.register({ id: activity.id, studentIds: students.map((x) => x.id) });
    expect(reg).toEqual({ registered: 2, waitlisted: 1 });
    const detail = await caller.activities.get({ id: activity.id });
    expect(detail.calendarSynced).toBe(true);
    const first = detail.registrations.find((r) => r.status === "REGISTERED")!;
    await expect(caller.activities.updateRegistration({ id: first.id, status: "ATTENDED" })).rejects.toMatchObject({ message: expect.stringContaining("موافقة") });
    const sent = await caller.activities.requestConsents({ id: activity.id });
    expect(sent.students).toBe(3);
    await caller.activities.updateRegistration({ id: first.id, consentStatus: "DENIED" });
    const after = await caller.activities.get({ id: activity.id });
    expect(after.registrations.filter((r) => r.status === "REGISTERED")).toHaveLength(2);
    expect(after.registrations.filter((r) => r.status === "WAITLIST")).toHaveLength(0);
    const second = after.registrations.find((r) => r.status === "REGISTERED")!;
    await caller.activities.updateRegistration({ id: second.id, consentStatus: "GRANTED" });
    await expect(caller.activities.updateRegistration({ id: second.id, status: "ATTENDED" })).resolves.toEqual({ ok: true });
  });

  it("عزل المستأجرين في الوحدات الأكاديمية: لا يصل مستخدم مدرسة لفصول ونشاطات مدرسة أخرى", async () => {
    const s = await makeSchool();
    const vp = await makeUser(s.t, "VP_ACADEMIC", { branchId: s.branch.id });
    const own = await callerFor(s.tenantId, vp.id);
    const activity = await own.caller.activities.create({ title: "نادي العلوم", kind: "CLUB", branchId: s.branch.id });
    const other = await makeTenant();
    const owner = await makeUser(other, "OWNER");
    const { caller } = await callerFor(other.tenant.id, owner.id);
    await expect(caller.activities.get({ id: activity.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.academic.roster({ id: s.s1a.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(caller.timetable.grid({ kind: "section", id: s.s1a.id })).rejects.toMatchObject({ code: expect.stringMatching(/NOT_FOUND|BAD_REQUEST/) });
  });
});
