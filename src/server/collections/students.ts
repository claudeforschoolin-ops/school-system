/**
 * مجموعة «الطلاب»: ملفات الطلاب في عروض قاعدة البيانات.
 * الحالات الحساسة (منقول، منسحب، متخرج) لا تُغيَّر من الخلايا بل عبر التحويلات والترقية.
 */
import { DOCUMENT_TYPES, GENDER, NATIONALITIES, STUDENT_STATUS, TRANSPORT_MODES, BLOOD_TYPES, ageAt, toOptions } from "@/lib/students";
import type { Prisma } from "@/generated/prisma/client";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { maskId } from "@/server/pii";
import { requireStudentWhere } from "@/server/services/student-scope";
import { branchOptions, gradeOptions, sectionOptions } from "./options";
import { customOf, dateFromValue, isoDate, type CollectionCtx, type SystemCollection, type SystemRow } from "./types";

const include = {
  grade: { select: { id: true, name: true } },
  section: { select: { id: true, name: true, capacity: true, gradeId: true, branchId: true, academicYearId: true } },
  guardians: { include: { guardian: { select: { id: true, name: true, phone: true } } }, orderBy: { isPrimary: "desc" as const } },
  documents: { where: { deletedAt: null }, select: { type: true } },
} satisfies Prisma.StudentInclude;

type StudentWithRelations = Prisma.StudentGetPayload<{ include: typeof include }>;

export async function requiredDocumentTypes(ctx: CollectionCtx): Promise<string[]> {
  const settings = (ctx.session.tenant.settings ?? {}) as { students?: { requiredDocuments?: string[] } };
  return settings.students?.requiredDocuments ?? DOCUMENT_TYPES.filter((d) => d.required).map((d) => d.id);
}

/** الأشقاء: طلاب يشاركون ولي أمر واحداً على الأقل */
export async function siblingCounts(ctx: CollectionCtx, studentIds: string[]): Promise<Map<string, number>> {
  const links = await ctx.db.studentGuardian.findMany({ where: { studentId: { in: studentIds } }, select: { studentId: true, guardianId: true } });
  const guardianIds = [...new Set(links.map((l) => l.guardianId))];
  const all = guardianIds.length
    ? await ctx.db.studentGuardian.findMany({ where: { guardianId: { in: guardianIds }, student: { deletedAt: null } }, select: { studentId: true, guardianId: true } })
    : [];
  const byGuardian = new Map<string, Set<string>>();
  for (const l of all) (byGuardian.get(l.guardianId) ?? byGuardian.set(l.guardianId, new Set()).get(l.guardianId)!).add(l.studentId);
  const out = new Map<string, number>();
  for (const id of studentIds) {
    const sibs = new Set<string>();
    for (const l of links) if (l.studentId === id) for (const s of byGuardian.get(l.guardianId) ?? []) if (s !== id) sibs.add(s);
    out.set(id, sibs.size);
  }
  return out;
}

function toRow(s: StudentWithRelations, required: string[], siblings: number): SystemRow {
  const primary = s.guardians[0]?.guardian;
  const have = new Set(s.documents.map((d) => d.type));
  return {
    id: s.id,
    number: Number(s.academicNumber.replace(/\D/g, "").slice(-9)) || 0,
    title: s.fullName,
    icon: null,
    cover: s.cover,
    position: s.position,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    createdById: s.createdById,
    updatedById: s.updatedById,
    values: {
      academicNumber: s.academicNumber,
      status: s.status,
      branch: s.branchId,
      grade: s.gradeId,
      section: s.sectionId,
      gender: s.gender,
      nationality: s.nationality,
      nationalId: maskId(s.nationalIdLast4),
      birthDate: isoDate(s.birthDate),
      age: ageAt(s.birthDate),
      guardianName: primary?.name ?? null,
      guardianPhone: primary?.phone ?? null,
      transportMode: s.transportMode,
      busNumber: s.busNumber,
      criticalHealth: s.criticalHealth,
      bloodType: s.bloodType,
      missingDocs: required.filter((t) => !have.has(t)).length,
      siblings,
      enrollmentDate: isoDate(s.enrollmentDate),
      previousSchool: s.previousSchool,
    },
    custom: customOf(s.customValues),
  };
}

/** الحالات التي تتم عبر مسارات مخصصة فقط */
const WORKFLOW_STATUSES = new Set(["TRANSFERRED", "WITHDRAWN", "GRADUATED"]);

