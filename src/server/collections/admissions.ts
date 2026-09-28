/**
 * مجموعة «طلبات القبول»: لوحة المراحل، الجدول، وتقويم المقابلات.
 * سحب البطاقة بين الأعمدة يمرّ بقواعد القبول (المقاعد، إنشاء ملف الطالب، التسكين قبل التسجيل).
 */
import type { Prisma } from "@/generated/prisma/client";
import { ADMISSION_FLOW, ADMISSION_SOURCES, ADMISSION_STAGE, GENDER, GUARDIAN_RELATION, splitFullName, toOptions, composeFullName, type AdmissionStageKey } from "@/lib/students";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { maskId } from "@/server/pii";
import { changeAdmissionStage, seatsFor } from "@/server/services/admissions.service";
import { branchWhere } from "@/server/services/student-scope";
import { branchOptions, gradeOptions } from "./options";
import { customOf, dateFromValue, firstPerson, isoDate, isoDateTime, personValue, type CollectionCtx, type SystemCollection, type SystemRow } from "./types";

type AdmissionRow = Prisma.AdmissionGetPayload<object>;

async function seatMap(ctx: CollectionCtx, rows: AdmissionRow[]) {
  const keys = [...new Set(rows.filter((r) => r.requestedGradeId).map((r) => `${r.branchId}:${r.requestedGradeId}`))];
  const out = new Map<string, number>();
  for (const key of keys) {
    const [branchId, gradeId] = key.split(":") as [string, string];
    out.set(key, (await seatsFor(ctx.db, branchId, gradeId)).available);
  }
  return out;
}

function toRow(a: AdmissionRow, seats: Map<string, number>): SystemRow {
  return {
    id: a.id,
    number: a.number,
    title: a.fullName,
    position: a.position,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    createdById: a.createdById,
    updatedById: a.updatedById,
    values: {
      number: a.number,
      stage: a.stage,
      grade: a.requestedGradeId,
      branch: a.branchId,
      gender: a.gender,
      nationalId: maskId(a.nationalIdLast4),
      birthDate: isoDate(a.birthDate),
      guardianName: a.guardianName,
      guardianRelation: a.guardianRelation,
      guardianPhone: a.guardianPhone,
      guardianEmail: a.guardianEmail,
      source: a.source,
      owner: personValue(a.ownerId),
      assessmentAt: isoDateTime(a.assessmentAt),
      assessmentScore: a.assessmentScore,
      previousSchool: a.previousSchool,
      attachments: Array.isArray(a.attachments) ? a.attachments : [],
      submittedVia: a.submittedVia,
      seats: a.requestedGradeId ? (seats.get(`${a.branchId}:${a.requestedGradeId}`) ?? null) : null,
      submittedAt: null,
    },
    custom: customOf(a.customValues),
  };
}

