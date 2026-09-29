/**
 * إدخال الدرجات ومسار اعتمادها: كشف (فصل × مادة × فصل دراسي) ببنود تقييم ودرجاتها،
 * المعلم يرصد ويرسل ← رئيس القسم يراجع ← الوكيل يعتمد فتُقفل (تفرضه قاعدة البيانات).
 * أي تعديل بعد الاعتماد بطلب تعديل وموافقة المدير، ويُسجَّل في التدقيق بالقيمة القديمة والجديدة.
 */
import { componentBp, subjectResult, tenthsToString } from "@/lib/assessment/calc";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { writeAudit } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { createApprovalRequest, type ApprovalHookEvent } from "@/server/services/approval.service";
import { notify } from "@/server/services/notifications.service";
import { nextNumber } from "@/server/services/sequence.service";
import { assertComponent, gradeScope, inScope, requireSheet, requireTerm, schemeFor, sheetPermissions } from "./common";

type Status = "DRAFT" | "SUBMITTED" | "REVIEWED" | "APPROVED";

async function sectionStudents(db: TenantDb, sectionId: string) {
  return db.student.findMany({ where: { sectionId, status: "ACTIVE", deletedAt: null }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, academicNumber: true, photoUrl: true } });
}

/** كشف الدرجات: البنود ودرجاتها ونتيجة المادة لكل طالب */
export async function gradeBook(db: TenantDb, session: SessionData, input: { sectionId: string; subjectId: string; termId: string }) {
  const { section, subject, perms } = await requireSheet(db, session, input.sectionId, input.subjectId);
  const term = await requireTerm(db, input.termId);
  const scheme = await schemeFor(db, session.tenant.id, section.grade.stageId);
  const [students, assessments, assignment] = await Promise.all([
    sectionStudents(db, section.id),
    db.assessment.findMany({ where: { sectionId: section.id, subjectId: subject.id, termId: term.id }, include: { marks: true }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    db.teacherAssignment.findFirst({ where: { sectionId: section.id, subjectId: subject.id }, select: { teacherId: true } }),
  ]);
  const teacher = assignment ? await db.user.findFirst({ where: { id: assignment.teacherId }, select: { id: true, name: true } }) : null;
  const rows = students.map((st) => {
    const byComponent: Record<string, number | null> = {};
    for (const c of scheme.components) {
      const items = assessments
        .filter((a) => a.componentKey === c.key)
        .map((a) => {
          const m = a.marks.find((x) => x.studentId === st.id);
          return { maxTenths: a.maxTenths, scoreTenths: m?.scoreTenths ?? null, absent: m?.absent ?? false, excused: m?.excused ?? false };
        });
      byComponent[c.key] = componentBp(items);
    }
    return { student: st, result: subjectResult(scheme.components, byComponent) };
  });
  return {
    section: { id: section.id, name: section.name, grade: section.grade.name, branch: section.branch.name, branchId: section.branchId },
    subject: { id: subject.id, name: subject.name, color: subject.color },
    term: { id: term.id, name: term.name, year: term.academicYear.name, startDate: term.startDate, endDate: term.endDate },
    teacher,
    scheme: { components: scheme.components, passBp: scheme.passBp, bands: scheme.bands },
    permissions: perms,
    students,
    assessments: assessments.map((a) => ({
      id: a.id,
      title: a.title,
      componentKey: a.componentKey,
      maxTenths: a.maxTenths,
      date: a.date,
      status: a.status as Status,
      returnNote: a.returnNote,
      examSessionId: a.examSessionId,
      marks: Object.fromEntries(a.marks.map((m) => [m.studentId, { scoreTenths: m.scoreTenths, absent: m.absent, excused: m.excused, note: m.note }])),
    })),
    results: Object.fromEntries(rows.map((r) => [r.student.id, r.result])),
  };
}

/** قائمة كشوف المستخدم في فصل دراسي مع حالة الرصد والاعتماد */
export async function mySheets(db: TenantDb, session: SessionData, termId: string) {
  const scope = await gradeScope(db, session, "view");
  if (!scope) throw forbidden("ليس لديك صلاحية على الدرجات");
  const term = await requireTerm(db, termId);
  const assignments = await db.teacherAssignment.findMany({ where: { academicYearId: term.academicYearId }, include: { section: { include: { grade: { select: { name: true, order: true, stage: { select: { order: true } } } }, branch: { select: { name: true } } } } } });
  const visible = assignments.filter((a) => a.section.deletedAt === null && inScope(scope, a.section, a.subjectId));
  const [subjects, teachers, assessments, counts] = await Promise.all([
    db.subject.findMany({ where: { id: { in: [...new Set(visible.map((v) => v.subjectId))] } }, select: { id: true, name: true, color: true } }),
    db.user.findMany({ where: { id: { in: [...new Set(visible.map((v) => v.teacherId))] } }, select: { id: true, name: true } }),
    db.assessment.findMany({ where: { termId, sectionId: { in: visible.map((v) => v.sectionId) } }, select: { sectionId: true, subjectId: true, status: true, _count: { select: { marks: true } } } }),
    db.student.groupBy({ by: ["sectionId"], where: { sectionId: { in: visible.map((v) => v.sectionId) }, status: "ACTIVE", deletedAt: null }, _count: { _all: true } }),
  ]);
  return visible
    .sort((a, b) => a.section.grade.stage.order - b.section.grade.stage.order || a.section.grade.order - b.section.grade.order || a.section.name.localeCompare(b.section.name))
    .map((a) => {
      const items = assessments.filter((x) => x.sectionId === a.sectionId && x.subjectId === a.subjectId);
      const studentsCount = counts.find((c) => c.sectionId === a.sectionId)?._count._all ?? 0;
      const expected = items.length * studentsCount;
      const entered = items.reduce((s, x) => s + x._count.marks, 0);
      return {
        sectionId: a.sectionId,
        section: `${a.section.grade.name} / ${a.section.name}`,
        branch: a.section.branch.name,
        subject: subjects.find((s) => s.id === a.subjectId)!,
        teacher: teachers.find((t) => t.id === a.teacherId)?.name ?? null,
        mine: a.teacherId === session.user.id,
        assessments: items.length,
        byStatus: { DRAFT: items.filter((x) => x.status === "DRAFT").length, SUBMITTED: items.filter((x) => x.status === "SUBMITTED").length, REVIEWED: items.filter((x) => x.status === "REVIEWED").length, APPROVED: items.filter((x) => x.status === "APPROVED").length },
        completionBp: expected ? Math.min(10000, Math.floor((entered * 10000) / expected)) : 0,
      };
    });
}

/** ما ينتظر قراري: بنود مرسلة لمراجعتي (رئيس قسم) أو اعتمادي (وكيل) */
export async function pendingForMe(db: TenantDb, session: SessionData) {
  const approve = await gradeScope(db, session, "approve");
  const heads = (await gradeScope(db, session, "view"))?.headSubjects ?? new Set<string>();
  const where = [];
  if (heads.size) where.push({ status: "SUBMITTED" as const, subjectId: { in: [...heads] } });
  if (approve) where.push({ status: { in: ["SUBMITTED", "REVIEWED"] as Status[] } });
  if (!where.length) return [];
  const items = await db.assessment.findMany({ where: { OR: where }, orderBy: { submittedAt: "asc" }, take: 200 });
  const sections = await db.section.findMany({ where: { id: { in: [...new Set(items.map((i) => i.sectionId))] } }, include: { grade: { select: { name: true } } } });
  const subjects = await db.subject.findMany({ where: { id: { in: [...new Set(items.map((i) => i.subjectId))] } }, select: { id: true, name: true } });
  const settingsHeads = (await import("./common")).assessmentSettings(session).subjectHeads;
  return items
    .filter((i) => {
      const s = sections.find((x) => x.id === i.sectionId)!;
      const canApprove = approve && (approve.all || approve.branchIds.includes(s.branchId));
      const hasHead = Boolean(settingsHeads[i.subjectId]);
      if (i.status === "SUBMITTED") return heads.has(i.subjectId) || (canApprove && !hasHead);
      return Boolean(canApprove);
    })
    .map((i) => {
      const s = sections.find((x) => x.id === i.sectionId)!;
      return { id: i.id, title: i.title, status: i.status as Status, termId: i.termId, sectionId: i.sectionId, subjectId: i.subjectId, section: `${s.grade.name} / ${s.name}`, subject: subjects.find((x) => x.id === i.subjectId)?.name ?? "", submittedAt: i.submittedAt };
    });
}

// ---------------------------------------------------------------------
// البنود
// ---------------------------------------------------------------------

export async function createAssessment(db: TenantDb, session: SessionData, input: { sectionId: string; subjectId: string; termId: string; componentKey: string; title: string; maxTenths: number; date?: string | null }) {
  const { section, perms } = await requireSheet(db, session, input.sectionId, input.subjectId);
  if (!perms.canEdit) throw forbidden("رصد الدرجات لمعلم المادة أو الوكيل");
  await requireTerm(db, input.termId);
  const scheme = await schemeFor(db, session.tenant.id, section.grade.stageId);
  assertComponent(scheme, input.componentKey);
  if (!Number.isSafeInteger(input.maxTenths) || input.maxTenths <= 0 || input.maxTenths > 10000) throw badRequest("الدرجة العظمى غير صالحة");
  return db.assessment.create({
    data: { tenantId: session.tenant.id, termId: input.termId, sectionId: section.id, subjectId: input.subjectId, teacherId: session.user.id, componentKey: input.componentKey, title: input.title.trim(), maxTenths: input.maxTenths, date: input.date ? new Date(`${input.date}T00:00:00Z`) : null, createdById: session.user.id, updatedById: session.user.id },
  });
}

async function loadEditable(db: TenantDb, session: SessionData, id: string) {
  const a = await db.assessment.findFirst({ where: { id } });
  if (!a) throw notFound("البند غير موجود");
  const { perms } = await requireSheet(db, session, a.sectionId, a.subjectId);
  return { a, perms };
}

export async function updateAssessment(db: TenantDb, session: SessionData, id: string, patch: { title?: string; maxTenths?: number; date?: string | null; componentKey?: string }) {
  const { a, perms } = await loadEditable(db, session, id);
  if (!perms.canEdit) throw forbidden();
  if (a.status !== "DRAFT") throw badRequest("البند مرسل أو معتمد؛ لا يُعدَّل");
  if (patch.maxTenths !== undefined) {
    const over = await db.mark.count({ where: { assessmentId: id, scoreTenths: { gt: patch.maxTenths } } });
    if (over) throw badRequest(`${over} درجة أعلى من العظمى الجديدة`);
  }
  return db.assessment.update({ where: { id }, data: { ...(patch.title ? { title: patch.title.trim() } : {}), ...(patch.maxTenths ? { maxTenths: patch.maxTenths } : {}), ...(patch.componentKey ? { componentKey: patch.componentKey } : {}), ...(patch.date !== undefined ? { date: patch.date ? new Date(`${patch.date}T00:00:00Z`) : null } : {}), updatedById: session.user.id } });
}

export async function deleteAssessment(db: TenantDb, session: SessionData, id: string) {
  const { a, perms } = await loadEditable(db, session, id);
  if (!perms.canEdit) throw forbidden();
  if (a.status !== "DRAFT") throw badRequest("لا يُحذف بند مرسل أو معتمد");
  await db.assessment.delete({ where: { id } });
  return { ok: true };
}

/** حفظ درجات بند (مسودة فقط)، مع التحقق من الحد الأعلى */
export async function saveMarks(db: TenantDb, session: SessionData, input: { assessmentId: string; marks: Array<{ studentId: string; scoreTenths: number | null; absent: boolean; excused: boolean; note?: string | null }> }) {
  const { a, perms } = await loadEditable(db, session, input.assessmentId);
  if (!perms.canEdit) throw forbidden("رصد الدرجات لمعلم المادة أو الوكيل");
  if (a.status !== "DRAFT") throw badRequest(a.status === "APPROVED" ? "الدرجات معتمدة؛ قدّم طلب تعديل" : "البند مرسل للاعتماد؛ لا يُعدَّل إلا إذا أُعيد");
  const allowed = new Set((await sectionStudents(db, a.sectionId)).map((s) => s.id));
  for (const m of input.marks) {
    if (!allowed.has(m.studentId)) throw badRequest("طالب ليس في هذا الفصل");
    if (m.scoreTenths !== null && (!Number.isSafeInteger(m.scoreTenths) || m.scoreTenths < 0 || m.scoreTenths > a.maxTenths)) throw badRequest(`الدرجة يجب أن تكون بين ٠ و${tenthsToString(a.maxTenths)}`);
  }
  await db.$transaction(async (tx) => {
    for (const m of input.marks) {
      const data = { scoreTenths: m.absent || m.excused ? null : m.scoreTenths, absent: m.absent, excused: m.excused, note: m.note ?? null, updatedById: session.user.id };
      await tx.mark.upsert({ where: { assessmentId_studentId: { assessmentId: a.id, studentId: m.studentId } }, create: { tenantId: session.tenant.id, assessmentId: a.id, studentId: m.studentId, ...data }, update: data });
    }
  });
  return { saved: input.marks.length };
}

// ---------------------------------------------------------------------
// مسار الاعتماد
// ---------------------------------------------------------------------

export async function transition(db: TenantDb, session: SessionData, input: { ids: string[]; action: "SUBMIT" | "REVIEW" | "APPROVE" | "RETURN"; note?: string | null }) {
  if (!input.ids.length) throw badRequest("لم تُحدد بنود");
  const items = await db.assessment.findMany({ where: { id: { in: input.ids } } });
  if (items.length !== input.ids.length) throw notFound("بند غير موجود");
  const now = new Date();
  const done: string[] = [];
  for (const a of items) {
    const { perms } = await requireSheet(db, session, a.sectionId, a.subjectId);
    if (input.action === "SUBMIT") {
      if (!perms.canEdit) throw forbidden("الإرسال لمعلم المادة");
      if (a.status !== "DRAFT") continue;
      const students = await sectionStudents(db, a.sectionId);
      const marks = await db.mark.findMany({ where: { assessmentId: a.id } });
      const missing = students.filter((s) => !marks.some((m) => m.studentId === s.id && (m.scoreTenths !== null || m.absent || m.excused))).length;
      if (missing) throw badRequest(`«${a.title}»: ${missing} طالباً بلا درجة أو غياب`);
      await db.assessment.update({ where: { id: a.id }, data: { status: "SUBMITTED", submittedAt: now, submittedById: session.user.id, returnNote: null } });
      const reviewers = perms.headUserId ? [perms.headUserId] : [];
      if (reviewers.length) await notify(db, { tenantId: session.tenant.id, userIds: reviewers, type: "APPROVAL", title: `درجات بانتظار مراجعتك: ${a.title}`, body: "أرسل المعلم الدرجات لمراجعة رئيس القسم", link: `/assessment/grades/${a.sectionId}/${a.subjectId}?term=${a.termId}`, actorId: session.user.id, entityType: "Assessment", entityId: a.id });
    } else if (input.action === "REVIEW") {
      if (!perms.canReview) throw forbidden("المراجعة لرئيس القسم أو الوكيل");
      if (a.status !== "SUBMITTED") continue;
      await db.assessment.update({ where: { id: a.id }, data: { status: "REVIEWED", reviewedAt: now, reviewedById: session.user.id } });
    } else if (input.action === "APPROVE") {
      if (!perms.canApprove) throw forbidden("الاعتماد لوكيل الشؤون الأكاديمية أو المدير");
      if (a.status === "SUBMITTED" && perms.headUserId && perms.headUserId !== session.user.id) throw badRequest(`«${a.title}» لم يراجعها رئيس القسم بعد`);
      if (a.status !== "SUBMITTED" && a.status !== "REVIEWED") continue;
      await db.assessment.update({ where: { id: a.id }, data: { status: "APPROVED", approvedAt: now, approvedById: session.user.id, ...(a.status === "SUBMITTED" ? { reviewedAt: now, reviewedById: session.user.id } : {}) } });
      if (a.teacherId) await notify(db, { tenantId: session.tenant.id, userIds: [a.teacherId], type: "SYSTEM", title: `اعتُمدت درجات «${a.title}»`, body: "الدرجات مقفلة الآن؛ أي تعديل بطلب وموافقة", link: `/assessment/grades/${a.sectionId}/${a.subjectId}?term=${a.termId}`, actorId: session.user.id, entityType: "Assessment", entityId: a.id });
    } else {
      if (!perms.canReview) throw forbidden();
      if (a.status !== "SUBMITTED" && a.status !== "REVIEWED") continue;
      if (!input.note?.trim()) throw badRequest("اذكر سبب الإعادة للمعلم");
      await db.assessment.update({ where: { id: a.id }, data: { status: "DRAFT", returnNote: input.note.trim(), reviewedAt: null, reviewedById: null } });
      if (a.teacherId) await notify(db, { tenantId: session.tenant.id, userIds: [a.teacherId], type: "SYSTEM", title: `أُعيدت درجات «${a.title}» للتعديل`, body: input.note.trim(), link: `/assessment/grades/${a.sectionId}/${a.subjectId}?term=${a.termId}`, actorId: session.user.id, entityType: "Assessment", entityId: a.id });
    }
    done.push(a.id);
  }
  return { updated: done.length };
}

// ---------------------------------------------------------------------
// طلبات تعديل الدرجة بعد الاعتماد
// ---------------------------------------------------------------------

export async function requestChange(db: TenantDb, session: SessionData, input: { assessmentId: string; studentId: string; newTenths: number | null; newAbsent: boolean; reason: string }) {
  const a = await db.assessment.findFirst({ where: { id: input.assessmentId } });
  if (!a) throw notFound("البند غير موجود");
  const { perms, section } = await requireSheet(db, session, a.sectionId, a.subjectId);
  if (!perms.canEdit && !perms.canApprove) throw forbidden("طلب التعديل لمعلم المادة أو الوكيل");
  if (a.status !== "APPROVED") throw badRequest("البند غير معتمد؛ عدّل الدرجة مباشرة");
  if (input.newTenths !== null && (input.newTenths < 0 || input.newTenths > a.maxTenths)) throw badRequest("الدرجة خارج حدود البند");
  if (await db.gradeChangeRequest.findFirst({ where: { assessmentId: a.id, studentId: input.studentId, status: "PENDING" } })) throw badRequest("يوجد طلب تعديل معلق لهذه الدرجة");
  const mark = await db.mark.findFirst({ where: { assessmentId: a.id, studentId: input.studentId } });
  const student = await db.student.findFirst({ where: { id: input.studentId, sectionId: section.id }, select: { fullName: true } });
  if (!student) throw badRequest("طالب ليس في هذا الفصل");
  const req = await db.gradeChangeRequest.create({
    data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "grade-change"), assessmentId: a.id, studentId: input.studentId, oldTenths: mark?.scoreTenths ?? null, oldAbsent: mark?.absent ?? false, newTenths: input.newAbsent ? null : input.newTenths, newAbsent: input.newAbsent, reason: input.reason.trim(), requestedById: session.user.id },
  });
  const principal = session.roleKeys.includes("PRINCIPAL");
  const fmt = (t: number | null, abs: boolean) => (abs ? "غائب" : t === null ? "—" : tenthsToString(t));
  const approval = await createApprovalRequest(db, session, {
    type: "grade_change",
    title: `تعديل درجة ${student.fullName} في «${a.title}»: ${fmt(req.oldTenths, req.oldAbsent)} ← ${fmt(req.newTenths, req.newAbsent)}`,
    description: req.reason,
    entityType: "GradeChangeRequest",
    entityId: req.id,
    link: `/assessment/grades/${a.sectionId}/${a.subjectId}?term=${a.termId}`,
    steps: [{ name: principal ? "اعتماد وكيل الشؤون الأكاديمية" : "اعتماد مدير المدرسة", approverRoleKey: principal ? "VP_ACADEMIC" : "PRINCIPAL" }],
  });
  return db.gradeChangeRequest.update({ where: { id: req.id }, data: { approvalRequestId: approval.id } });
}

