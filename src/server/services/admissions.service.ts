/**
 * القبول والتسجيل: الطلبات (من الموظف أو النموذج العام)، منع تكرار الهوية، المقاعد المتاحة،
 * وقواعد الانتقال بين المراحل. عند القبول يُنشأ ملف الطالب وأولياء الأمور تلقائياً ويُرسل خطاب القبول.
 * فاتورة رسوم التسجيل تُصدر آلياً عند بناء النظام المحاسبي (المرحلة ٣) من نقطة الربط onStudentAccepted.
 */
import type { Prisma } from "@/generated/prisma/client";
import { ADMISSION_STAGE, OPEN_ADMISSION_STAGES, composeFullName, normalizeSaudiMobile, validateIdNumber, type AdmissionStageKey } from "@/lib/students";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { idFingerprint, protectId } from "@/server/pii";
import { currentYear } from "@/server/collections/options";
import { branchWhere } from "./student-scope";
import { messageContact } from "./guardian-messages";
import { nextNumber, nextSequence } from "./sequence.service";
import { notify } from "./notifications.service";

type TenantInfo = Pick<SessionData, "tenant">;

export interface AdmissionInput {
  branchId: string;
  requestedGradeId: string;
  firstName: string;
  fatherName: string;
  grandfatherName: string;
  familyName: string;
  gender: "MALE" | "FEMALE";
  nationality: string;
  idType: "NATIONAL_ID" | "IQAMA" | "PASSPORT";
  nationalId: string;
  birthDate: Date;
  previousSchool?: string | null;
  guardianName: string;
  guardianRelation: "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER";
  guardianPhone: string;
  guardianEmail?: string | null;
  guardianNationalId?: string | null;
  motherName?: string | null;
  motherPhone?: string | null;
  address?: string | null;
  source?: string | null;
  attachments?: Array<{ id: string; name: string; url: string; size?: number; mime?: string }>;
  notes?: string | null;
}

/** المرفقات: ملفات مرفوعة فعلاً لهذه المدرسة فقط */
async function validAttachments(db: TenantDb, list: NonNullable<AdmissionInput["attachments"]>) {
  const ids = list.map((f) => f.id).filter(Boolean).slice(0, 10);
  if (!ids.length) return [];
  const files = await db.fileObject.findMany({ where: { id: { in: ids } } });
  return files.map((f) => ({ id: f.id, name: f.name, url: `/api/files/${f.id}`, size: f.size, mime: f.mime }));
}

/** المقاعد المتاحة لصف في فرع للعام الحالي */
export async function seatsFor(db: TenantDb, branchId: string, gradeId: string) {
  const year = await currentYear(db);
  if (!year) return { capacity: 0, occupied: 0, available: 0, sections: 0 };
  const sections = await db.section.findMany({ where: { branchId, gradeId, academicYearId: year.id, deletedAt: null }, select: { capacity: true } });
  const capacity = sections.reduce((a, s) => a + s.capacity, 0);
  const occupied = await db.student.count({ where: { branchId, gradeId, academicYearId: year.id, status: "ACTIVE", deletedAt: null } });
  return { capacity, occupied, available: Math.max(0, capacity - occupied), sections: sections.length };
}

/** يتحقق من عدم وجود طالب أو طلب مفتوح بنفس رقم الهوية */
export async function assertNoDuplicateId(db: TenantDb, tenantId: string, nationalId: string, exceptAdmissionId?: string) {
  const hash = idFingerprint(tenantId, nationalId);
  const [student, admission] = await Promise.all([
    db.student.findFirst({ where: { nationalIdHash: hash, deletedAt: null }, select: { fullName: true, academicNumber: true } }),
    db.admission.findFirst({
      where: { nationalIdHash: hash, deletedAt: null, stage: { in: OPEN_ADMISSION_STAGES }, ...(exceptAdmissionId ? { id: { not: exceptAdmissionId } } : {}) },
      select: { number: true },
    }),
  ]);
  if (student) throw badRequest(`رقم الهوية مسجّل مسبقاً للطالب ${student.fullName} (${student.academicNumber})`);
  if (admission) throw badRequest(`يوجد طلب قبول مفتوح بنفس رقم الهوية (رقم ${admission.number})`);
}