export const admissionsCollection: SystemCollection = {
  source: "admissions",
  module: "admissions",
  teamspace: "students",
  page: { title: "طلبات القبول", icon: "lucide:user-plus", description: "مراحل القبول من الطلب حتى التسجيل، والمقابلات والاختبارات." },
  titleLabel: "اسم الطالب",
  titleEditable: true,
  href: (id) => `/admissions/${id}`,
  createLabel: "طلب قبول",
  properties: [
    { key: "number", name: "رقم الطلب", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "stage", name: "المرحلة", type: "SELECT", config: { options: toOptions(ADMISSION_STAGE, ADMISSION_FLOW) } },
    { key: "grade", name: "الصف المطلوب", type: "SELECT", dynamicOptions: true },
    { key: "branch", name: "الفرع", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "seats", name: "المقاعد المتاحة", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "gender", name: "الجنس", type: "SELECT", config: { options: toOptions(GENDER) } },
    { key: "nationalId", name: "رقم الهوية", type: "TEXT", readOnly: true },
    { key: "birthDate", name: "تاريخ الميلاد", type: "DATE", config: { calendar: "both" } },
    { key: "guardianName", name: "ولي الأمر", type: "TEXT" },
    { key: "guardianRelation", name: "صلة القرابة", type: "SELECT", config: { options: toOptions(GUARDIAN_RELATION) } },
    { key: "guardianPhone", name: "الجوال", type: "PHONE" },
    { key: "guardianEmail", name: "البريد", type: "EMAIL" },
    { key: "source", name: "كيف عرفتنا", type: "SELECT", config: { options: ADMISSION_SOURCES } },
    { key: "owner", name: "المسؤول عن المتابعة", type: "PERSON", config: { multiple: false } },
    { key: "assessmentAt", name: "موعد الاختبار/المقابلة", type: "DATE", config: { includeTime: true } },
    { key: "assessmentScore", name: "نتيجة الاختبار", type: "NUMBER", config: { numberFormat: "integer" } },
    { key: "previousSchool", name: "المدرسة السابقة", type: "TEXT" },
    { key: "attachments", name: "المرفقات", type: "FILES" },
    { key: "submittedVia", name: "مصدر الطلب", type: "SELECT", readOnly: true, config: { options: [{ id: "PUBLIC_FORM", name: "النموذج العام", color: "teal" }, { id: "STAFF", name: "موظف القبول", color: "gray" }] } },
    { key: "submittedAt", name: "تاريخ التقديم", type: "CREATED_TIME" },
  ],
  views: [
    {
      name: "مراحل القبول",
      type: "BOARD",
      config: { groupBy: "stage", cardSize: "medium", propertyOrder: ["grade", "owner", "assessmentAt"], hiddenProperties: ["number", "branch", "seats", "gender", "nationalId", "birthDate", "guardianName", "guardianRelation", "guardianPhone", "guardianEmail", "source", "assessmentScore", "previousSchool", "attachments", "submittedVia", "submittedAt", "stage"] },
    },
    { name: "كل الطلبات", type: "TABLE", config: { sorts: [{ propertyId: "number", direction: "desc" }], propertyOrder: ["title", "number", "stage", "grade", "seats", "guardianName", "guardianPhone", "owner", "assessmentAt", "submittedAt"], hiddenProperties: ["nationalId", "guardianRelation", "guardianEmail", "previousSchool", "attachments", "branch", "gender", "birthDate"] } },
    { name: "المقابلات والاختبارات", type: "CALENDAR", config: { dateProperty: "assessmentAt" } },
    { name: "طلبات النموذج العام", type: "TABLE", config: { filter: { conjunction: "and", rules: [{ id: "p1", propertyId: "submittedVia", operator: "equals", value: "PUBLIC_FORM" }] }, sorts: [{ propertyId: "number", direction: "desc" }] } },
  ],
  options: async ({ db }) => ({ branch: await branchOptions(db), grade: await gradeOptions(db) }),

  async list(ctx) {
    const scope = branchWhere(ctx.session, "admissions", "view");
    if (!scope) throw forbidden();
    const rows = await ctx.db.admission.findMany({ where: { ...scope, deletedAt: null }, orderBy: [{ position: "asc" }, { number: "desc" }], take: 5000 });
    const seats = await seatMap(ctx, rows);
    return rows.map((r) => toRow(r, seats));
  },

  async get(ctx, id) {
    const scope = branchWhere(ctx.session, "admissions", "view");
    if (!scope) throw forbidden();
    const a = await ctx.db.admission.findFirst({ where: { ...scope, id, deletedAt: null } });
    return a ? toRow(a, await seatMap(ctx, [a])) : null;
  },

  async update(ctx, id, patch) {
    const scope = branchWhere(ctx.session, "admissions", "update");
    if (!scope) throw forbidden("لا تملك صلاحية تعديل طلبات القبول");
    const a = await ctx.db.admission.findFirst({ where: { ...scope, id, deletedAt: null } });
    if (!a) throw notFound("الطلب غير موجود أو خارج نطاق صلاحيتك");
    const v = patch.values;
    const locked = Boolean(a.studentId);
    const data: Prisma.AdmissionUncheckedUpdateInput = { updatedById: ctx.session.user.id };
    const identityChange = patch.title !== undefined || "grade" in v || "gender" in v || "birthDate" in v;
    if (locked && identityChange) throw badRequest("أُنشئ ملف الطالب؛ عدّل البيانات من ملف الطالب");
    if (patch.title !== undefined) {
      const parts = splitFullName(patch.title);
      if (!parts.firstName) throw badRequest("اسم الطالب مطلوب");
      Object.assign(data, parts, { fullName: composeFullName(parts) });
    }
    if ("grade" in v) data.requestedGradeId = (v.grade as string | null) ?? null;
    if ("gender" in v) data.gender = (v.gender as never) ?? null;
    if ("birthDate" in v) data.birthDate = dateFromValue(v.birthDate);
    if ("guardianName" in v) data.guardianName = (v.guardianName as string | null) ?? null;
    if ("guardianRelation" in v) data.guardianRelation = (v.guardianRelation as never) ?? null;
    if ("guardianPhone" in v) data.guardianPhone = (v.guardianPhone as string | null) ?? null;
    if ("guardianEmail" in v) data.guardianEmail = (v.guardianEmail as string | null) ?? null;
    if ("source" in v) data.source = (v.source as string | null) ?? null;
    if ("owner" in v) data.ownerId = firstPerson(v.owner);
    if ("assessmentAt" in v) data.assessmentAt = dateFromValue(v.assessmentAt);
    if ("assessmentScore" in v) data.assessmentScore = typeof v.assessmentScore === "number" ? Math.round(v.assessmentScore) : null;
    if ("previousSchool" in v) data.previousSchool = (v.previousSchool as string | null) ?? null;
    if ("attachments" in v) data.attachments = (v.attachments ?? []) as Prisma.InputJsonValue;
    if (patch.custom) data.customValues = { ...customOf(a.customValues), ...patch.custom } as Prisma.InputJsonValue;
    if (patch.position !== undefined) data.position = patch.position;
    await ctx.db.admission.update({ where: { id }, data });
    // تغيير المرحلة أخيراً (بعد حفظ البيانات التي قد تلزمه)
    if ("stage" in v && v.stage && v.stage !== a.stage) {
      await changeAdmissionStage(ctx.db, ctx.session, id, v.stage as AdmissionStageKey);
    }
  },

  async trash(ctx, id) {
    const scope = branchWhere(ctx.session, "admissions", "delete");
    if (!scope) throw forbidden();
    const a = await ctx.db.admission.findFirst({ where: { ...scope, id, deletedAt: null } });
    if (!a) throw notFound();
    if (a.studentId) throw badRequest("لا يمكن حذف طلب أُنشئ منه ملف طالب");
    await ctx.db.admission.update({ where: { id }, data: { deletedAt: new Date(), updatedById: ctx.session.user.id } });
  },

  async restore(ctx, id) {
    const scope = branchWhere(ctx.session, "admissions", "delete");
    if (!scope) throw forbidden();
    await ctx.db.admission.updateMany({ where: { ...scope, id }, data: { deletedAt: null, updatedById: ctx.session.user.id } });
  },
};
