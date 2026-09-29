/**
 * مجموعة الأنشطة والفعاليات: تُعرض كقاعدة بيانات (لوحة حسب الحالة، تقويم، معرض بالغلاف، جدول)
 * والتفاصيل (التسجيل والموافقات والألبوم) في صفحة النشاط.
 */
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVITY_KIND, ACTIVITY_STATUS, toOptions } from "@/lib/students";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { activityWhere, restoreActivity, trashActivity, updateActivity } from "@/server/services/activities.service";
import { branchOptions, gradeOptions } from "./options";
import { customOf, dateFromValue, firstPerson, personValue, type SystemCollection, type SystemRow } from "./types";

const include = { registrations: { select: { status: true, consentStatus: true } } } as const;
type Row = Prisma.ActivityGetPayload<{ include: typeof include }>;

function activityRow(a: Row): SystemRow {
  const active = a.registrations.filter((r) => r.status === "REGISTERED" || r.status === "ATTENDED").length;
  return {
    id: a.id,
    number: a.number,
    title: a.title,
    cover: a.cover,
    position: a.position,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    createdById: a.createdById,
    updatedById: a.updatedById,
    values: {
      number: a.number,
      kind: a.kind,
      status: a.status,
      when: a.startAt ? { start: a.startAt.toISOString(), ...(a.endAt ? { end: a.endAt.toISOString() } : {}) } : null,
      location: a.location,
      supervisor: personValue(a.supervisorId),
      branch: a.branchId,
      grades: a.gradeIds,
      capacity: a.capacity,
      registered: active,
      waitlist: a.registrations.filter((r) => r.status === "WAITLIST").length,
      consentPending: a.registrations.filter((r) => r.consentStatus === "PENDING" && r.status !== "CANCELLED").length,
      requiresConsent: a.requiresConsent,
      description: a.description,
    },
    custom: customOf(a.customValues),
  };
}

export const activitiesCollection: SystemCollection = {
  source: "activities",
  module: "activities",
  teamspace: "academic",
  page: { title: "الأنشطة والفعاليات", icon: "lucide:trophy", description: "الأندية واللجان والرحلات والمسابقات: التسجيل وموافقات أولياء الأمور والألبوم." },
  titleLabel: "النشاط",
  titleEditable: true,
  href: (id) => `/activities/${id}`,
  createLabel: "نشاط جديد",
  properties: [
    { key: "number", name: "الرقم", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "kind", name: "النوع", type: "SELECT", config: { options: toOptions(ACTIVITY_KIND) } },
    { key: "status", name: "الحالة", type: "SELECT", config: { options: toOptions(ACTIVITY_STATUS) } },
    { key: "when", name: "الموعد", type: "DATE", config: { includeTime: true } },
    { key: "location", name: "المكان", type: "TEXT" },
    { key: "supervisor", name: "المشرف", type: "PERSON" },
    { key: "branch", name: "الفرع", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "grades", name: "الصفوف المستهدفة", type: "MULTI_SELECT", readOnly: true, dynamicOptions: true },
    { key: "capacity", name: "الطاقة", type: "NUMBER", config: { numberFormat: "integer" } },
    { key: "registered", name: "المسجلون", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "waitlist", name: "الانتظار", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "consentPending", name: "موافقات معلّقة", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "requiresConsent", name: "تتطلب موافقة ولي الأمر", type: "CHECKBOX" },
    { key: "description", name: "الوصف", type: "TEXT" },
  ],
  views: [
    { name: "حسب الحالة", type: "BOARD", config: { groupBy: "status", cardSize: "medium", cardPreview: "cover", hiddenProperties: ["number", "status", "branch", "grades", "waitlist", "consentPending", "requiresConsent", "description", "capacity", "location"] } },
    { name: "التقويم", type: "CALENDAR", config: { dateProperty: "when" } },
    { name: "المعرض", type: "GALLERY", config: { cardSize: "medium", cardPreview: "cover", hiddenProperties: ["number", "branch", "grades", "waitlist", "consentPending", "requiresConsent", "description", "capacity", "supervisor"] } },
    { name: "كل الأنشطة", type: "TABLE", config: { sorts: [{ propertyId: "when", direction: "asc" }], hiddenProperties: ["description", "number"] } },
  ],
  options: async ({ db }) => ({ branch: await branchOptions(db), grades: await gradeOptions(db) }),
  async list(ctx) {
    const where = await activityWhere(ctx.db, ctx.session, "view");
    if (!where) throw forbidden("لا تملك صلاحية عرض الأنشطة");
    const rows = await ctx.db.activity.findMany({ where: { ...where, deletedAt: null }, include, orderBy: { number: "desc" }, take: 5000 });
    return rows.map(activityRow);
  },
  async get(ctx, id) {
    const where = await activityWhere(ctx.db, ctx.session, "view");
    if (!where) return null;
    const a = await ctx.db.activity.findFirst({ where: { ...where, id, deletedAt: null }, include });
    return a ? activityRow(a) : null;
  },
  async update(ctx, id, patch) {
    const where = await activityWhere(ctx.db, ctx.session, "update");
    if (!where) throw forbidden();
    const a = await ctx.db.activity.findFirst({ where: { ...where, id, deletedAt: null } });
    if (!a) throw notFound("النشاط غير موجود أو خارج نطاق صلاحيتك");
    const v = patch.values;
    const input: Parameters<typeof updateActivity>[3] = {};
    if (patch.title !== undefined) input.title = patch.title;
    if ("kind" in v) {
      if (!v.kind) throw badRequest("نوع النشاط مطلوب");
      input.kind = v.kind as never;
    }
    if ("status" in v) {
      if (!v.status) throw badRequest("حالة النشاط مطلوبة");
      input.status = v.status as never;
    }
    if ("when" in v) {
      const start = dateFromValue(v.when);
      const endRaw = v.when && typeof v.when === "object" ? (v.when as { end?: string }).end : undefined;
      input.startAt = start;
      input.endAt = endRaw ? dateFromValue(endRaw) : null;
    }
    if ("location" in v) input.location = (v.location as string | null) ?? null;
    if ("supervisor" in v) input.supervisorId = firstPerson(v.supervisor);
    if ("capacity" in v) input.capacity = typeof v.capacity === "number" ? Math.max(0, Math.round(v.capacity)) : null;
    if ("requiresConsent" in v) input.requiresConsent = v.requiresConsent === true;
    if ("description" in v) input.description = (v.description as string | null) ?? null;
    if (Object.keys(input).length) await updateActivity(ctx.db, ctx.session, id, input);
    if (patch.custom || patch.position !== undefined) {
      const data: Prisma.ActivityUncheckedUpdateInput = { updatedById: ctx.session.user.id };
      if (patch.custom) data.customValues = { ...customOf(a.customValues), ...patch.custom } as Prisma.InputJsonValue;
      if (patch.position !== undefined) data.position = patch.position;
      await ctx.db.activity.update({ where: { id }, data });
    }
  },
  trash: async (ctx, id) => {
    await trashActivity(ctx.db, ctx.session, id);
  },
  restore: async (ctx, id) => {
    await restoreActivity(ctx.db, ctx.session, id);
  },
};