export async function createAdmission(db: TenantDb, tenant: TenantInfo, actorId: string | null, input: AdmissionInput, via: "STAFF" | "PUBLIC_FORM") {
  const idError = validateIdNumber(input.idType, input.nationalId);
  if (idError) throw badRequest(idError);
  const phone = normalizeSaudiMobile(input.guardianPhone);
  if (!phone) throw badRequest("رقم جوال ولي الأمر غير صالح (05xxxxxxxx)");
  if (input.guardianNationalId) {
    const gErr = validateIdNumber(/^2/.test(input.guardianNationalId) ? "IQAMA" : "NATIONAL_ID", input.guardianNationalId);
    if (gErr) throw badRequest(`هوية ولي الأمر: ${gErr}`);
  }
  const [branch, grade] = await Promise.all([
    db.branch.findFirst({ where: { id: input.branchId, deletedAt: null, isActive: true } }),
    db.grade.findFirst({ where: { id: input.requestedGradeId, deletedAt: null } }),
  ]);
  if (!branch) throw badRequest("الفرع غير متاح");
  if (!grade) throw badRequest("الصف المطلوب غير متاح");
  if (branch.gender === "BOYS" && input.gender === "FEMALE") throw badRequest("هذا الفرع للبنين");
  if (branch.gender === "GIRLS" && input.gender === "MALE") throw badRequest("هذا الفرع للبنات");
  if (input.birthDate > new Date()) throw badRequest("تاريخ الميلاد غير صالح");
  await assertNoDuplicateId(db, tenant.tenant.id, input.nationalId);
  const year = await currentYear(db);
  if (!year) throw badRequest("لا يوجد عام دراسي حالي مفتوح للقبول");

  const contacts: Array<Record<string, unknown>> = [
    {
      relation: input.guardianRelation,
      name: input.guardianName.trim(),
      phone,
      email: input.guardianEmail?.trim().toLowerCase() || null,
      ...(input.guardianNationalId ? protectId(tenant.tenant.id, input.guardianNationalId) : {}),
    },
  ];
  if (input.motherName?.trim() && input.guardianRelation !== "MOTHER") {
    contacts.push({ relation: "MOTHER", name: input.motherName.trim(), phone: input.motherPhone ? normalizeSaudiMobile(input.motherPhone) : null });
  }

  const attachments = await validAttachments(db, input.attachments ?? []);
  const number = await nextNumber(db, tenant.tenant.id, "admission");
  const fullName = composeFullName(input);
  const admission = await db.admission.create({
    data: {
      tenantId: tenant.tenant.id,
      branchId: branch.id,
      number,
      academicYearId: year.id,
      stage: "NEW",
      firstName: input.firstName.trim(),
      fatherName: input.fatherName.trim(),
      grandfatherName: input.grandfatherName.trim(),
      familyName: input.familyName.trim(),
      fullName,
      gender: input.gender,
      nationality: input.nationality,
      idType: input.idType,
      ...protectId(tenant.tenant.id, input.nationalId),
      birthDate: input.birthDate,
      requestedGradeId: grade.id,
      previousSchool: input.previousSchool?.trim() || null,
      guardianName: input.guardianName.trim(),
      guardianRelation: input.guardianRelation,
      guardianPhone: phone,
      guardianEmail: input.guardianEmail?.trim().toLowerCase() || null,
      contacts: contacts as Prisma.InputJsonValue,
      address: input.address?.trim() || null,
      attachments: attachments as Prisma.InputJsonValue,
      source: input.source ?? null,
      submittedVia: via,
      notes: input.notes ? ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: input.notes }] }] } as Prisma.InputJsonValue) : undefined,
      createdById: actorId,
      updatedById: actorId,
    },
  });

  await messageContact(tenant, { phone, email: admission.guardianEmail }, "admission_received", { student: fullName, number });
  // إشعار فريق القبول في الفرع
  const staff = await db.userRole.findMany({
    where: { role: { key: { in: ["ADMISSIONS", "VP_STUDENTS"] } }, OR: [{ branchId: branch.id }, { branchId: null }] },
    select: { userId: true },
  });
  await notify(db, {
    tenantId: tenant.tenant.id,
    userIds: staff.map((s) => s.userId),
    type: "SYSTEM",
    title: `طلب قبول جديد: ${fullName} — ${grade.name}`,
    body: via === "PUBLIC_FORM" ? "عبر نموذج التقديم العام" : undefined,
    link: `/admissions/${admission.id}`,
    actorId,
    entityType: "Admission",
    entityId: admission.id,
  });
  return admission;
}

