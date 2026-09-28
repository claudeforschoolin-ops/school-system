/**
 * التقويم المدرسي الموحد: أحداث أكاديمية وإدارية واختبارات واجتماعات وعطل.
 */
import type { EventCategory } from "@/generated/prisma/enums";
import { can } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";

export async function listEvents(db: TenantDb, session: SessionData, range: { from: Date; to: Date }) {
  if (!can(session.access, "events", "view")) throw forbidden();
  return db.calendarEvent.findMany({
    where: { deletedAt: null, startAt: { lt: range.to }, endAt: { gte: range.from } },
    orderBy: { startAt: "asc" },
    take: 1000,
  });
}

export async function upcomingEvents(db: TenantDb, session: SessionData, limit = 6) {
  if (!can(session.access, "events", "view")) return [];
  const now = new Date();
  return db.calendarEvent.findMany({
    where: { deletedAt: null, endAt: { gte: now } },
    orderBy: { startAt: "asc" },
    take: limit,
  });
}

export interface EventInput {
  title: string;
  description?: string | null;
  category: EventCategory;
  location?: string | null;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  branchId?: string | null;
}

function validate(input: EventInput) {
  if (!input.title.trim()) throw badRequest("عنوان الحدث مطلوب");
  if (input.endAt < input.startAt) throw badRequest("وقت النهاية يجب أن يكون بعد البداية");
}

export async function createEvent(db: TenantDb, session: SessionData, input: EventInput) {
  if (!can(session.access, "events", "create")) throw forbidden("لا تملك صلاحية إضافة أحداث إلى التقويم");
  validate(input);
  return db.calendarEvent.create({
    data: {
      tenantId: session.tenant.id,
      title: input.title.trim().slice(0, 200),
      description: input.description ?? null,
      category: input.category,
      location: input.location ?? null,
      startAt: input.startAt,
      endAt: input.endAt,
      allDay: input.allDay ?? false,
      branchId: input.branchId ?? null,
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
}

export async function updateEvent(db: TenantDb, session: SessionData, id: string, input: EventInput) {
  if (!can(session.access, "events", "update")) throw forbidden("لا تملك صلاحية تعديل أحداث التقويم");
  validate(input);
  const event = await db.calendarEvent.findFirst({ where: { id, deletedAt: null } });
  if (!event) throw notFound("الحدث غير موجود");
  return db.calendarEvent.update({
    where: { id },
    data: { ...input, title: input.title.trim().slice(0, 200), updatedById: session.user.id },
  });
}

export async function deleteEvent(db: TenantDb, session: SessionData, id: string) {
  if (!can(session.access, "events", "delete")) throw forbidden("لا تملك صلاحية حذف أحداث التقويم");
  const event = await db.calendarEvent.findFirst({ where: { id, deletedAt: null } });
  if (!event) throw notFound("الحدث غير موجود");
  await db.calendarEvent.update({ where: { id }, data: { deletedAt: new Date(), updatedById: session.user.id } });
  return { id };
}
