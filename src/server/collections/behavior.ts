/**
 * مجموعات: السلوك (يسجله المعلم لطلاب فصوله) والحالات الإرشادية (سرّية: المرشد المسؤول والإدارة).
 */
import type { Prisma } from "@/generated/prisma/client";
import { BEHAVIOR_CATEGORIES, BEHAVIOR_KIND, CASE_CATEGORIES, CASE_STATUS, SEVERITY, toOptions } from "@/lib/students";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { caseWhere, isCounselingAdmin } from "@/server/services/behavior.service";
import { requireStudentWhere } from "@/server/services/student-scope";
import { gradeOptions, sectionOptions } from "./options";
import { customOf, dateFromValue, firstPerson, isoDate, isoDateTime, personValue, type SystemCollection, type SystemRow } from "./types";

const behaviorInclude = { student: { select: { fullName: true, gradeId: true, sectionId: true } } } as const;
type BehaviorRow = Prisma.BehaviorRecordGetPayload<{ include: typeof behaviorInclude }>;

function behaviorRow(b: BehaviorRow): SystemRow {
  return {
    id: b.id,
    number: b.number,
    title: b.student.fullName,
    position: b.position,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    createdById: b.createdById,
    updatedById: b.updatedById,
    values: {
      kind: b.kind,
      category: b.category,
      points: b.points,
      severity: b.severity,
      occurredAt: isoDateTime(b.occurredAt),
      description: b.description,
      actionTaken: b.actionTaken,
      guardianNotified: b.guardianNotified,
      grade: b.student.gradeId,
      section: b.student.sectionId,
      reportedBy: personValue(b.reportedById),
      source: b.source,
    },
    custom: customOf(b.customValues),
  };
}