const TERMINAL_WITH_STUDENT: AdmissionStageKey[] = ["ACCEPTED", "ENROLLED"];

/** الانتقال بين مراحل القبول مع قواعده وآثاره */
export async function changeAdmissionStage(db: TenantDb, session: SessionData, admissionId: string, next: AdmissionStageKey, reason?: string | null) {
  const scope = branchWhere(session, "admissions", "update");
  if (!scope) throw forbidden("لا تملك صلاحية تعديل طلبات القبول");
  const admission = await db.admission.findFirst({ where: { ...scope, id: admissionId, deletedAt: null }, include: { requestedGrade: true } });
  if (!admission) throw notFound("الطلب غير موجود أو خارج نطاق صلاحيتك");
  const current = admission.stage as AdmissionStageKey;
  if (current === next) return admission;
  if (!(next in ADMISSION_STAGE)) throw badRequest("مرحلة غير صالحة");

  if (admission.studentId && !TERMINAL_WITH_STUDENT.includes(next)) {
    throw badRequest("أُنشئ ملف الطالب لهذا الطلب؛ لإلغاء التسجيل استخدم «التحويلات» (انسحاب)");
  }
  if (next === "ENROLLED") {
    if (!admission.studentId) throw badRequest("يجب قبول الطلب أولاً ليُنشأ ملف الطالب");
    const student = await db.student.findFirst({ where: { id: admission.studentId }, select: { sectionId: true } });
    if (!student?.sectionId) throw badRequest("سكّن الطالب في فصل قبل نقله إلى «مسجّل»");
  }
  if (next === "ACCEPTED" && !admission.studentId) {
    const seats = await seatsFor(db, admission.branchId, admission.requestedGradeId ?? "");
    if (seats.capacity > 0 && seats.available <= 0) throw badRequest(`لا مقاعد متاحة في ${admission.requestedGrade?.name ?? "الصف"} (${seats.occupied}/${seats.capacity}). انقل الطلب إلى قائمة الانتظار`);
    await acceptAdmission(db, session, admission.id);
  }

  const decided = next === "ACCEPTED" || next === "REJECTED" || next === "WAITLIST";
  const updated = await db.admission.update({
    where: { id: admission.id },
    data: {
      stage: next,
      ...(decided ? { decisionAt: new Date(), decisionReason: reason ?? admission.decisionReason } : {}),
      updatedById: session.user.id,
    },
  });
  const vars = { student: admission.fullName, grade: admission.requestedGrade?.name ?? "" };
  if (next === "REJECTED") await messageContact(session, { phone: admission.guardianPhone, email: admission.guardianEmail }, "admission_rejected", vars);
  if (next === "WAITLIST") await messageContact(session, { phone: admission.guardianPhone, email: admission.guardianEmail }, "admission_waitlist", vars);
  return updated;
}

