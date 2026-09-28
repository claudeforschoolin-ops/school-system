/**
 * بذور عمليات المرحلة ٢: الحضور (آخر ٣٠ يوم دراسة حتى اليوم ضمن العام)، السلوك، الإجازات،
 * التحويلات بمسارات موافقاتها، والحالات الإرشادية بجلساتها. (والأكاديمي والأنشطة في phase2-academic.)
 */
import type { Prisma } from "../../src/generated/prisma/client";
import { rootDb } from "../../src/server/db/client";
import { toISODate } from "../../src/lib/dates";
import { BEHAVIOR_CATEGORIES } from "../../src/lib/students";
import type { Rng } from "./data/students-data";
import { seedPhase2Academic } from "./phase2-academic";

const DAY = 86_400_000;
const TZ = "Asia/Riyadh";
const d0 = (iso: string) => new Date(`${iso}T00:00:00Z`);

export async function seedPhase2Operations(tenantId: string, r: Rng) {
  const year = await rootDb.academicYear.findFirstOrThrow({ where: { tenantId, isCurrent: true } });
  const users = await rootDb.user.findMany({ where: { tenantId }, select: { id: true, email: true, name: true } });
  const userBy = (email: string) => users.find((u) => u.email === email)!.id;
  const vpStudents = userBy("vp.students@demo.manassa.sa");
  const counselor = userBy("counselor@demo.manassa.sa");
  const principal = userBy("principal@demo.manassa.sa");
  const accountant = userBy("accountant@demo.manassa.sa");
  const teachers = await rootDb.userRole.findMany({ where: { tenantId, role: { key: "TEACHER" } }, select: { userId: true } });
  const today = toISODate(new Date(), TZ);

  // عطلة اليوم الوطني (إن وقعت ضمن العام)
  const nationalDay = `${year.startDate.getUTCFullYear()}-09-23`;
  if (nationalDay >= year.startDate.toISOString().slice(0, 10)) {
    await rootDb.calendarEvent.create({
      data: { tenantId, title: "إجازة اليوم الوطني", category: "HOLIDAY", startAt: d0(nationalDay), endAt: new Date(d0(nationalDay).getTime() + DAY - 1000), allDay: true, createdById: principal },
    });
  }

  // ---------------- الحضور ----------------
  const startIso = year.startDate.toISOString().slice(0, 10);
  const days: string[] = [];
  for (let t = d0(today).getTime(); days.length < 30 && t >= d0(startIso).getTime(); t -= DAY) {
    const iso = new Date(t).toISOString().slice(0, 10);
    const wd = new Date(t).getUTCDay();
    if (wd <= 4 && iso !== nationalDay) days.push(iso);
  }
  days.reverse();
  const students = await rootDb.student.findMany({ where: { tenantId, status: "ACTIVE", sectionId: { not: null }, deletedAt: null }, select: { id: true, sectionId: true, branchId: true, fullName: true } });
  const sections = await rootDb.section.findMany({ where: { tenantId, deletedAt: null, academicYearId: year.id }, select: { id: true, homeroomUserId: true } });
  const homeroom = new Map(sections.map((s) => [s.id, s.homeroomUserId]));
  // أنماط: معظمهم منتظمون، قلة كثيرة الغياب (لإظهار تنبيه تجاوز الحد)
  const chronic = new Set(students.filter(() => r.chance(0.025)).map((s) => s.id));
  const lateProne = new Set(students.filter(() => r.chance(0.06)).map((s) => s.id));
  // اليوم: بعض الفصول لم تُحضّر بعد
  const todayTaken = new Set(sections.filter(() => r.chance(0.7)).map((s) => s.id));
  const rows: Prisma.AttendanceCreateManyInput[] = [];
  for (const iso of days) {
    for (const s of students) {
      if (iso === today && !todayTaken.has(s.sectionId!)) continue;
      let status: "PRESENT" | "ABSENT" | "LATE" | "PERMISSION" | "EXCUSED" = "PRESENT";
      const roll = r.next();
      if (chronic.has(s.id)) status = roll < 0.22 ? "ABSENT" : roll < 0.3 ? "LATE" : "PRESENT";
      else if (roll < 0.025) status = "ABSENT";
      else if (roll < (lateProne.has(s.id) ? 0.12 : 0.04)) status = "LATE";
      else if (roll < 0.05) status = "PERMISSION";
      else if (roll < 0.058) status = "EXCUSED";
      rows.push({
        tenantId,
        branchId: s.branchId,
        studentId: s.id,
        sectionId: s.sectionId!,
        date: d0(iso),
        period: 0,
        status,
        reason: status === "ABSENT" ? (r.chance(0.4) ? "لم يُبلغ ولي الأمر" : null) : status === "EXCUSED" ? r.pick(["مراجعة طبية", "ظرف عائلي", "مرض"]) : status === "PERMISSION" ? "استئذان مبكر بطلب ولي الأمر" : null,
        minutesLate: status === "LATE" ? r.int(5, 35) : null,
        recordedById: homeroom.get(s.sectionId!) ?? vpStudents,
        createdAt: new Date(d0(iso).getTime() + 5 * 3_600_000),
      });
    }
  }
  for (let i = 0; i < rows.length; i += 2000) await rootDb.attendance.createMany({ data: rows.slice(i, i + 2000) });

  // تنبيهات تجاوز حد الغياب (٥ أيام في الفصل الدراسي)
  let behaviorNo = 0;
  const absences = await rootDb.attendance.groupBy({ by: ["studentId"], where: { tenantId, status: "ABSENT" }, _count: { _all: true } });
  for (const a of absences.filter((x) => x._count._all >= 5)) {
    const s = students.find((x) => x.id === a.studentId)!;
    behaviorNo += 1;
    await rootDb.behaviorRecord.create({
      data: {
        tenantId,
        branchId: s.branchId,
        number: behaviorNo,
        studentId: s.id,
        kind: "NEGATIVE",
        category: "absence",
        points: -3,
        severity: a._count._all >= 10 ? "HIGH" : "MEDIUM",
        occurredAt: new Date(Date.now() - r.int(1, 6) * DAY),
        description: `تجاوز حد الغياب: ${a._count._all} أيام في الفصل الدراسي الأول`,
        actionTaken: "إشعار ولي الأمر وإحالة للمرشد الطلابي",
        guardianNotified: true,
        source: "ATTENDANCE_THRESHOLD",
        reportedById: vpStudents,
        createdById: vpStudents,
      },
    });
  }

  // ---------------- السلوك ----------------
  const reporters = [...teachers.map((t) => t.userId), vpStudents, counselor];
  for (let k = 0; k < 110; k++) {
    const s = r.pick(students);
    const positive = r.chance(0.55);
    const cats = BEHAVIOR_CATEGORIES.filter((c) => (positive ? c.kind === "POSITIVE" : c.kind === "NEGATIVE" && c.id !== "absence"));
    const cat = r.pick(cats);
    behaviorNo += 1;
    await rootDb.behaviorRecord.create({
      data: {
        tenantId,
        branchId: s.branchId,
        number: behaviorNo,
        studentId: s.id,
        kind: cat.kind,
        category: cat.id,
        points: cat.points,
        severity: cat.kind === "POSITIVE" ? "LOW" : cat.id === "bullying" ? "HIGH" : Math.abs(cat.points) >= 4 ? "HIGH" : r.chance(0.3) ? "MEDIUM" : "LOW",
        occurredAt: new Date(Date.now() - r.int(0, 34) * DAY - r.int(1, 6) * 3_600_000),
        description: positive
          ? r.pick(["شارك بفاعلية في حل مسائل التحدي", "ساعد زميله في فهم الدرس", "أنجز مشروع الفصل متميزاً", "تطوع في تنظيم الإذاعة الصباحية"])
          : r.pick(["تكرر التأخر عن الطابور", "استخدام الجوال أثناء الحصة", "مشادة كلامية مع زميل", "عدم الالتزام بالزي المدرسي"]),
        actionTaken: positive ? null : r.pick(["تنبيه شفهي", "تعهد خطي", "إحالة للمرشد الطلابي", "اتصال بولي الأمر"]),
        guardianNotified: !positive && r.chance(0.4),
        reportedById: r.pick(reporters),
        createdById: vpStudents,
      },
    });
  }
  await rootDb.sequence.create({ data: { tenantId, key: "behavior", nextValue: behaviorNo + 1 } });

  // ---------------- الإجازات والاستئذان ----------------
  let leaveNo = 0;
  const leaveStatuses: Array<"PENDING" | "APPROVED" | "REJECTED"> = ["PENDING", "PENDING", "PENDING", "PENDING", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "REJECTED", "REJECTED"];
  for (const status of leaveStatuses) {
    const s = r.pick(students.filter((x) => !chronic.has(x.id)));
    const early = r.chance(0.35);
    const pastIdx = r.int(0, days.length - 2);
    const start = status === "PENDING" ? toISODate(new Date(Date.now() + r.int(1, 7) * DAY), TZ) : days[pastIdx]!;
    const end = early ? start : status === "PENDING" ? toISODate(new Date(d0(start).getTime() + r.int(0, 2) * DAY), TZ) : days[Math.min(days.length - 1, pastIdx + r.int(0, 2))]!;
    leaveNo += 1;
    const leave = await rootDb.studentLeave.create({
      data: {
        tenantId,
        branchId: s.branchId,
        number: leaveNo,
        studentId: s.id,
        kind: early ? "EARLY_DISMISSAL" : "LEAVE",
        startDate: d0(start),
        endDate: d0(end),
        reason: early ? r.pick(["موعد طبي بعد الحصة الرابعة", "ظرف عائلي طارئ"]) : r.pick(["مراجعة مستشفى الملك فيصل التخصصي — مرفق التقرير", "سفر عائلي لظرف طارئ", "نزلة برد — تقرير المركز الصحي"]),
        requestedBy: `ولي أمر ${s.fullName.split(" ")[0]}`,
        status,
        decidedById: status === "PENDING" ? null : vpStudents,
        decidedAt: status === "PENDING" ? null : new Date(d0(start).getTime() - DAY),
        decisionNote: status === "REJECTED" ? "لم يُرفق ما يثبت السبب" : null,
        createdById: vpStudents,
        createdAt: new Date(d0(start).getTime() - 2 * DAY),
      },
    });
    if (status === "APPROVED") {
      for (const iso of days.filter((x) => x >= start && x <= end)) {
        await rootDb.attendance.upsert({
          where: { studentId_date_period: { studentId: s.id, date: d0(iso), period: 0 } },
          create: { tenantId, branchId: s.branchId, studentId: s.id, sectionId: s.sectionId!, date: d0(iso), period: 0, status: early ? "PERMISSION" : "EXCUSED", reason: leave.reason.slice(0, 300), source: "LEAVE", leaveId: leave.id, recordedById: vpStudents },
          update: { status: early ? "PERMISSION" : "EXCUSED", reason: leave.reason.slice(0, 300), source: "LEAVE", leaveId: leave.id },
        });
      }
    }
  }
  await rootDb.sequence.create({ data: { tenantId, key: "leave", nextValue: leaveNo + 1 } });

  // ---------------- التحويلات ----------------
  const roles = await rootDb.role.findMany({ where: { tenantId, key: { in: ["VP_STUDENTS", "PRINCIPAL", "ACCOUNTANT"] } } });
  const roleId = (k: string) => roles.find((x) => x.key === k)!.id;
  const sectionsFull = await rootDb.section.findMany({ where: { tenantId, deletedAt: null, academicYearId: year.id }, select: { id: true, gradeId: true, branchId: true } });
  const pool = students.filter((s) => !chronic.has(s.id));
  const plan: Array<{ type: "SECTION" | "GRADE" | "OUTGOING" | "WITHDRAWAL" | "INCOMING"; status: "PENDING" | "APPROVED" | "COMPLETED"; decided: number }> = [
    { type: "GRADE", status: "APPROVED", decided: 2 },
    { type: "OUTGOING", status: "PENDING", decided: 2 },
    { type: "OUTGOING", status: "COMPLETED", decided: 3 },
    { type: "WITHDRAWAL", status: "COMPLETED", decided: 3 },
    { type: "INCOMING", status: "COMPLETED", decided: 1 },
    { type: "WITHDRAWAL", status: "PENDING", decided: 1 },
  ];
  let transferNo = 0;
  let certNo = 0;
  for (const p of plan) {
    const s = pool.splice(r.int(0, pool.length - 1), 1)[0]!;
    const full = await rootDb.student.findUniqueOrThrow({ where: { id: s.id }, include: { grade: true } });
    transferNo += 1;
    const steps = [{ name: "وكيل شؤون الطلاب", role: "VP_STUDENTS", by: vpStudents }];
    if (p.type !== "SECTION" && p.type !== "INCOMING") steps.push({ name: "مدير المدرسة", role: "PRINCIPAL", by: principal });
    if (p.type === "OUTGOING" || p.type === "WITHDRAWAL") steps.push({ name: "خلو الطرف المالي", role: "ACCOUNTANT", by: accountant });
    const createdAt = new Date(Date.now() - r.int(4, 20) * DAY);
    const otherGrade = p.type === "GRADE" ? await rootDb.grade.findFirst({ where: { tenantId, order: { gt: full.grade.order }, stageId: full.grade.stageId } }) : null;
    const targetSection = otherGrade ? sectionsFull.find((x) => x.gradeId === otherGrade.id && x.branchId === s.branchId) : null;
    const finalApproved = p.status !== "PENDING";
    const clearance = (p.type === "OUTGOING" || p.type === "WITHDRAWAL") && p.decided >= 3;
    const cert = p.status === "COMPLETED" && (p.type === "OUTGOING" || p.type === "WITHDRAWAL") ? `${new Date().getUTCFullYear()}/${String(++certNo).padStart(4, "0")}` : null;
    const transfer = await rootDb.transfer.create({
      data: {
        tenantId,
        branchId: s.branchId,
        number: transferNo,
        studentId: s.id,
        type: p.type,
        fromSectionId: s.sectionId,
        toSectionId: targetSection?.id ?? null,
        toGradeId: otherGrade?.id ?? null,
        otherSchool: p.type === "OUTGOING" ? r.pick(["مدارس الرواد الأهلية — جدة", "مدارس المملكة — الدمام"]) : p.type === "INCOMING" ? "مدارس الأندلس الأهلية" : null,
        reason: p.type === "OUTGOING" ? "انتقال عمل ولي الأمر إلى مدينة أخرى" : p.type === "WITHDRAWAL" ? "رغبة ولي الأمر في التعليم المنزلي مؤقتاً" : p.type === "GRADE" ? "اجتاز اختبار تحديد المستوى — ترفيع استثنائي بقرار اللجنة" : "استكمال ملف الطالب القادم من مدرسة أخرى",
        effectiveDate: d0(toISODate(new Date(createdAt.getTime() + 10 * DAY), TZ)),
        status: p.status,
        financialClearance: clearance,
        clearedById: clearance ? accountant : null,
        clearedAt: clearance ? new Date(createdAt.getTime() + 4 * DAY) : null,
        certificateNumber: cert,
        certificateIssuedAt: cert ? new Date(createdAt.getTime() + 5 * DAY) : null,
        createdById: userBy("reception@demo.manassa.sa"),
        createdAt,
      },
    });
    const approval = await rootDb.approvalRequest.create({
      data: {
        tenantId,
        type: "student_transfer",
        title: `${{ SECTION: "نقل بين الفصول", GRADE: "نقل صف/مرحلة", INCOMING: "قادم من مدرسة أخرى", OUTGOING: "إلى مدرسة أخرى", WITHDRAWAL: "انسحاب" }[p.type]}: ${s.fullName}`,
        description: transfer.reason,
        entityType: "Transfer",
        entityId: transfer.id,
        link: `/transfers/${transfer.id}`,
        // مقدّم الطلب موظف الاستقبال (لا يعتمد المعتمد طلباً قدّمه بنفسه)
        requestedById: userBy("reception@demo.manassa.sa"),
        status: finalApproved ? "APPROVED" : "PENDING",
        currentStep: Math.min(p.decided + 1, steps.length),
        decidedAt: finalApproved ? new Date(createdAt.getTime() + 4 * DAY) : null,
        createdAt,
      },
    });
    for (const [i, st] of steps.entries()) {
      const done = i < p.decided;
      await rootDb.approvalStep.create({
        data: { tenantId, requestId: approval.id, order: i + 1, name: st.name, approverRoleId: roleId(st.role), status: done ? "APPROVED" : "PENDING", decidedById: done ? st.by : null, decidedAt: done ? new Date(createdAt.getTime() + (i + 1) * DAY) : null },
      });
    }
    await rootDb.transfer.update({ where: { id: transfer.id }, data: { approvalRequestId: approval.id } });
    if (p.status === "COMPLETED" && (p.type === "OUTGOING" || p.type === "WITHDRAWAL")) {
      await rootDb.student.update({ where: { id: s.id }, data: { status: p.type === "OUTGOING" ? "TRANSFERRED" : "WITHDRAWN", sectionId: null } });
    }
  }
  await rootDb.sequence.createMany({ data: [{ tenantId, key: "transfer", nextValue: transferNo + 1 }, { tenantId, key: `transfer-cert:${new Date().getUTCFullYear()}`, prefix: `${new Date().getUTCFullYear()}/`, padding: 4, nextValue: certNo + 1 }] });

  // ---------------- الحالات الإرشادية ----------------
  const caseTitles = [
    ["تراجع دراسي ملحوظ في الرياضيات", "academic", "MEDIUM"],
    ["غياب متكرر دون عذر", "behavioral", "HIGH"],
    ["صعوبة في التكيف مع الزملاء الجدد", "social", "MEDIUM"],
    ["قلق الاختبارات", "psychological", "LOW"],
    ["خلاف أسري ينعكس على الطالبة", "family", "HIGH"],
    ["تنمّر إلكتروني من زميلات", "behavioral", "CRITICAL"],
    ["ضعف التركيز في الحصص", "academic", "LOW"],
    ["متابعة صحية بعد عملية جراحية", "health", "MEDIUM"],
    ["عزلة وانطواء", "psychological", "MEDIUM"],
    ["مشكلات سلوكية في المقصف", "behavioral", "LOW"],
  ] as const;
  // المرشدة لفرع البنات؛ حالات فرع البنين يتابعها وكيل شؤون الطلاب
  const girlsBranch = (await rootDb.branch.findFirstOrThrow({ where: { tenantId, gender: "GIRLS" } })).id;
  const girls = students.filter((s) => s.branchId === girlsBranch);
  const boys = students.filter((s) => s.branchId !== girlsBranch);
  let caseNo = 0;
  for (const [title, category, severity] of caseTitles) {
    const inGirls = caseNo % 3 !== 2;
    const s = r.pick(inGirls ? girls : boys);
    caseNo += 1;
    const status = r.pick(["OPEN", "IN_PROGRESS", "IN_PROGRESS", "MONITORING", "CLOSED"] as const);
    const openedAt = new Date(Date.now() - r.int(5, 30) * DAY);
    const c = await rootDb.counselingCase.create({
      data: {
        tenantId,
        branchId: s.branchId,
        number: caseNo,
        studentId: s.id,
        title,
        category,
        severity,
        status,
        counselorId: inGirls ? counselor : vpStudents,
        plan: { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "الأهداف" }] }, { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "تحسين الانتظام والمشاركة خلال أربعة أسابيع" }] }] }, { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "لقاء أسبوعي قصير مع المرشد" }] }] }] }, { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "التدخلات" }] }, { type: "paragraph", content: [{ type: "text", text: "تنسيق مع رائد الفصل ومتابعة يومية للحضور، وتواصل أسبوعي مع ولي الأمر." }] }] } as Prisma.InputJsonValue,
        openedAt,
        closedAt: status === "CLOSED" ? new Date() : null,
        guardianSummonedAt: severity === "HIGH" || severity === "CRITICAL" ? new Date(openedAt.getTime() + 3 * DAY) : null,
        createdById: counselor,
        createdAt: openedAt,
      },
    });
    const sessions = r.int(1, 3);
    for (let k = 0; k < sessions; k++) {
      const past = k < sessions - 1 || status === "CLOSED";
      await rootDb.counselingSession.create({
        data: {
          tenantId,
          caseId: c.id,
          scheduledAt: past ? new Date(openedAt.getTime() + (k + 1) * 4 * DAY + 9 * 3_600_000) : new Date(Date.now() + r.int(1, 6) * DAY + r.int(8, 12) * 3_600_000),
          durationMinutes: r.pick([20, 30, 45]),
          status: past ? "DONE" : "SCHEDULED",
          attendees: past ? "الطالب/ة والمرشد" : null,
          summary: past ? "تمت مناقشة أسباب المشكلة، واتُّفق على خطة متابعة أسبوعية." : null,
          createdById: counselor,
        },
      });
    }
  }
  await rootDb.sequence.create({ data: { tenantId, key: "case", nextValue: caseNo + 1 } });

  await seedPhase2Academic(tenantId, r);
}
