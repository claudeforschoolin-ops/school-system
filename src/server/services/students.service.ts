/**
 * ملفات الطلاب: الملف الكامل بتبويباته، أولياء الأمور والأشقاء، المستندات، والبيانات الصحية.
 * رقم الهوية مشفّر ولا يُكشف إلا بصلاحية التعديل مع قيد تدقيق.
 */
import type { Prisma } from "@/generated/prisma/client";
import { DOCUMENT_TYPES, composeFullName, normalizeSaudiMobile, validateIdNumber } from "@/lib/students";
import { can } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import { writeAudit, type TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { idFingerprint, maskId, protectId, revealId } from "@/server/pii";
import { currentYear } from "@/server/collections/options";
import { assertSectionFits, requiredDocumentTypes } from "@/server/collections/students";
import { findOrCreateGuardian } from "./admissions.service";
import { nextSequence } from "./sequence.service";
import { requireStudentWhere } from "./student-scope";

const json = (v: unknown) => v as Prisma.InputJsonValue;

async function scopedStudent(db: TenantDb, session: SessionData, id: string, action: "view" | "update" | "delete" = "view") {
  const where = await requireStudentWhere(db, session, "students", action, action === "view" ? undefined : "لا تملك صلاحية تعديل ملف هذا الطالب");
  const student = await db.student.findFirst({ where: { ...where, id, deletedAt: null } });
  if (!student) throw notFound("الطالب غير موجود أو خارج نطاق صلاحيتك");
  return student;
}

export async function getStudentProfile(db: TenantDb, session: SessionData, id: string) {
  await scopedStudent(db, session, id, "view");
  const student = await db.student.findFirstOrThrow({
    where: { id },
    include: {
      branch: { select: { id: true, name: true } },
      grade: { select: { id: true, name: true, stage: { select: { id: true, name: true } } } },
      section: { select: { id: true, name: true, capacity: true, homeroomUserId: true, room: true } },
      academicYear: { select: { id: true, name: true } },
      guardians: { include: { guardian: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
      documents: { where: { deletedAt: null }, orderBy: { createdAt: "desc" } },
      admission: { select: { id: true, number: true, submittedVia: true, createdAt: true } },
    },
  });
  const guardianIds = student.guardians.map((g) => g.guardianId);
  const siblingLinks = guardianIds.length
    ? await db.studentGuardian.findMany({
        where: { guardianId: { in: guardianIds }, studentId: { not: id }, student: { deletedAt: null } },
        include: { student: { select: { id: true, fullName: true, academicNumber: true, status: true, photoUrl: true, grade: { select: { name: true } } } } },
      })
    : [];
  const siblings = [...new Map(siblingLinks.map((l) => [l.student.id, l.student])).values()];
  const homeroom = student.section?.homeroomUserId ? await db.user.findFirst({ where: { id: student.section.homeroomUserId }, select: { id: true, name: true } }) : null;
  const required = await requiredDocumentTypes({ db, session });
  const have = new Set(student.documents.map((d) => d.type));
  const canEdit = can(session.access, "students", "update");

  return {
    id: student.id,
    academicNumber: student.academicNumber,
    names: { firstName: student.firstName, fatherName: student.fatherName, grandfatherName: student.grandfatherName, familyName: student.familyName },
    fullName: student.fullName,
    gender: student.gender,
    nationality: student.nationality,
    idType: student.idType,
    nationalIdMasked: maskId(student.nationalIdLast4),
    birthDate: student.birthDate,
    birthPlace: student.birthPlace,
    photoUrl: student.photoUrl,
    cover: student.cover,
    status: student.status,
    branch: student.branch,
    grade: student.grade,
    section: student.section ? { ...student.section, homeroom } : null,
    academicYear: student.academicYear,
    enrollmentDate: student.enrollmentDate,
    previousSchool: student.previousSchool,
    health: {
      bloodType: student.bloodType,
      chronicConditions: student.chronicConditions,
      allergies: student.allergies,
      medications: student.medications,
      criticalHealth: student.criticalHealth,
      healthNotes: student.healthNotes,
    },
    logistics: { transportMode: student.transportMode, busNumber: student.busNumber, mealPlan: student.mealPlan },
    emergencyContacts: (Array.isArray(student.emergencyContacts) ? student.emergencyContacts : []) as Array<{ name: string; relation: string; phone: string }>,
    notes: student.notes,
    guardians: student.guardians.map((g) => ({
      linkId: g.id,
      relation: g.relation,
      isPrimary: g.isPrimary,
      canPickup: g.canPickup,
      receivesNotifications: g.receivesNotifications,
      guardian: {
        id: g.guardian.id,
        name: g.guardian.name,
        phone: g.guardian.phone,
        phoneAlt: g.guardian.phoneAlt,
        email: g.guardian.email,
        occupation: g.guardian.occupation,
        employer: g.guardian.employer,
        address: g.guardian.address,
        nationalIdMasked: maskId(g.guardian.nationalIdLast4),
      },
    })),
    siblings,
    documents: student.documents,
    missingDocuments: DOCUMENT_TYPES.filter((d) => required.includes(d.id) && !have.has(d.id)).map((d) => ({ type: d.id, label: d.label })),
    admission: student.admission,
    createdAt: student.createdAt,
    updatedAt: student.updatedAt,
    permissions: { canEdit, canReveal: canEdit, canDelete: can(session.access, "students", "delete") },
  };
}

/** كشف رقم الهوية كاملاً (يُسجَّل في التدقيق) */
export async function revealStudentId(db: TenantDb, session: SessionData, id: string) {
  const student = await scopedStudent(db, session, id, "update");
  const value = revealId(student.nationalIdEnc);
  await writeAudit(
    { tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } },
    { action: "REVEAL", entityType: "Student", entityId: id, summary: `عرض رقم هوية ${student.fullName}` },
  );
  return { value };
}

export interface StudentProfilePatch {
  firstName?: string;
  fatherName?: string;
  grandfatherName?: string;
  familyName?: string;
  gender?: "MALE" | "FEMALE";
  nationality?: string;
  idType?: "NATIONAL_ID" | "IQAMA" | "PASSPORT";
  nationalId?: string;
  birthDate?: Date;
  birthPlace?: string | null;
  photoUrl?: string | null;
  cover?: string | null;
  previousSchool?: string | null;
  sectionId?: string | null;
  bloodType?: string | null;
  chronicConditions?: string | null;
  allergies?: string | null;
  medications?: string | null;
  criticalHealth?: boolean;
  healthNotes?: string | null;
  transportMode?: string | null;
  busNumber?: string | null;
  mealPlan?: string | null;
  emergencyContacts?: Array<{ name: string; relation: string; phone: string }>;
  notes?: unknown;
}

export async function updateStudentProfile(db: TenantDb, session: SessionData, id: string, patch: StudentProfilePatch) {
  const student = await scopedStudent(db, session, id, "update");
  const data: Prisma.StudentUncheckedUpdateInput = { updatedById: session.user.id };
  const names = {
    firstName: patch.firstName ?? student.firstName,
    fatherName: patch.fatherName ?? student.fatherName,
    grandfatherName: patch.grandfatherName ?? student.grandfatherName,
    familyName: patch.familyName ?? student.familyName,
  };
  if (patch.firstName !== undefined || patch.fatherName !== undefined || patch.grandfatherName !== undefined || patch.familyName !== undefined) {
    if (!names.firstName.trim() || !names.familyName.trim()) throw badRequest("الاسم الأول واسم العائلة مطلوبان");
    Object.assign(data, names, { fullName: composeFullName(names) });
  }
  if (patch.nationalId !== undefined) {
    const type = patch.idType ?? student.idType;
    const err = validateIdNumber(type, patch.nationalId);
    if (err) throw badRequest(err);
    const hash = idFingerprint(session.tenant.id, patch.nationalId);
    const dup = await db.student.findFirst({ where: { nationalIdHash: hash, id: { not: id }, deletedAt: null }, select: { fullName: true } });
    if (dup) throw badRequest(`رقم الهوية مسجّل للطالب ${dup.fullName}`);
    Object.assign(data, protectId(session.tenant.id, patch.nationalId), { idType: type });
  }
  if (patch.sectionId !== undefined) {
    if (patch.sectionId) await assertSectionFits({ db, session }, student, patch.sectionId);
    data.sectionId = patch.sectionId;
  }
  if (patch.emergencyContacts) {
    data.emergencyContacts = json(
      patch.emergencyContacts.slice(0, 5).map((c) => {
        const phone = normalizeSaudiMobile(c.phone) ?? c.phone.trim();
        return { name: c.name.trim().slice(0, 100), relation: c.relation.trim().slice(0, 40), phone };
      }),
    );
  }
  if (patch.notes !== undefined) data.notes = json(patch.notes);
  for (const key of ["gender", "nationality", "birthDate", "birthPlace", "photoUrl", "cover", "previousSchool", "bloodType", "chronicConditions", "allergies", "medications", "criticalHealth", "healthNotes", "transportMode", "busNumber", "mealPlan"] as const) {
    if (patch[key] !== undefined) (data as Record<string, unknown>)[key] = patch[key];
  }
  if (patch.birthDate && patch.birthDate > new Date()) throw badRequest("تاريخ الميلاد غير صالح");
  await db.student.update({ where: { id }, data });
  return { ok: true };
}

export interface NewStudentInput {
  branchId: string;
  gradeId: string;
  sectionId?: string | null;
  firstName: string;
  fatherName: string;
  grandfatherName: string;
  familyName: string;
  gender: "MALE" | "FEMALE";
  nationality: string;
  idType: "NATIONAL_ID" | "IQAMA" | "PASSPORT";
  nationalId: string;
  birthDate: Date;
  enrollmentDate?: Date;
  previousSchool?: string | null;
  guardianName: string;
  guardianRelation: "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER";
  guardianPhone: string;
  guardianNationalId?: string | null;
}

/** تسجيل طالب مباشرة (للطلاب الحاليين عند بدء استخدام المنصة) */
export async function createStudent(db: TenantDb, session: SessionData, input: NewStudentInput) {
  if (!can(session.access, "students", "create")) throw forbidden("لا تملك صلاحية إضافة طلاب");
  const scope = await requireStudentWhere(db, session, "students", "create");
  void scope;
  const idErr = validateIdNumber(input.idType, input.nationalId);
  if (idErr) throw badRequest(idErr);
  const phone = normalizeSaudiMobile(input.guardianPhone);
  if (!phone) throw badRequest("رقم جوال ولي الأمر غير صالح");
  const hash = idFingerprint(session.tenant.id, input.nationalId);
  const dup = await db.student.findFirst({ where: { nationalIdHash: hash, deletedAt: null }, select: { fullName: true } });
  if (dup) throw badRequest(`رقم الهوية مسجّل للطالب ${dup.fullName}`);
  const year = await currentYear(db);
  if (!year) throw badRequest("لا يوجد عام دراسي حالي");
  const grade = await db.grade.findFirst({ where: { id: input.gradeId, deletedAt: null } });
  if (!grade) throw badRequest("الصف غير موجود");

  const settings = (session.tenant.settings ?? {}) as { students?: { numberPrefix?: string; numberPadding?: number } };
  const prefix = settings.students?.numberPrefix ?? String(year.startDate.getUTCFullYear());
  const seq = await nextSequence(db, session.tenant.id, `student:${prefix}`, { prefix, padding: settings.students?.numberPadding ?? 4 });
  const names = { firstName: input.firstName.trim(), fatherName: input.fatherName.trim(), grandfatherName: input.grandfatherName.trim(), familyName: input.familyName.trim() };

  const student = await db.$transaction(async (tx) => {
    const created = await tx.student.create({
      data: {
        tenantId: session.tenant.id,
        branchId: input.branchId,
        academicNumber: seq.formatted,
        ...names,
        fullName: composeFullName(names),
        gender: input.gender,
        nationality: input.nationality,
        idType: input.idType,
        ...protectId(session.tenant.id, input.nationalId),
        birthDate: input.birthDate,
        academicYearId: year.id,
        gradeId: grade.id,
        enrollmentDate: input.enrollmentDate ?? new Date(new Date().toISOString().slice(0, 10)),
        previousSchool: input.previousSchool ?? null,
        createdById: session.user.id,
        updatedById: session.user.id,
      },
    });
    const guardian = await findOrCreateGuardian(tx, session, {
      name: input.guardianName.trim(),
      phone,
      email: null,
      ...(input.guardianNationalId ? protectId(session.tenant.id, input.guardianNationalId) : { nationalIdHash: null, nationalIdEnc: null, nationalIdLast4: null }),
    });
    await tx.studentGuardian.create({ data: { tenantId: session.tenant.id, studentId: created.id, guardianId: guardian.id, relation: input.guardianRelation, isPrimary: true } });
    return created;
  });
  if (input.sectionId) {
    await assertSectionFits({ db, session }, student, input.sectionId);
    await db.student.update({ where: { id: student.id }, data: { sectionId: input.sectionId } });
  }
  return { id: student.id, academicNumber: student.academicNumber };
}

// ---------------------------------------------------------------------
// أولياء الأمور
// ---------------------------------------------------------------------

export async function addGuardian(
  db: TenantDb,
  session: SessionData,
  studentId: string,
  input: { relation: "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER"; isPrimary?: boolean; guardianId?: string | null; name?: string; phone?: string; email?: string | null; nationalId?: string | null },
) {
  await scopedStudent(db, session, studentId, "update");
  let guardianId = input.guardianId ?? null;
  if (!guardianId) {
    if (!input.name?.trim() || !input.phone) throw badRequest("اسم ولي الأمر وجواله مطلوبان");
    const phone = normalizeSaudiMobile(input.phone);
    if (!phone) throw badRequest("رقم الجوال غير صالح");
    if (input.nationalId) {
      const err = validateIdNumber(/^2/.test(input.nationalId) ? "IQAMA" : "NATIONAL_ID", input.nationalId);
      if (err) throw badRequest(err);
    }
    const g = await findOrCreateGuardian(db, session, {
      name: input.name.trim(),
      phone,
      email: input.email?.trim().toLowerCase() || null,
      ...(input.nationalId ? protectId(session.tenant.id, input.nationalId) : { nationalIdHash: null, nationalIdEnc: null, nationalIdLast4: null }),
    });
    guardianId = g.id;
  }
  const exists = await db.studentGuardian.findFirst({ where: { studentId, guardianId } });
  if (exists) throw badRequest("ولي الأمر مرتبط بالطالب مسبقاً");
  if (input.isPrimary) await db.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
  const count = await db.studentGuardian.count({ where: { studentId } });
  return db.studentGuardian.create({
    data: { tenantId: session.tenant.id, studentId, guardianId, relation: input.relation, isPrimary: input.isPrimary ?? count === 0 },
  });
}

export async function updateGuardianLink(db: TenantDb, session: SessionData, linkId: string, patch: { isPrimary?: boolean; canPickup?: boolean; receivesNotifications?: boolean; relation?: "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER" }) {
  const link = await db.studentGuardian.findFirst({ where: { id: linkId } });
  if (!link) throw notFound();
  await scopedStudent(db, session, link.studentId, "update");
  if (patch.isPrimary) await db.studentGuardian.updateMany({ where: { studentId: link.studentId, id: { not: linkId } }, data: { isPrimary: false } });
  return db.studentGuardian.update({ where: { id: linkId }, data: patch });
}

export async function removeGuardian(db: TenantDb, session: SessionData, linkId: string) {
  const link = await db.studentGuardian.findFirst({ where: { id: linkId } });
  if (!link) throw notFound();
  await scopedStudent(db, session, link.studentId, "update");
  const count = await db.studentGuardian.count({ where: { studentId: link.studentId } });
  if (count <= 1) throw badRequest("يجب أن يبقى ولي أمر واحد على الأقل");
  await db.studentGuardian.delete({ where: { id: linkId } });
  if (link.isPrimary) {
    const next = await db.studentGuardian.findFirst({ where: { studentId: link.studentId }, orderBy: { createdAt: "asc" } });
    if (next) await db.studentGuardian.update({ where: { id: next.id }, data: { isPrimary: true } });
  }
  return { ok: true };
}

export async function updateGuardian(
  db: TenantDb,
  session: SessionData,
  guardianId: string,
  patch: { name?: string; phone?: string; phoneAlt?: string | null; email?: string | null; occupation?: string | null; employer?: string | null; address?: string | null },
) {
  // يجب أن يكون ولي الأمر مرتبطاً بطالب ضمن نطاق المستخدم
  const where = await requireStudentWhere(db, session, "students", "update", "لا تملك صلاحية تعديل بيانات أولياء الأمور");
  const linked = await db.studentGuardian.findFirst({ where: { guardianId, student: where } });
  if (!linked) throw notFound("ولي الأمر غير موجود أو خارج نطاق صلاحيتك");
  const data: Prisma.GuardianUncheckedUpdateInput = { updatedById: session.user.id };
  if (patch.name !== undefined) {
    if (!patch.name.trim()) throw badRequest("الاسم مطلوب");
    data.name = patch.name.trim();
  }
  if (patch.phone !== undefined) {
    const p = normalizeSaudiMobile(patch.phone);
    if (!p) throw badRequest("رقم الجوال غير صالح");
    data.phone = p;
  }
  for (const key of ["phoneAlt", "email", "occupation", "employer", "address"] as const) if (patch[key] !== undefined) (data as Record<string, unknown>)[key] = patch[key];
  await db.guardian.update({ where: { id: guardianId }, data });
  return { ok: true };
}

/** البحث عن ولي أمر لربطه (بالجوال أو بالاسم) */
export async function searchGuardians(db: TenantDb, session: SessionData, query: string) {
  if (!can(session.access, "students", "update")) throw forbidden();
  const q = query.trim();
  if (q.length < 2) return [];
  const phone = normalizeSaudiMobile(q);
  const guardians = await db.guardian.findMany({
    where: { deletedAt: null, OR: [{ name: { contains: q, mode: "insensitive" } }, ...(phone ? [{ phone }] : [])] },
    take: 10,
    include: { students: { include: { student: { select: { fullName: true } } } } },
  });
  return guardians.map((g) => ({ id: g.id, name: g.name, phone: g.phone, children: g.students.map((s) => s.student.fullName) }));
}

// ---------------------------------------------------------------------
// المستندات
// ---------------------------------------------------------------------

export async function addDocument(
  db: TenantDb,
  session: SessionData,
  studentId: string,
  input: { type: string; name?: string; file: { id: string; name: string; url: string; size?: number; mime?: string }; expiresAt?: Date | null },
) {
  await scopedStudent(db, session, studentId, "update");
  if (!DOCUMENT_TYPES.some((d) => d.id === input.type)) throw badRequest("نوع المستند غير معروف");
  if (!input.file.url.startsWith("/api/files/")) throw badRequest("ارفع الملف أولاً");
  const file = await db.fileObject.findFirst({ where: { id: input.file.id } });
  if (!file) throw badRequest("الملف غير موجود");
  return db.studentDocument.create({
    data: {
      tenantId: session.tenant.id,
      studentId,
      type: input.type,
      name: input.name?.trim() || DOCUMENT_TYPES.find((d) => d.id === input.type)!.label,
      fileId: file.id,
      url: input.file.url,
      size: file.size,
      mime: file.mime,
      expiresAt: input.expiresAt ?? null,
      createdById: session.user.id,
    },
  });
}

export async function verifyDocument(db: TenantDb, session: SessionData, documentId: string, verified: boolean) {
  const doc = await db.studentDocument.findFirst({ where: { id: documentId, deletedAt: null } });
  if (!doc) throw notFound();
  await scopedStudent(db, session, doc.studentId, "update");
  return db.studentDocument.update({ where: { id: documentId }, data: verified ? { verifiedById: session.user.id, verifiedAt: new Date() } : { verifiedById: null, verifiedAt: null } });
}

export async function removeDocument(db: TenantDb, session: SessionData, documentId: string) {
  const doc = await db.studentDocument.findFirst({ where: { id: documentId, deletedAt: null } });
  if (!doc) throw notFound();
  await scopedStudent(db, session, doc.studentId, "update");
  await db.studentDocument.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// لوحة الوحدة والبحث
// ---------------------------------------------------------------------

export async function studentsOverview(db: TenantDb, session: SessionData) {
  const where = { ...(await requireStudentWhere(db, session, "students", "view")), deletedAt: null };
  const active = { ...where, status: "ACTIVE" as const };
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [total, activeCount, byStatus, byGrade, byGender, critical, unplaced, newThisMonth, docs, required] = await Promise.all([
    db.student.count({ where }),
    db.student.count({ where: active }),
    db.student.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.student.groupBy({ by: ["gradeId"], where: active, _count: { _all: true } }),
    db.student.groupBy({ by: ["gender"], where: active, _count: { _all: true } }),
    db.student.count({ where: { ...active, criticalHealth: true } }),
    db.student.count({ where: { ...active, sectionId: null } }),
    db.student.count({ where: { ...where, createdAt: { gte: monthStart } } }),
    db.studentDocument.groupBy({ by: ["studentId", "type"], where: { deletedAt: null, student: active } }),
    requiredDocumentTypes({ db, session }),
  ]);
  const grades = await db.grade.findMany({ where: { id: { in: byGrade.map((g) => g.gradeId) } }, include: { stage: true }, orderBy: [{ stage: { order: "asc" } }, { order: "asc" }] });
  const docsByStudent = new Map<string, Set<string>>();
  for (const d of docs) (docsByStudent.get(d.studentId) ?? docsByStudent.set(d.studentId, new Set()).get(d.studentId)!).add(d.type);
  const activeIds = await db.student.findMany({ where: active, select: { id: true } });
  const missingDocs = activeIds.filter((s) => required.some((t) => !docsByStudent.get(s.id)?.has(t))).length;
  return {
    total,
    active: activeCount,
    byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
    byGrade: grades.map((g) => ({ id: g.id, name: g.name, stage: g.stage.name, count: byGrade.find((b) => b.gradeId === g.id)?._count._all ?? 0 })),
    byGender: Object.fromEntries(byGender.map((g) => [g.gender, g._count._all])),
    criticalHealth: critical,
    unplaced,
    newThisMonth,
    missingDocs,
  };
}

/** البحث السريع عن طالب (للمنتقيات ولوحة الأوامر) */
export async function searchStudents(db: TenantDb, session: SessionData, query: string, limit = 12) {
  const where = await requireStudentWhere(db, session, "students", "view");
  const q = query.trim();
  if (!q) return [];
  const digits = q.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const byId = /^\d{10}$/.test(digits) ? idFingerprint(session.tenant.id, digits) : null;
  const rows = await db.student.findMany({
    where: {
      ...where,
      deletedAt: null,
      OR: [
        { fullName: { contains: q, mode: "insensitive" } },
        { academicNumber: { startsWith: digits } },
        ...(byId ? [{ nationalIdHash: byId }] : []),
        ...(/^\d{4}$/.test(digits) ? [{ nationalIdLast4: digits }] : []),
      ],
    },
    take: limit,
    orderBy: { fullName: "asc" },
    select: { id: true, fullName: true, academicNumber: true, photoUrl: true, status: true, criticalHealth: true, grade: { select: { name: true } }, section: { select: { name: true } } },
  });
  return rows;
}

/** سجل التغييرات على الطالب وما يتبعه (مستندات، أولياء أمور، حضور، سلوك…) */
export async function studentActivity(db: TenantDb, session: SessionData, id: string) {
  await scopedStudent(db, session, id, "view");
  return db.auditLog.findMany({
    where: {
      OR: [
        { entityType: "Student", entityId: id },
        { entityType: { in: ["StudentDocument", "StudentGuardian", "Attendance", "BehaviorRecord", "StudentLeave", "Transfer", "ActivityRegistration"] }, newValue: { path: ["studentId"], equals: id } },
        { entityType: "Admission", newValue: { path: ["studentId"], equals: id } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, action: true, entityType: true, userName: true, createdAt: true, summary: true, oldValue: true, newValue: true },
  });
}

/** تقارير الطلاب: التوزيع حسب الصف والجنس والحالة والجنسية، اكتمال المستندات، وإشغال الفصول */
export async function studentsReport(db: TenantDb, session: SessionData) {
  const where = { ...(await requireStudentWhere(db, session, "students", "view")), deletedAt: null };
  const active = { ...where, status: "ACTIVE" as const };
  const [byGradeGender, byStatus, byNationality, byTransport, activeIds, docs, required] = await Promise.all([
    db.student.groupBy({ by: ["gradeId", "gender"], where: active, _count: { _all: true } }),
    db.student.groupBy({ by: ["status"], where, _count: { _all: true } }),
    db.student.groupBy({ by: ["nationality"], where: active, _count: { _all: true } }),
    db.student.groupBy({ by: ["transportMode"], where: active, _count: { _all: true } }),
    db.student.findMany({ where: active, select: { id: true } }),
    db.studentDocument.groupBy({ by: ["type"], where: { deletedAt: null, student: active }, _count: { studentId: true } }),
    requiredDocumentTypes({ db, session }),
  ]);
  const grades = await db.grade.findMany({ where: { deletedAt: null }, include: { stage: true }, orderBy: [{ stage: { order: "asc" } }, { order: "asc" }] });
  const year = await currentYear(db);
  const sections = year
    ? await db.section.findMany({ where: { academicYearId: year.id, deletedAt: null }, select: { id: true, capacity: true, _count: { select: { students: { where: { status: "ACTIVE", deletedAt: null } } } } } })
    : [];
  const capacity = sections.reduce((a, s) => a + s.capacity, 0);
  const placed = sections.reduce((a, s) => a + s._count.students, 0);
  // عدد الطلاب الذين لديهم كل نوع (قد يتكرر المستند نفسه؛ نعدّ الطلاب المميزين)
  const perType = await Promise.all(
    required.map(async (type) => ({ type, count: (await db.studentDocument.findMany({ where: { type, deletedAt: null, student: active }, distinct: ["studentId"], select: { studentId: true } })).length })),
  );
  void docs;
  return {
    activeCount: activeIds.length,
    byGrade: grades.map((g) => ({
      id: g.id,
      name: g.name,
      stage: g.stage.name,
      male: byGradeGender.find((b) => b.gradeId === g.id && b.gender === "MALE")?._count._all ?? 0,
      female: byGradeGender.find((b) => b.gradeId === g.id && b.gender === "FEMALE")?._count._all ?? 0,
    })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s._count._all })),
    byNationality: byNationality.map((n) => ({ nationality: n.nationality, count: n._count._all })).sort((a, b) => b.count - a.count),
    byTransport: byTransport.map((t) => ({ mode: t.transportMode ?? "UNKNOWN", count: t._count._all })).sort((a, b) => b.count - a.count),
    documents: perType.map((d) => ({ type: d.type, label: DOCUMENT_TYPES.find((t) => t.id === d.type)?.label ?? d.type, share: activeIds.length ? d.count / activeIds.length : 0, count: d.count })),
    occupancy: { capacity, placed, rate: capacity ? placed / capacity : null, sections: sections.length },
  };
}