/** ينشئ ملف الطالب وأولياء أمره من طلب القبول (مرة واحدة) */
export async function acceptAdmission(db: TenantDb, session: SessionData, admissionId: string) {
  const admission = await db.admission.findFirstOrThrow({ where: { id: admissionId }, include: { requestedGrade: true } });
  if (admission.studentId) return admission.studentId;
  const missing: string[] = [];
  if (!admission.requestedGradeId) missing.push("الصف المطلوب");
  if (!admission.gender) missing.push("الجنس");
  if (!admission.birthDate) missing.push("تاريخ الميلاد");
  if (!admission.nationalIdHash) missing.push("رقم الهوية");
  if (!admission.fatherName || !admission.familyName) missing.push("الاسم الرباعي");
  if (!admission.guardianName || !admission.guardianPhone) missing.push("ولي الأمر وجواله");
  if (missing.length) throw badRequest(`أكمل قبل القبول: ${missing.join("، ")}`);
  const year = await currentYear(db);
  if (!year) throw badRequest("لا يوجد عام دراسي حالي");

  const existing = await db.student.findFirst({ where: { nationalIdHash: admission.nationalIdHash!, deletedAt: null }, select: { fullName: true } });
  if (existing) throw badRequest(`رقم الهوية مسجّل مسبقاً للطالب ${existing.fullName}`);

  const settings = (session.tenant.settings ?? {}) as { students?: { numberPrefix?: string; numberPadding?: number } };
  const yearPrefix = settings.students?.numberPrefix ?? String(year.startDate.getUTCFullYear());
  const seq = await nextSequence(db, session.tenant.id, `student:${yearPrefix}`, { prefix: yearPrefix, padding: settings.students?.numberPadding ?? 4 });

  const contacts = (Array.isArray(admission.contacts) ? admission.contacts : []) as Array<{ relation?: string; name?: string; phone?: string | null; email?: string | null; nationalIdHash?: string; nationalIdEnc?: string; nationalIdLast4?: string }>;
  // الطالب وأولياء الأمر وربط الطلب في معاملة واحدة
  const student = await db.$transaction(async (tx) => {
    const created = await tx.student.create({
      data: {
        tenantId: session.tenant.id,
        branchId: admission.branchId,
        academicNumber: seq.formatted,
        firstName: admission.firstName,
        fatherName: admission.fatherName,
        grandfatherName: admission.grandfatherName,
        familyName: admission.familyName,
        fullName: admission.fullName,
        gender: admission.gender!,
        nationality: admission.nationality,
        idType: admission.idType,
        nationalIdHash: admission.nationalIdHash,
        nationalIdEnc: admission.nationalIdEnc,
        nationalIdLast4: admission.nationalIdLast4,
        birthDate: admission.birthDate!,
        status: "ACTIVE",
        academicYearId: year.id,
        gradeId: admission.requestedGradeId!,
        enrollmentDate: new Date(new Date().toISOString().slice(0, 10)),
        previousSchool: admission.previousSchool,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    });
    for (const [i, c] of contacts.entries()) {
      if (!c.name || !c.phone) continue;
      const guardian = await findOrCreateGuardian(tx, session, {
        name: c.name,
        phone: c.phone,
        email: c.email ?? null,
        nationalIdHash: c.nationalIdHash ?? null,
        nationalIdEnc: c.nationalIdEnc ?? null,
        nationalIdLast4: c.nationalIdLast4 ?? null,
      });
      await tx.studentGuardian.create({
        data: { tenantId: session.tenant.id, studentId: created.id, guardianId: guardian.id, relation: (c.relation ?? "OTHER") as never, isPrimary: i === 0 },
      });
    }
    await tx.admission.update({ where: { id: admission.id }, data: { studentId: created.id, updatedById: session.user.id } });
    return created;
  });
  await onStudentAccepted(db, session, { studentId: student.id, admissionId: admission.id });
  await messageContact(session, { phone: admission.guardianPhone, email: admission.guardianEmail }, "admission_accepted", {
    student: admission.fullName,
    grade: admission.requestedGrade?.name ?? "",
    academicNumber: student.academicNumber,
  });
  return student.id;
}

/** ولي أمر موجود (بالهوية ثم بالجوال والاسم) أو جديد — لربط الأشقاء تلقائياً */
export async function findOrCreateGuardian(
  db: Pick<TenantDb, "guardian">,
  session: SessionData,
  input: { name: string; phone: string; email: string | null; nationalIdHash: string | null; nationalIdEnc: string | null; nationalIdLast4: string | null },
) {
  if (input.nationalIdHash) {
    const byId = await db.guardian.findFirst({ where: { nationalIdHash: input.nationalIdHash, deletedAt: null } });
    if (byId) return byId;
  }
  const byPhone = await db.guardian.findFirst({ where: { phone: input.phone, name: input.name, deletedAt: null } });
  if (byPhone) return byPhone;
  return db.guardian.create({
    data: {
      tenantId: session.tenant.id,
      name: input.name,
      phone: input.phone,
      email: input.email,
      nationalIdHash: input.nationalIdHash,
      nationalIdEnc: input.nationalIdEnc,
      nationalIdLast4: input.nationalIdLast4,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
}

/**
 * نقطة الربط بعد قبول الطالب: تسجيل الحادثة في التدقيق، وإصدار فاتورة رسوم التسجيل آلياً
 * (من بند «تسجيل» في جدول رسوم صفه) مع إشعار ولي الأمر.
 */
async function onStudentAccepted(db: TenantDb, session: SessionData, input: { studentId: string; admissionId: string }) {
  const { writeAudit } = await import("@/server/db/tenant");
  await writeAudit(
    { tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } },
    { action: "APPROVE", entityType: "Admission", entityId: input.admissionId, summary: "قبول الطالب وإنشاء ملفه", newValue: { studentId: input.studentId } },
  );
  const { onAdmissionAccepted } = await import("./finance/billing.service");
  await onAdmissionAccepted(db, session, input);
}

export async function admissionFunnel(db: TenantDb, session: SessionData, academicYearId?: string) {
  const scope = branchWhere(session, "admissions", "view");
  if (!scope) throw forbidden();
  const year = academicYearId ? { id: academicYearId } : await currentYear(db);
  const where = { ...scope, deletedAt: null, ...(year ? { academicYearId: year.id } : {}) };
  const [byStage, bySource, decided, all] = await Promise.all([
    db.admission.groupBy({ by: ["stage"], where, _count: { _all: true } }),
    db.admission.groupBy({ by: ["source"], where, _count: { _all: true } }),
    db.admission.findMany({ where: { ...where, decisionAt: { not: null } }, select: { createdAt: true, decisionAt: true, stage: true } }),
    db.admission.count({ where }),
  ]);
  const stageCount = Object.fromEntries(byStage.map((s) => [s.stage, s._count._all])) as Partial<Record<AdmissionStageKey, number>>;
  const accepted = (stageCount.ACCEPTED ?? 0) + (stageCount.ENROLLED ?? 0);
  const rejected = stageCount.REJECTED ?? 0;
  const avgDays = decided.length ? decided.reduce((a, d) => a + (d.decisionAt!.getTime() - d.createdAt.getTime()) / 86_400_000, 0) / decided.length : null;
  // القمع: كل طلب مرّ بالمراحل السابقة لمرحلته الحالية
  const reached = (stages: AdmissionStageKey[]) => stages.reduce((a, s) => a + (stageCount[s] ?? 0), 0);
  return {
    total: all,
    stageCount,
    funnel: [
      { key: "NEW", label: "طلبات مستلمة", count: all },
      { key: "REVIEW", label: "رُوجعت", count: reached(["REVIEW", "ASSESSMENT", "ACCEPTED", "WAITLIST", "REJECTED", "ENROLLED"]) },
      { key: "ASSESSMENT", label: "اختبار/مقابلة", count: reached(["ASSESSMENT", "ACCEPTED", "WAITLIST", "ENROLLED"]) },
      { key: "ACCEPTED", label: "قُبلت", count: accepted },
      { key: "ENROLLED", label: "سُجّلت", count: stageCount.ENROLLED ?? 0 },
    ],
    sources: bySource.map((s) => ({ source: s.source ?? "other", count: s._count._all })).sort((a, b) => b.count - a.count),
    acceptanceRate: accepted + rejected ? accepted / (accepted + rejected) : null,
    avgProcessingDays: avgDays,
  };
}

// ---------------------------------------------------------------------
// تفاصيل الطلب وتعديله
// ---------------------------------------------------------------------

export async function getAdmission(db: TenantDb, session: SessionData, id: string) {
  const scope = branchWhere(session, "admissions", "view");
  if (!scope) throw forbidden();
  const a = await db.admission.findFirst({
    where: { ...scope, id, deletedAt: null },
    include: { requestedGrade: { include: { stage: true } }, branch: true, academicYear: true, student: { select: { id: true, fullName: true, academicNumber: true, sectionId: true } } },
  });
  if (!a) throw notFound("الطلب غير موجود أو خارج نطاق صلاحيتك");
  const contacts = (Array.isArray(a.contacts) ? a.contacts : []) as Array<Record<string, unknown>>;
  const { maskId } = await import("@/server/pii");
  const { can } = await import("@/lib/rbac/access");
  const owner = a.ownerId ? await db.user.findFirst({ where: { id: a.ownerId }, select: { id: true, name: true, avatarColor: true } }) : null;
  return {
    id: a.id,
    number: a.number,
    stage: a.stage as AdmissionStageKey,
    names: { firstName: a.firstName, fatherName: a.fatherName, grandfatherName: a.grandfatherName, familyName: a.familyName },
    fullName: a.fullName,
    gender: a.gender,
    nationality: a.nationality,
    idType: a.idType,
    nationalIdMasked: maskId(a.nationalIdLast4),
    birthDate: a.birthDate,
    branch: { id: a.branch.id, name: a.branch.name },
    academicYear: { id: a.academicYear.id, name: a.academicYear.name },
    requestedGrade: a.requestedGrade ? { id: a.requestedGrade.id, name: a.requestedGrade.name, stage: a.requestedGrade.stage.name } : null,
    previousSchool: a.previousSchool,
    guardian: { name: a.guardianName, relation: a.guardianRelation, phone: a.guardianPhone, email: a.guardianEmail },
    contacts: contacts.map((c) => ({ relation: String(c.relation ?? "OTHER"), name: String(c.name ?? ""), phone: (c.phone as string | null) ?? null, email: (c.email as string | null) ?? null, nationalIdMasked: maskId(c.nationalIdLast4 as string | undefined) })),
    address: a.address,
    attachments: (Array.isArray(a.attachments) ? a.attachments : []) as Array<{ id: string; name: string; url: string; size?: number; mime?: string }>,
    source: a.source,
    owner,
    assessmentAt: a.assessmentAt,
    assessmentScore: a.assessmentScore,
    assessmentNotes: a.assessmentNotes,
    decisionAt: a.decisionAt,
    decisionReason: a.decisionReason,
    submittedVia: a.submittedVia,
    student: a.student,
    notes: a.notes,
    seats: a.requestedGradeId ? await seatsFor(db, a.branchId, a.requestedGradeId) : null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    permissions: { canEdit: can(session.access, "admissions", "update"), canDelete: can(session.access, "admissions", "delete") && !a.studentId },
  };
}

export interface AdmissionPatch {
  firstName?: string;
  fatherName?: string;
  grandfatherName?: string;
  familyName?: string;
  gender?: "MALE" | "FEMALE" | null;
  nationality?: string;
  idType?: "NATIONAL_ID" | "IQAMA" | "PASSPORT";
  nationalId?: string;
  birthDate?: Date | null;
  requestedGradeId?: string | null;
  previousSchool?: string | null;
  guardianName?: string | null;
  guardianRelation?: "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER" | null;
  guardianPhone?: string | null;
  guardianEmail?: string | null;
  address?: string | null;
  source?: string | null;
  ownerId?: string | null;
  assessmentAt?: Date | null;
  assessmentScore?: number | null;
  assessmentNotes?: string | null;
  attachments?: Array<{ id: string; name: string; url: string; size?: number; mime?: string }>;
  notes?: unknown;
}

export async function updateAdmission(db: TenantDb, session: SessionData, id: string, patch: AdmissionPatch) {
  const scope = branchWhere(session, "admissions", "update");
  if (!scope) throw forbidden("لا تملك صلاحية تعديل طلبات القبول");
  const a = await db.admission.findFirst({ where: { ...scope, id, deletedAt: null } });
  if (!a) throw notFound("الطلب غير موجود أو خارج نطاق صلاحيتك");
  const identity = ["firstName", "fatherName", "grandfatherName", "familyName", "gender", "nationalId", "birthDate", "requestedGradeId"] as const;
  if (a.studentId && identity.some((k) => patch[k] !== undefined)) throw badRequest("أُنشئ ملف الطالب؛ عدّل بياناته الأساسية من ملف الطالب");
  const data: Prisma.AdmissionUncheckedUpdateInput = { updatedById: session.user.id };
  const names = { firstName: patch.firstName ?? a.firstName, fatherName: patch.fatherName ?? a.fatherName, grandfatherName: patch.grandfatherName ?? a.grandfatherName, familyName: patch.familyName ?? a.familyName };
  if (identity.slice(0, 4).some((k) => patch[k] !== undefined)) {
    if (!names.firstName.trim()) throw badRequest("الاسم الأول مطلوب");
    Object.assign(data, names, { fullName: composeFullName(names) });
  }
  if (patch.nationalId !== undefined) {
    const type = patch.idType ?? a.idType;
    const err = validateIdNumber(type, patch.nationalId);
    if (err) throw badRequest(err);
    await assertNoDuplicateId(db, session.tenant.id, patch.nationalId, id);
    Object.assign(data, protectId(session.tenant.id, patch.nationalId), { idType: type });
  }
  if (patch.guardianPhone !== undefined && patch.guardianPhone !== null) {
    const p = normalizeSaudiMobile(patch.guardianPhone);
    if (!p) throw badRequest("رقم الجوال غير صالح");
    data.guardianPhone = p;
  }
  if (patch.attachments) data.attachments = (await validAttachments(db, patch.attachments)) as Prisma.InputJsonValue;
  if (patch.notes !== undefined) data.notes = patch.notes as Prisma.InputJsonValue;
  for (const key of ["gender", "nationality", "birthDate", "requestedGradeId", "previousSchool", "guardianName", "guardianRelation", "guardianEmail", "address", "source", "ownerId", "assessmentAt", "assessmentScore", "assessmentNotes"] as const) {
    if (patch[key] !== undefined) (data as Record<string, unknown>)[key] = patch[key];
  }
  await db.admission.update({ where: { id }, data });
  if (patch.ownerId && patch.ownerId !== a.ownerId) {
    await notify(db, { tenantId: session.tenant.id, userIds: [patch.ownerId], type: "ASSIGNMENT", title: `أُسند إليك متابعة طلب قبول ${a.fullName}`, link: `/admissions/${id}`, actorId: session.user.id, entityType: "Admission", entityId: id });
  }
  return { ok: true };
}

/** خيارات نموذج التقديم (للموظف وللنموذج العام) */
export async function admissionFormOptions(db: TenantDb) {
  const [branches, grades] = await Promise.all([
    db.branch.findMany({ where: { deletedAt: null, isActive: true }, orderBy: { code: "asc" }, select: { id: true, name: true, gender: true } }),
    db.grade.findMany({ where: { deletedAt: null }, include: { stage: { select: { name: true, order: true } } }, orderBy: [{ stage: { order: "asc" } }, { order: "asc" }] }),
  ]);
  return { branches, grades: grades.map((g) => ({ id: g.id, name: g.name, stage: g.stage.name })) };
}

/** مؤشرات لوحة القبول */
export async function admissionsOverview(db: TenantDb, session: SessionData) {
  const scope = branchWhere(session, "admissions", "view");
  if (!scope) throw forbidden();
  const year = await currentYear(db);
  const where = { ...scope, deletedAt: null, ...(year ? { academicYearId: year.id } : {}) };
  const weekAhead = new Date(Date.now() + 7 * 86_400_000);
  const [open, interviews, accepted, waitlist, publicForm, funnel] = await Promise.all([
    db.admission.count({ where: { ...where, stage: { in: ["NEW", "REVIEW", "ASSESSMENT"] } } }),
    db.admission.count({ where: { ...where, assessmentAt: { gte: new Date(), lte: weekAhead } } }),
    db.admission.count({ where: { ...where, stage: { in: ["ACCEPTED", "ENROLLED"] } } }),
    db.admission.count({ where: { ...where, stage: "WAITLIST" } }),
    db.admission.count({ where: { ...where, submittedVia: "PUBLIC_FORM", stage: "NEW" } }),
    admissionFunnel(db, session),
  ]);
  return { open, interviewsThisWeek: interviews, accepted, waitlist, newFromPublicForm: publicForm, acceptanceRate: funnel.acceptanceRate, tenantSlug: session.tenant.slug };
}