export const studentsCollection: SystemCollection = {
  source: "students",
  module: "students",
  teamspace: "students",
  page: { title: "ملفات الطلاب", icon: "lucide:contact", description: "كل طلاب المدرسة: البيانات الشخصية وأولياء الأمور والصحة والمستندات." },
  titleLabel: "اسم الطالب",
  titleEditable: false,
  href: (id) => `/students/${id}`,
  createLabel: "طالب جديد",
  properties: [
    { key: "academicNumber", name: "الرقم الأكاديمي", type: "TEXT", readOnly: true },
    { key: "status", name: "الحالة", type: "SELECT", config: { options: toOptions(STUDENT_STATUS) } },
    { key: "branch", name: "الفرع", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "grade", name: "الصف", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "section", name: "الفصل", type: "SELECT", dynamicOptions: true },
    { key: "gender", name: "الجنس", type: "SELECT", config: { options: toOptions(GENDER) } },
    { key: "nationality", name: "الجنسية", type: "SELECT", config: { options: NATIONALITIES } },
    { key: "nationalId", name: "رقم الهوية", type: "TEXT", readOnly: true },
    { key: "birthDate", name: "تاريخ الميلاد", type: "DATE", config: { calendar: "both" } },
    { key: "age", name: "العمر", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "guardianName", name: "ولي الأمر", type: "TEXT", readOnly: true },
    { key: "guardianPhone", name: "جوال ولي الأمر", type: "PHONE", readOnly: true },
    { key: "transportMode", name: "وسيلة الوصول", type: "SELECT", config: { options: TRANSPORT_MODES } },
    { key: "busNumber", name: "رقم الحافلة", type: "TEXT" },
    { key: "criticalHealth", name: "حالة صحية حرجة", type: "CHECKBOX" },
    { key: "bloodType", name: "فصيلة الدم", type: "SELECT", config: { options: BLOOD_TYPES.map((b) => ({ id: b, name: b, color: "red" as const })) } },
    { key: "missingDocs", name: "مستندات ناقصة", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "siblings", name: "الأشقاء", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "enrollmentDate", name: "تاريخ الالتحاق", type: "DATE" },
    { key: "previousSchool", name: "المدرسة السابقة", type: "TEXT" },
  ],
  views: [
    {
      name: "كل الطلاب",
      type: "TABLE",
      config: {
        sorts: [{ propertyId: "grade", direction: "asc" }],
        hiddenProperties: ["nationality", "birthDate", "busNumber", "bloodType", "enrollmentDate", "previousSchool", "branch", "transportMode"],
        propertyOrder: ["title", "academicNumber", "grade", "section", "status", "guardianName", "guardianPhone", "criticalHealth", "missingDocs", "siblings"],
      },
    },
    { name: "حسب الصف", type: "BOARD", config: { groupBy: "grade", cardSize: "small", hiddenProperties: ["nationality", "birthDate", "busNumber", "bloodType", "enrollmentDate", "previousSchool", "branch", "transportMode", "guardianName", "guardianPhone", "age", "nationalId", "missingDocs", "siblings", "grade"] } },
    { name: "المعرض", type: "GALLERY", config: { cardPreview: "cover", hiddenProperties: ["nationality", "birthDate", "busNumber", "bloodType", "enrollmentDate", "previousSchool", "branch", "transportMode", "guardianPhone", "nationalId", "age", "missingDocs", "siblings"] } },
    { name: "حالات صحية حرجة", type: "TABLE", config: { filter: { conjunction: "and", rules: [{ id: "h1", propertyId: "criticalHealth", operator: "is_checked" }] }, propertyOrder: ["title", "grade", "section", "bloodType", "guardianPhone"] } },
    { name: "مستندات ناقصة", type: "TABLE", config: { filter: { conjunction: "and", rules: [{ id: "d1", propertyId: "missingDocs", operator: "gt", value: 0 }] }, sorts: [{ propertyId: "missingDocs", direction: "desc" }] } },
  ],
  options: async ({ db }) => ({ branch: await branchOptions(db), grade: await gradeOptions(db), section: await sectionOptions(db) }),

  async list(ctx) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "students", "view");
    const students = await ctx.db.student.findMany({ where: { ...where, deletedAt: null }, include, orderBy: [{ position: "asc" }, { fullName: "asc" }], take: 5000 });
    const [required, siblings] = await Promise.all([requiredDocumentTypes(ctx), siblingCounts(ctx, students.map((s) => s.id))]);
    return students.map((s) => toRow(s, required, siblings.get(s.id) ?? 0));
  },

  async get(ctx, id) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "students", "view");
    const s = await ctx.db.student.findFirst({ where: { ...where, id, deletedAt: null }, include });
    if (!s) return null;
    const [required, siblings] = await Promise.all([requiredDocumentTypes(ctx), siblingCounts(ctx, [s.id])]);
    return toRow(s, required, siblings.get(s.id) ?? 0);
  },

  async update(ctx, id, patch) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "students", "update", "لا تملك صلاحية تعديل ملفات الطلاب");
    const student = await ctx.db.student.findFirst({ where: { ...where, id, deletedAt: null } });
    if (!student) throw notFound("الطالب غير موجود أو خارج نطاق صلاحيتك");
    const v = patch.values;
    const data: Prisma.StudentUncheckedUpdateInput = { updatedById: ctx.session.user.id };
    if ("status" in v) {
      const next = String(v.status ?? "");
      if (!(next in STUDENT_STATUS)) throw badRequest("حالة غير صالحة");
      if (WORKFLOW_STATUSES.has(next) || WORKFLOW_STATUSES.has(student.status)) throw badRequest("النقل والانسحاب والتخرج تتم عبر وحدة التحويلات أو الترقية نهاية العام");
      data.status = next as never;
    }
    if ("section" in v) {
      const sectionId = v.section ? String(v.section) : null;
      if (sectionId) await assertSectionFits(ctx, student, sectionId);
      data.sectionId = sectionId;
    }
    if ("gender" in v) data.gender = (v.gender ?? student.gender) as never;
    if ("nationality" in v) data.nationality = String(v.nationality ?? "SA");
    if ("birthDate" in v) {
      const d = dateFromValue(v.birthDate);
      if (!d) throw badRequest("تاريخ الميلاد مطلوب");
      data.birthDate = d;
    }
    if ("enrollmentDate" in v) {
      const d = dateFromValue(v.enrollmentDate);
      if (!d) throw badRequest("تاريخ الالتحاق مطلوب");
      data.enrollmentDate = d;
    }
    if ("transportMode" in v) data.transportMode = (v.transportMode as string | null) ?? null;
    if ("busNumber" in v) data.busNumber = (v.busNumber as string | null) ?? null;
    if ("criticalHealth" in v) data.criticalHealth = v.criticalHealth === true;
    if ("bloodType" in v) data.bloodType = (v.bloodType as string | null) ?? null;
    if ("previousSchool" in v) data.previousSchool = (v.previousSchool as string | null) ?? null;
    if (patch.custom) data.customValues = { ...customOf(student.customValues), ...patch.custom } as Prisma.InputJsonValue;
    if (patch.position !== undefined) data.position = patch.position;
    await ctx.db.student.update({ where: { id }, data });
  },

  async trash(ctx, id) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "students", "delete");
    const s = await ctx.db.student.findFirst({ where: { ...where, id, deletedAt: null } });
    if (!s) throw notFound();
    await ctx.db.student.update({ where: { id }, data: { deletedAt: new Date(), updatedById: ctx.session.user.id } });
  },

  async restore(ctx, id) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "students", "delete");
    const s = await ctx.db.student.findFirst({ where: { ...where, id } });
    if (!s) throw notFound();
    await ctx.db.student.update({ where: { id }, data: { deletedAt: null, updatedById: ctx.session.user.id } });
  },
};

/** التسكين في فصل: نفس الصف والفرع والعام، ومقعد متاح */
export async function assertSectionFits(ctx: CollectionCtx, student: { id: string; gradeId: string; branchId: string; academicYearId: string; sectionId: string | null }, sectionId: string) {
  if (student.sectionId === sectionId) return;
  const section = await ctx.db.section.findFirst({ where: { id: sectionId, deletedAt: null } });
  if (!section) throw notFound("الفصل غير موجود");
  if (section.gradeId !== student.gradeId) throw badRequest("الفصل من صف آخر؛ استخدم «التحويلات» لنقل الطالب بين الصفوف");
  if (section.branchId !== student.branchId) throw forbidden("الفصل في فرع آخر");
  if (section.academicYearId !== student.academicYearId) throw badRequest("الفصل من عام دراسي آخر");
  const occupied = await ctx.db.student.count({ where: { sectionId, deletedAt: null, status: "ACTIVE" } });
  if (occupied >= section.capacity) throw badRequest(`الفصل ممتلئ (${occupied}/${section.capacity})`);
}