export const behaviorCollection: SystemCollection = {
  source: "behavior",
  module: "counseling",
  teamspace: "students",
  page: { title: "السلوك", icon: "lucide:clipboard-pen", description: "الملاحظات السلوكية الإيجابية والسلبية بنقاطها، يسجلها المعلمون والوكلاء." },
  titleLabel: "الطالب",
  titleEditable: false,
  href: (id) => `/behavior/${id}`,
  createLabel: "ملاحظة سلوكية",
  properties: [
    { key: "kind", name: "النوع", type: "SELECT", readOnly: true, config: { options: toOptions(BEHAVIOR_KIND) } },
    { key: "category", name: "التصنيف", type: "SELECT", readOnly: true, config: { options: BEHAVIOR_CATEGORIES.map((c) => ({ id: c.id, name: c.label, color: c.color })) } },
    { key: "points", name: "النقاط", type: "NUMBER", config: { numberFormat: "integer" } },
    { key: "severity", name: "الخطورة", type: "SELECT", config: { options: toOptions(SEVERITY) } },
    { key: "occurredAt", name: "التاريخ", type: "DATE", config: { includeTime: true } },
    { key: "description", name: "الوصف", type: "TEXT" },
    { key: "actionTaken", name: "الإجراء المتخذ", type: "TEXT" },
    { key: "guardianNotified", name: "أُبلغ ولي الأمر", type: "CHECKBOX" },
    { key: "grade", name: "الصف", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "section", name: "الفصل", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "reportedBy", name: "سجّله", type: "PERSON", readOnly: true },
    { key: "source", name: "المصدر", type: "SELECT", readOnly: true, config: { options: [{ id: "MANUAL", name: "يدوي", color: "gray" }, { id: "ATTENDANCE_THRESHOLD", name: "تجاوز حد الغياب", color: "orange" }] } },
  ],
  views: [
    { name: "كل السلوكيات", type: "TABLE", config: { sorts: [{ propertyId: "occurredAt", direction: "desc" }], hiddenProperties: ["grade", "source", "actionTaken"] } },
    { name: "حسب التصنيف", type: "BOARD", config: { groupBy: "category", cardSize: "small", hiddenProperties: ["category", "kind", "description", "actionTaken", "guardianNotified", "grade", "reportedBy", "source", "occurredAt"] } },
    { name: "حسب الخطورة", type: "BOARD", config: { groupBy: "severity", cardSize: "small", hiddenProperties: ["severity", "description", "actionTaken", "guardianNotified", "grade", "reportedBy", "source"] } },
    { name: "التقويم", type: "CALENDAR", config: { dateProperty: "occurredAt" } },
  ],
  options: async ({ db }) => ({ grade: await gradeOptions(db), section: await sectionOptions(db) }),
  async list(ctx) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "counseling", "view");
    const rows = await ctx.db.behaviorRecord.findMany({ where: { deletedAt: null, student: where }, include: behaviorInclude, orderBy: { occurredAt: "desc" }, take: 5000 });
    return rows.map(behaviorRow);
  },
  async get(ctx, id) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "counseling", "view");
    const b = await ctx.db.behaviorRecord.findFirst({ where: { id, deletedAt: null, student: where }, include: behaviorInclude });
    return b ? behaviorRow(b) : null;
  },
  async update(ctx, id, patch) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "counseling", "update", "تعديل السلوك من صلاحية المرشد والوكيل");
    const b = await ctx.db.behaviorRecord.findFirst({ where: { id, deletedAt: null, student: where } });
    if (!b) throw notFound();
    const v = patch.values;
    const data: Prisma.BehaviorRecordUncheckedUpdateInput = { updatedById: ctx.session.user.id };
    if ("points" in v) {
      const p = typeof v.points === "number" ? Math.round(v.points) : 0;
      if ((b.kind === "POSITIVE" && p < 0) || (b.kind === "NEGATIVE" && p > 0)) throw badRequest("إشارة النقاط تخالف نوع السلوك");
      data.points = p;
    }
    if ("severity" in v && v.severity) data.severity = v.severity as never;
    if ("occurredAt" in v) data.occurredAt = dateFromValue(v.occurredAt) ?? b.occurredAt;
    if ("description" in v) data.description = (v.description as string | null) ?? null;
    if ("actionTaken" in v) data.actionTaken = (v.actionTaken as string | null) ?? null;
    if ("guardianNotified" in v) data.guardianNotified = v.guardianNotified === true;
    if (patch.custom) data.customValues = { ...customOf(b.customValues), ...patch.custom } as Prisma.InputJsonValue;
    if (patch.position !== undefined) data.position = patch.position;
    await ctx.db.behaviorRecord.update({ where: { id }, data });
  },
  async trash(ctx, id) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "counseling", "delete");
    const b = await ctx.db.behaviorRecord.findFirst({ where: { id, deletedAt: null, student: where } });
    if (!b) throw notFound();
    await ctx.db.behaviorRecord.update({ where: { id }, data: { deletedAt: new Date(), updatedById: ctx.session.user.id } });
  },
  async restore(ctx, id) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "counseling", "delete");
    await ctx.db.behaviorRecord.updateMany({ where: { id, student: where }, data: { deletedAt: null, updatedById: ctx.session.user.id } });
  },
};

const caseInclude = { student: { select: { fullName: true, gradeId: true } }, sessions: { select: { scheduledAt: true, status: true } } } as const;
type CaseRow = Prisma.CounselingCaseGetPayload<{ include: typeof caseInclude }>;

function caseRow(c: CaseRow): SystemRow {
  const next = c.sessions.filter((s) => s.status === "SCHEDULED" && s.scheduledAt > new Date()).sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())[0];
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    position: c.position,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    createdById: c.createdById,
    updatedById: c.updatedById,
    values: {
      student: c.student.fullName,
      grade: c.student.gradeId,
      category: c.category,
      severity: c.severity,
      status: c.status,
      counselor: personValue(c.counselorId),
      openedAt: isoDate(c.openedAt),
      nextSession: isoDateTime(next?.scheduledAt),
      sessions: c.sessions.filter((s) => s.status === "DONE").length,
      guardianSummoned: isoDate(c.guardianSummonedAt),
    },
    custom: customOf(c.customValues),
  };
}

