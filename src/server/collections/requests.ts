/**
 * مجموعات: الإجازات والاستئذان، والتحويلات — تُنشأ من نوافذ مخصصة وتتغير حالتها عبر سير العمل
 * (الاعتماد/التنفيذ) لا بسحب البطاقة، فحقول الحالة للقراءة فقط هنا.
 */
import type { Prisma } from "@/generated/prisma/client";
import { LEAVE_KIND, REQUEST_STATUS, TRANSFER_STATUS, TRANSFER_TYPE, toOptions } from "@/lib/students";
import { notFound } from "@/server/errors";
import { requireStudentWhere } from "@/server/services/student-scope";
import { gradeOptions, sectionOptions } from "./options";
import { customOf, isoDate, personValue, type CollectionCtx, type SystemCollection, type SystemRow } from "./types";

const studentInclude = { student: { select: { fullName: true, gradeId: true, sectionId: true } } } as const;

async function updateCustom(ctx: CollectionCtx, model: "studentLeave" | "transfer", id: string, patch: { custom?: Record<string, unknown>; position?: number }) {
  const where = await requireStudentWhere(ctx.db, ctx.session, "transfers", "update");
  const delegate = ctx.db[model] as unknown as {
    findFirst: (a: object) => Promise<{ customValues: unknown } | null>;
    update: (a: object) => Promise<unknown>;
  };
  const row = await delegate.findFirst({ where: { id, deletedAt: null, student: where } });
  if (!row) throw notFound();
  const data: Record<string, unknown> = { updatedById: ctx.session.user.id };
  if (patch.custom) data.customValues = { ...customOf(row.customValues), ...patch.custom } as Prisma.InputJsonValue;
  if (patch.position !== undefined) data.position = patch.position;
  await delegate.update({ where: { id }, data });
}

type LeaveRow = Prisma.StudentLeaveGetPayload<{ include: typeof studentInclude }>;
function leaveRow(l: LeaveRow): SystemRow {
  return {
    id: l.id,
    number: l.number,
    title: l.student.fullName,
    position: l.position,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    createdById: l.createdById,
    updatedById: l.updatedById,
    values: {
      number: l.number,
      kind: l.kind,
      status: l.status,
      period: { start: l.startDate.toISOString().slice(0, 10), ...(l.endDate.getTime() !== l.startDate.getTime() ? { end: l.endDate.toISOString().slice(0, 10) } : {}) },
      reason: l.reason,
      requestedBy: l.requestedBy,
      grade: l.student.gradeId,
      section: l.student.sectionId,
      attachments: Array.isArray(l.attachments) ? l.attachments : [],
      decidedBy: personValue(l.decidedById),
      createdBy: personValue(l.createdById),
    },
    custom: customOf(l.customValues),
  };
}

export const leavesCollection: SystemCollection = {
  source: "leaves",
  module: "transfers",
  teamspace: "students",
  page: { title: "الإجازات والاستئذان", icon: "lucide:calendar-x", description: "طلبات أولياء الأمور، واعتماد الوكيل، وانعكاسها على الحضور." },
  titleLabel: "الطالب",
  titleEditable: false,
  href: (id) => `/leaves/${id}`,
  createLabel: "إجازة/استئذان",
  properties: [
    { key: "number", name: "الرقم", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "kind", name: "النوع", type: "SELECT", readOnly: true, config: { options: toOptions(LEAVE_KIND) } },
    { key: "status", name: "الحالة", type: "SELECT", readOnly: true, config: { options: toOptions(REQUEST_STATUS) } },
    { key: "period", name: "الفترة", type: "DATE", readOnly: true },
    { key: "reason", name: "السبب", type: "TEXT", readOnly: true },
    { key: "grade", name: "الصف", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "section", name: "الفصل", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "requestedBy", name: "مقدّم الطلب", type: "TEXT", readOnly: true },
    { key: "attachments", name: "المرفقات", type: "FILES", readOnly: true },
    { key: "decidedBy", name: "اعتمده", type: "PERSON", readOnly: true },
    { key: "createdBy", name: "سجّله", type: "PERSON", readOnly: true },
  ],
  views: [
    { name: "حسب الحالة", type: "BOARD", config: { groupBy: "status", cardSize: "small", hiddenProperties: ["number", "status", "grade", "requestedBy", "attachments", "decidedBy", "createdBy", "reason"] } },
    { name: "كل الطلبات", type: "TABLE", config: { sorts: [{ propertyId: "number", direction: "desc" }], hiddenProperties: ["createdBy", "grade"] } },
    { name: "التقويم", type: "CALENDAR", config: { dateProperty: "period" } },
  ],
  options: async ({ db }) => ({ grade: await gradeOptions(db), section: await sectionOptions(db) }),
  async list(ctx) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "transfers", "view");
    const rows = await ctx.db.studentLeave.findMany({ where: { deletedAt: null, student: where }, include: studentInclude, orderBy: { number: "desc" }, take: 5000 });
    return rows.map(leaveRow);
  },
  async get(ctx, id) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "transfers", "view");
    const l = await ctx.db.studentLeave.findFirst({ where: { id, deletedAt: null, student: where }, include: studentInclude });
    return l ? leaveRow(l) : null;
  },
  update: (ctx, id, patch) => updateCustom(ctx, "studentLeave", id, patch),
};