/** قرار الموافقة على طلب التعديل: التطبيق في معاملة تسمح بتجاوز القفل، مع تدقيق بالقيمتين */
export async function onGradeChangeApproval(db: TenantDb, session: SessionData, request: { entityId: string | null }, event: ApprovalHookEvent) {
  if (!request.entityId || !event.final) return;
  const req = await db.gradeChangeRequest.findFirst({ where: { id: request.entityId, status: "PENDING" } });
  if (!req) return;
  if (event.decision === "REJECTED") {
    await db.gradeChangeRequest.update({ where: { id: req.id }, data: { status: "REJECTED" } });
    return;
  }
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT set_config('manassa.allow_mark_change', 'on', true)");
    const data = { scoreTenths: req.newTenths, absent: req.newAbsent, excused: false, updatedById: session.user.id };
    await tx.mark.upsert({ where: { assessmentId_studentId: { assessmentId: req.assessmentId, studentId: req.studentId } }, create: { tenantId: req.tenantId, assessmentId: req.assessmentId, studentId: req.studentId, ...data }, update: data });
    await tx.gradeChangeRequest.update({ where: { id: req.id }, data: { status: "APPLIED", appliedAt: new Date() } });
  });
  await writeAudit(
    { tenantId: req.tenantId, actor: { id: session.user.id, name: session.user.name } },
    { action: "OVERRIDE", entityType: "Mark", entityId: `${req.assessmentId}:${req.studentId}`, summary: `تعديل درجة معتمدة بطلب رقم ${req.number}: ${req.reason}`, oldValue: { scoreTenths: req.oldTenths, absent: req.oldAbsent }, newValue: { scoreTenths: req.newTenths, absent: req.newAbsent } },
  );
}

export async function listChangeRequests(db: TenantDb, session: SessionData, input: { sectionId: string; subjectId: string; termId: string }) {
  await requireSheet(db, session, input.sectionId, input.subjectId);
  const rows = await db.gradeChangeRequest.findMany({ where: { assessment: { sectionId: input.sectionId, subjectId: input.subjectId, termId: input.termId } }, orderBy: { createdAt: "desc" }, include: { assessment: { select: { title: true } } } });
  const [students, users] = await Promise.all([
    db.student.findMany({ where: { id: { in: rows.map((r) => r.studentId) } }, select: { id: true, fullName: true } }),
    db.user.findMany({ where: { id: { in: rows.map((r) => r.requestedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
  ]);
  return rows.map((r) => ({ ...r, student: students.find((s) => s.id === r.studentId)?.fullName ?? "", requestedBy: users.find((u) => u.id === r.requestedById)?.name ?? null }));
}

export { sheetPermissions };