export const counselingCollection: SystemCollection = {
  source: "counseling",
  module: "counseling",
  teamspace: "students",
  page: { title: "الحالات الإرشادية", icon: "lucide:heart-handshake", description: "سجل سرّي للمرشد الطلابي والإدارة: الحالات وخطط العلاج والجلسات." },
  titleLabel: "عنوان الحالة",
  titleEditable: true,
  href: (id) => `/counseling/${id}`,
  createLabel: "حالة جديدة",
  properties: [
    { key: "student", name: "الطالب", type: "TEXT", readOnly: true },
    { key: "grade", name: "الصف", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "category", name: "التصنيف", type: "SELECT", config: { options: CASE_CATEGORIES } },
    { key: "severity", name: "الخطورة", type: "SELECT", config: { options: toOptions(SEVERITY) } },
    { key: "status", name: "الحالة", type: "SELECT", config: { options: toOptions(CASE_STATUS) } },
    { key: "counselor", name: "المرشد", type: "PERSON", config: { multiple: false } },
    { key: "openedAt", name: "تاريخ الفتح", type: "DATE", readOnly: true },
    { key: "nextSession", name: "الجلسة القادمة", type: "DATE", readOnly: true, config: { includeTime: true } },
    { key: "sessions", name: "جلسات منفذة", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "guardianSummoned", name: "استدعاء ولي الأمر", type: "DATE", readOnly: true },
  ],
  views: [
    { name: "مسار الحالات", type: "BOARD", config: { groupBy: "status", cardSize: "medium", hiddenProperties: ["status", "grade", "openedAt", "sessions", "guardianSummoned", "counselor"] } },
    { name: "كل الحالات", type: "TABLE", config: { sorts: [{ propertyId: "openedAt", direction: "desc" }] } },
    { name: "الجلسات القادمة", type: "CALENDAR", config: { dateProperty: "nextSession" } },
  ],
  options: async ({ db }) => ({ grade: await gradeOptions(db) }),
  async list(ctx) {
    const rows = await ctx.db.counselingCase.findMany({ where: await caseWhere(ctx.db, ctx.session), include: caseInclude, orderBy: { number: "desc" }, take: 5000 });
    return rows.map(caseRow);
  },
  async get(ctx, id) {
    const c = await ctx.db.counselingCase.findFirst({ where: { ...(await caseWhere(ctx.db, ctx.session)), id }, include: caseInclude });
    return c ? caseRow(c) : null;
  },
  async update(ctx, id, patch) {
    const c = await ctx.db.counselingCase.findFirst({ where: { ...(await caseWhere(ctx.db, ctx.session, "update")), id } });
    if (!c) throw notFound();
    if (c.counselorId !== ctx.session.user.id && !isCounselingAdmin(ctx.session)) throw forbidden();
    const v = patch.values;
    const data: Prisma.CounselingCaseUncheckedUpdateInput = { updatedById: ctx.session.user.id };
    if (patch.title !== undefined) {
      if (!patch.title.trim()) throw badRequest("عنوان الحالة مطلوب");
      data.title = patch.title.trim();
    }
    if ("category" in v && v.category) data.category = String(v.category);
    if ("severity" in v && v.severity) data.severity = v.severity as never;
    if ("status" in v && v.status) {
      data.status = v.status as never;
      data.closedAt = v.status === "CLOSED" ? new Date() : null;
    }
    if ("counselor" in v) {
      if (!isCounselingAdmin(ctx.session)) throw forbidden("إعادة إسناد الحالة للإدارة");
      const id2 = firstPerson(v.counselor);
      if (!id2) throw badRequest("اختر المرشد");
      data.counselorId = id2;
    }
    if (patch.custom) data.customValues = { ...customOf(c.customValues), ...patch.custom } as Prisma.InputJsonValue;
    if (patch.position !== undefined) data.position = patch.position;
    await ctx.db.counselingCase.update({ where: { id }, data });
  },
};