type TransferRow = Prisma.TransferGetPayload<{ include: typeof studentInclude }>;
function transferRow(t: TransferRow): SystemRow {
  return {
    id: t.id,
    number: t.number,
    title: t.student.fullName,
    position: t.position,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    createdById: t.createdById,
    updatedById: t.updatedById,
    values: {
      number: t.number,
      type: t.type,
      status: t.status,
      effectiveDate: isoDate(t.effectiveDate),
      reason: t.reason,
      otherSchool: t.otherSchool,
      clearance: t.financialClearance,
      certificate: t.certificateNumber,
      grade: t.student.gradeId,
      createdBy: personValue(t.createdById),
    },
    custom: customOf(t.customValues),
  };
}

export const transfersCollection: SystemCollection = {
  source: "transfers",
  module: "transfers",
  teamspace: "students",
  page: { title: "التحويلات", icon: "lucide:arrow-left-right", description: "النقل بين الفصول والصفوف والمدارس والانسحاب، بموافقات وخلو طرف مالي." },
  titleLabel: "الطالب",
  titleEditable: false,
  href: (id) => `/transfers/${id}`,
  createLabel: "طلب تحويل",
  properties: [
    { key: "number", name: "الرقم", type: "NUMBER", readOnly: true, config: { numberFormat: "integer" } },
    { key: "type", name: "النوع", type: "SELECT", readOnly: true, config: { options: toOptions(TRANSFER_TYPE) } },
    { key: "status", name: "الحالة", type: "SELECT", readOnly: true, config: { options: toOptions(TRANSFER_STATUS) } },
    { key: "effectiveDate", name: "تاريخ السريان", type: "DATE", readOnly: true },
    { key: "grade", name: "الصف", type: "SELECT", readOnly: true, dynamicOptions: true },
    { key: "reason", name: "السبب", type: "TEXT", readOnly: true },
    { key: "otherSchool", name: "المدرسة الأخرى", type: "TEXT", readOnly: true },
    { key: "clearance", name: "خلو الطرف المالي", type: "CHECKBOX", readOnly: true },
    { key: "certificate", name: "رقم شهادة النقل", type: "TEXT", readOnly: true },
    { key: "createdBy", name: "أنشأه", type: "PERSON", readOnly: true },
  ],
  views: [
    { name: "مسار التحويلات", type: "BOARD", config: { groupBy: "status", cardSize: "medium", hiddenProperties: ["number", "status", "reason", "otherSchool", "certificate", "createdBy", "grade"] } },
    { name: "كل التحويلات", type: "TABLE", config: { sorts: [{ propertyId: "number", direction: "desc" }] } },
  ],
  options: async ({ db }) => ({ grade: await gradeOptions(db) }),
  async list(ctx) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "transfers", "view");
    const rows = await ctx.db.transfer.findMany({ where: { deletedAt: null, student: where }, include: studentInclude, orderBy: { number: "desc" }, take: 5000 });
    return rows.map(transferRow);
  },
  async get(ctx, id) {
    const where = await requireStudentWhere(ctx.db, ctx.session, "transfers", "view");
    const t = await ctx.db.transfer.findFirst({ where: { id, deletedAt: null, student: where }, include: studentInclude });
    return t ? transferRow(t) : null;
  },
  update: (ctx, id, patch) => updateCustom(ctx, "transfer", id, patch),
};

