/**
 * الأنشطة والفعاليات: الأندية واللجان والرحلات والمسابقات، التسجيل بطاقة استيعابية وقائمة انتظار،
 * موافقة ولي الأمر (طلب بالرسائل وتسجيل الرد)، الحضور، ألبوم الصور، والمزامنة مع تقويم المدرسة.
 * رسوم النشاط تُحفظ بأصغر وحدة وتُفوتر عند تفعيل المحاسبة (المرحلة ٣).
 */
import type { Prisma } from "@/generated/prisma/client";
import { ACTIVITY_KIND } from "@/lib/students";
import { resolveScope } from "@/lib/rbac/access";
import type { Action } from "@/lib/rbac/catalog";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { messageGuardians } from "./guardian-messages";
import { notify } from "./notifications.service";
import { nextNumber } from "./sequence.service";
import { requireStudentWhere, studentWhere } from "./student-scope";

type FileValue = { id: string; name: string; url: string; size?: number; mime?: string };

/** نطاق الأنشطة: المدرسة / الفرع (وأنشطة المدرسة العامة) / المشرف أو فروع المعلم / أنشطة الأبناء */
export async function activityWhere(db: TenantDb, session: SessionData, action: Action): Promise<Prisma.ActivityWhereInput | null> {
  const scope = resolveScope(session.access, "activities", action);
  if (!scope) return null;
  if (scope.kind === "all") return {};
  const or: Prisma.ActivityWhereInput[] = [];
  if (scope.branchIds.length) or.push({ branchId: { in: scope.branchIds } }, { branchId: null });
  if (scope.assigned) {
    or.push({ supervisorId: session.user.id });
    if (action === "view") {
      const roles = await db.userRole.findMany({ where: { userId: session.user.id, branchId: { not: null } }, select: { branchId: true } });
      const ids = roles.map((r) => r.branchId!).filter(Boolean);
      if (ids.length) or.push({ branchId: { in: ids } }, { branchId: null });
    }
  }
  if (scope.own || scope.assigned) {
    or.push({ registrations: { some: { student: { OR: [{ userId: session.user.id }, { guardians: { some: { guardian: { userId: session.user.id } } } }] } } } });
  }
  return or.length ? { OR: or } : { id: { in: [] } };
}

async function scopedActivity(db: TenantDb, session: SessionData, id: string, action: Action) {
  const where = await activityWhere(db, session, action);
  if (!where) throw forbidden(action === "view" ? "لا تملك صلاحية عرض الأنشطة" : "لا تملك صلاحية تعديل هذا النشاط");
  const a = await db.activity.findFirst({ where: { ...where, id, deletedAt: null } });
  if (!a) throw notFound("النشاط غير موجود أو خارج نطاق صلاحيتك");
  return a;
}

export interface ActivityInput {
  title: string;
  kind: keyof typeof ACTIVITY_KIND;
  branchId?: string | null;
  description?: string | null;
  startAt?: Date | null;
  endAt?: Date | null;
  location?: string | null;
  supervisorId?: string | null;
  capacity?: number | null;
  feeMinor?: number | null;
  requiresConsent?: boolean;
  gradeIds?: string[];
}

function checkBranchScope(session: SessionData, action: Action, branchId: string | null | undefined) {
  const scope = resolveScope(session.access, "activities", action);
  if (!scope) throw forbidden();
  if (scope.kind === "all") return;
  if (!branchId) throw forbidden("أنشطة المدرسة العامة (لكل الفروع) من صلاحية الإدارة العليا");
  if (!scope.branchIds.includes(branchId)) throw forbidden("الفرع خارج نطاق صلاحيتك");
}

export async function createActivity(db: TenantDb, session: SessionData, input: ActivityInput) {
  checkBranchScope(session, "create", input.branchId);
  const title = input.title.trim();
  if (!title) throw badRequest("عنوان النشاط مطلوب");
  if (input.startAt && input.endAt && input.endAt < input.startAt) throw badRequest("النهاية قبل البداية");
  const activity = await db.activity.create({
    data: {
      tenantId: session.tenant.id,
      number: await nextNumber(db, session.tenant.id, "activity"),
      title,
      kind: input.kind,
      status: "PLANNED",
      branchId: input.branchId ?? null,
      description: input.description?.trim() || null,
      startAt: input.startAt ?? null,
      endAt: input.endAt ?? null,
      location: input.location?.trim() || null,
      supervisorId: input.supervisorId ?? null,
      capacity: input.capacity ?? null,
      feeMinor: input.feeMinor ?? null,
      requiresConsent: input.requiresConsent ?? input.kind === "TRIP",
      gradeIds: input.gradeIds ?? [],
      createdById: session.user.id,
      updatedById: session.user.id,
    },
  });
  if (input.supervisorId && input.supervisorId !== session.user.id) {
    await notify(db, { tenantId: session.tenant.id, userIds: [input.supervisorId], type: "ASSIGNMENT", title: `كُلّفت بالإشراف على «${title}»`, link: `/activities/${activity.id}`, actorId: session.user.id, entityType: "Activity", entityId: activity.id });
  }
  if (activity.startAt) await syncCalendar(db, session, activity.id);
  return activity;
}

export async function updateActivity(db: TenantDb, session: SessionData, id: string, patch: Partial<ActivityInput> & { status?: "PLANNED" | "REGISTRATION" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" }) {
  const a = await scopedActivity(db, session, id, "update");
  if (patch.branchId !== undefined && patch.branchId !== a.branchId) checkBranchScope(session, "update", patch.branchId);
  const data: Prisma.ActivityUncheckedUpdateInput = { updatedById: session.user.id };
  if (patch.title !== undefined) {
    if (!patch.title.trim()) throw badRequest("عنوان النشاط مطلوب");
    data.title = patch.title.trim();
  }
  if (patch.kind !== undefined) data.kind = patch.kind;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.branchId !== undefined) data.branchId = patch.branchId;
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.startAt !== undefined) data.startAt = patch.startAt;
  if (patch.endAt !== undefined) data.endAt = patch.endAt;
  if (patch.location !== undefined) data.location = patch.location?.trim() || null;
  if (patch.supervisorId !== undefined) data.supervisorId = patch.supervisorId;
  if (patch.capacity !== undefined) {
    if (patch.capacity !== null) {
      const registered = await db.activityRegistration.count({ where: { activityId: id, status: { in: ["REGISTERED", "ATTENDED"] } } });
      if (patch.capacity < registered) throw badRequest(`لا يمكن خفض الطاقة إلى أقل من المسجلين (${registered})`);
    }
    data.capacity = patch.capacity;
  }
  if (patch.feeMinor !== undefined) data.feeMinor = patch.feeMinor;
  if (patch.requiresConsent !== undefined) data.requiresConsent = patch.requiresConsent;
  if (patch.gradeIds !== undefined) data.gradeIds = patch.gradeIds;
  const start = (data.startAt as Date | null | undefined) ?? a.startAt;
  const end = (data.endAt as Date | null | undefined) ?? a.endAt;
  if (start && end && end < start) throw badRequest("النهاية قبل البداية");
  const updated = await db.activity.update({ where: { id }, data });
  if (patch.requiresConsent === true) {
    await db.activityRegistration.updateMany({ where: { activityId: id, consentStatus: "NOT_REQUIRED" }, data: { consentStatus: "PENDING" } });
  }
  if (patch.capacity !== undefined) await promoteWaitlist(db, id);
  if (a.calendarEventId || patch.startAt) await syncCalendar(db, session, id);
  return updated;
}

export async function trashActivity(db: TenantDb, session: SessionData, id: string) {
  const a = await scopedActivity(db, session, id, "delete");
  await db.activity.update({ where: { id }, data: { deletedAt: new Date(), updatedById: session.user.id } });
  if (a.calendarEventId) await db.calendarEvent.updateMany({ where: { id: a.calendarEventId }, data: { deletedAt: new Date() } });
  return { ok: true };
}

export async function restoreActivity(db: TenantDb, session: SessionData, id: string) {
  const where = await activityWhere(db, session, "delete");
  if (!where) throw forbidden();
  const a = await db.activity.findFirst({ where: { ...where, id, deletedAt: { not: null } } });
  if (!a) throw notFound();
  await db.activity.update({ where: { id }, data: { deletedAt: null, updatedById: session.user.id } });
  if (a.calendarEventId) await db.calendarEvent.updateMany({ where: { id: a.calendarEventId }, data: { deletedAt: null } });
  return { ok: true };
}

/** إنشاء/تحديث حدث التقويم المرتبط بالنشاط */
export async function syncCalendar(db: TenantDb, session: SessionData, id: string) {
  const a = await db.activity.findFirst({ where: { id } });
  if (!a) throw notFound();
  if (!a.startAt) throw badRequest("حدّد موعد النشاط أولاً");
  const end = a.endAt ?? new Date(a.startAt.getTime() + 2 * 3_600_000);
  const data = { title: `${ACTIVITY_KIND[a.kind].label}: ${a.title}`, description: a.description, category: "ACTIVITY" as const, location: a.location, startAt: a.startAt, endAt: end, allDay: false, branchId: a.branchId, updatedById: session.user.id, deletedAt: a.status === "CANCELLED" ? new Date() : null };
  const existing = a.calendarEventId ? await db.calendarEvent.findFirst({ where: { id: a.calendarEventId } }) : null;
  if (existing) {
    await db.calendarEvent.update({ where: { id: existing.id }, data });
    return { eventId: existing.id };
  }
  const ev = await db.calendarEvent.create({ data: { tenantId: session.tenant.id, ...data, createdById: session.user.id } });
  await db.activity.update({ where: { id }, data: { calendarEventId: ev.id } });
  return { eventId: ev.id };
}

async function seatsTaken(db: TenantDb, id: string) {
  return db.activityRegistration.count({ where: { activityId: id, status: { in: ["REGISTERED", "ATTENDED"] } } });
}

/** ترقية أول المنتظرين عند توفر مقعد */
async function promoteWaitlist(db: TenantDb, id: string) {
  const a = await db.activity.findFirst({ where: { id } });
  if (!a) return 0;
  let free = a.capacity === null ? Number.POSITIVE_INFINITY : a.capacity - (await seatsTaken(db, id));
  if (free <= 0) return 0;
  const waiting = await db.activityRegistration.findMany({ where: { activityId: id, status: "WAITLIST" }, orderBy: { createdAt: "asc" } });
  let promoted = 0;
  for (const w of waiting) {
    if (free <= 0) break;
    await db.activityRegistration.update({ where: { id: w.id }, data: { status: "REGISTERED" } });
    free--;
    promoted++;
  }
  return promoted;
}

export async function getActivity(db: TenantDb, session: SessionData, id: string) {
  const a = await scopedActivity(db, session, id, "view");
  const sw = await studentWhere(db, session, "activities", "view");
  const regs = await db.activityRegistration.findMany({
    where: { activityId: id, ...(sw ? { student: sw } : { id: { in: [] } }) },
    include: { student: { select: { id: true, fullName: true, academicNumber: true, photoUrl: true, grade: { select: { name: true } }, section: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const [supervisor, branch, grades, createdBy, event] = await Promise.all([
    a.supervisorId ? db.user.findFirst({ where: { id: a.supervisorId }, select: { id: true, name: true } }) : null,
    a.branchId ? db.branch.findFirst({ where: { id: a.branchId }, select: { id: true, name: true } }) : null,
    a.gradeIds.length ? db.grade.findMany({ where: { id: { in: a.gradeIds } }, select: { id: true, name: true } }) : [],
    a.createdById ? db.user.findFirst({ where: { id: a.createdById }, select: { name: true } }) : null,
    a.calendarEventId ? db.calendarEvent.findFirst({ where: { id: a.calendarEventId, deletedAt: null }, select: { id: true } }) : null,
  ]);
  const editWhere = await activityWhere(db, session, "update");
  const canEdit = Boolean(editWhere && (await db.activity.count({ where: { ...editWhere, id } })));
  const taken = await seatsTaken(db, id);
  return {
    ...a,
    album: (Array.isArray(a.album) ? a.album : []) as FileValue[],
    supervisor,
    branch,
    grades,
    createdBy: createdBy?.name ?? null,
    calendarSynced: Boolean(event),
    canEdit,
    seats: { taken, capacity: a.capacity, waitlist: regs.filter((r) => r.status === "WAITLIST").length },
    consent: {
      pending: regs.filter((r) => r.consentStatus === "PENDING" && r.status !== "CANCELLED").length,
      granted: regs.filter((r) => r.consentStatus === "GRANTED").length,
      denied: regs.filter((r) => r.consentStatus === "DENIED").length,
    },
    registrations: regs.map((r) => ({ id: r.id, status: r.status, consentStatus: r.consentStatus, consentBy: r.consentBy, consentAt: r.consentAt, createdAt: r.createdAt, student: r.student })),
  };
}

/** الطلاب المؤهلون للتسجيل (ضمن النطاق والصفوف المستهدفة وفرع النشاط، وغير المسجلين) */
export async function eligibleStudents(db: TenantDb, session: SessionData, id: string, input: { q?: string; sectionId?: string | null }) {
  const a = await scopedActivity(db, session, id, "update");
  const where = await requireStudentWhere(db, session, "students", "view");
  const registered = await db.activityRegistration.findMany({ where: { activityId: id }, select: { studentId: true } });
  const q = input.q?.trim();
  return db.student.findMany({
    where: {
      AND: [where],
      status: "ACTIVE",
      deletedAt: null,
      id: { notIn: registered.map((r) => r.studentId) },
      ...(a.branchId ? { branchId: a.branchId } : {}),
      ...(a.gradeIds.length ? { gradeId: { in: a.gradeIds } } : {}),
      ...(input.sectionId ? { sectionId: input.sectionId } : {}),
      ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { academicNumber: { startsWith: q } }] } : {}),
    },
    select: { id: true, fullName: true, academicNumber: true, photoUrl: true, grade: { select: { name: true } }, section: { select: { id: true, name: true } } },
    orderBy: [{ gradeId: "asc" }, { fullName: "asc" }],
    take: 200,
  });
}

export async function registerStudents(db: TenantDb, session: SessionData, id: string, studentIds: string[]) {
  const a = await scopedActivity(db, session, id, "update");
  if (a.status === "COMPLETED" || a.status === "CANCELLED") throw badRequest("النشاط منتهٍ أو ملغى");
  const eligible = await eligibleStudents(db, session, id, {});
  const allowed = new Set(eligible.map((s) => s.id));
  const bad = studentIds.filter((s) => !allowed.has(s));
  if (bad.length) throw badRequest("بعض الطلاب غير مؤهلين لهذا النشاط (الصف أو الفرع) أو مسجلون مسبقاً");
  let free = a.capacity === null ? Number.POSITIVE_INFINITY : a.capacity - (await seatsTaken(db, id));
  let registered = 0;
  let waitlisted = 0;
  for (const studentId of studentIds) {
    const status = free > 0 ? "REGISTERED" : "WAITLIST";
    if (status === "REGISTERED") {
      free--;
      registered++;
    } else waitlisted++;
    await db.activityRegistration.create({ data: { tenantId: session.tenant.id, activityId: id, studentId, status, consentStatus: a.requiresConsent ? "PENDING" : "NOT_REQUIRED", createdById: session.user.id } });
  }
  return { registered, waitlisted };
}

export async function updateRegistration(db: TenantDb, session: SessionData, regId: string, patch: { status?: "REGISTERED" | "WAITLIST" | "CANCELLED" | "ATTENDED"; consentStatus?: "PENDING" | "GRANTED" | "DENIED"; consentBy?: string | null }) {
  const reg = await db.activityRegistration.findFirst({ where: { id: regId } });
  if (!reg) throw notFound();
  const a = await scopedActivity(db, session, reg.activityId, "update");
  const data: Prisma.ActivityRegistrationUncheckedUpdateInput = {};
  if (patch.status) {
    if (patch.status === "REGISTERED" && reg.status === "WAITLIST" && a.capacity !== null && (await seatsTaken(db, a.id)) >= a.capacity) throw badRequest("لا توجد مقاعد متاحة");
    if (patch.status === "ATTENDED" && a.requiresConsent && reg.consentStatus !== "GRANTED") throw badRequest("لم تُسجَّل موافقة ولي الأمر");
    data.status = patch.status;
  }
  if (patch.consentStatus) {
    if (!a.requiresConsent) throw badRequest("النشاط لا يتطلب موافقة");
    data.consentStatus = patch.consentStatus;
    data.consentAt = patch.consentStatus === "PENDING" ? null : new Date();
    data.consentBy = patch.consentStatus === "PENDING" ? null : patch.consentBy?.trim() || session.user.name;
    if (patch.consentStatus === "DENIED") data.status = "CANCELLED";
  }
  await db.activityRegistration.update({ where: { id: regId }, data });
  if (data.status === "CANCELLED") await promoteWaitlist(db, a.id);
  return { ok: true };
}

/** إرسال طلب الموافقة لأولياء أمور المسجلين الذين لم يردّوا */
export async function requestConsents(db: TenantDb, session: SessionData, id: string) {
  const a = await scopedActivity(db, session, id, "update");
  if (!a.requiresConsent) throw badRequest("النشاط لا يتطلب موافقة");
  const pending = await db.activityRegistration.findMany({ where: { activityId: id, consentStatus: "PENDING", status: { not: "CANCELLED" } }, include: { student: { select: { id: true, fullName: true } } } });
  const date = a.startAt ? a.startAt.toISOString().slice(0, 10) : "يُحدّد لاحقاً";
  let messages = 0;
  for (const r of pending) messages += await messageGuardians(db, session, r.student.id, "activity_consent", { student: r.student.fullName, activity: a.title, date }, { link: `/activities/${a.id}`, title: `طلب موافقة: ${a.title}` });
  return { students: pending.length, messages };
}

export async function addPhotos(db: TenantDb, session: SessionData, id: string, fileIds: string[]) {
  const a = await scopedActivity(db, session, id, "update");
  const files = await db.fileObject.findMany({ where: { id: { in: fileIds } } });
  const images = files.filter((f) => f.mime.startsWith("image/"));
  if (!images.length) throw badRequest("الألبوم يقبل الصور فقط");
  const album = (Array.isArray(a.album) ? a.album : []) as FileValue[];
  const next = [...album, ...images.filter((f) => !album.some((x) => x.id === f.id)).map((f) => ({ id: f.id, name: f.name, url: `/api/files/${f.id}`, size: f.size, mime: f.mime }))];
  await db.activity.update({ where: { id }, data: { album: next as Prisma.InputJsonValue, cover: a.cover ?? next[0]?.url ?? null, updatedById: session.user.id } });
  return { count: next.length };
}

export async function removePhoto(db: TenantDb, session: SessionData, id: string, fileId: string) {
  const a = await scopedActivity(db, session, id, "update");
  const album = ((Array.isArray(a.album) ? a.album : []) as FileValue[]).filter((f) => f.id !== fileId);
  const removedUrl = `/api/files/${fileId}`;
  await db.activity.update({ where: { id }, data: { album: album as Prisma.InputJsonValue, cover: a.cover === removedUrl ? (album[0]?.url ?? null) : a.cover, updatedById: session.user.id } });
  return { count: album.length };
}

export async function setCover(db: TenantDb, session: SessionData, id: string, url: string | null) {
  await scopedActivity(db, session, id, "update");
  await db.activity.update({ where: { id }, data: { cover: url, updatedById: session.user.id } });
  return { ok: true };
}

/** أنشطة الطالب (تبويب ملف الطالب) */
export async function studentActivities(db: TenantDb, session: SessionData, studentId: string) {
  const sw = await requireStudentWhere(db, session, "activities", "view");
  const st = await db.student.findFirst({ where: { ...sw, id: studentId } });
  if (!st) throw notFound("الطالب غير موجود أو خارج نطاق صلاحيتك");
  const regs = await db.activityRegistration.findMany({
    where: { studentId, activity: { deletedAt: null } },
    include: { activity: { select: { id: true, title: true, kind: true, status: true, startAt: true, endAt: true, location: true, requiresConsent: true } } },
    orderBy: { createdAt: "desc" },
  });
  return regs.map((r) => ({ id: r.id, status: r.status, consentStatus: r.consentStatus, activity: r.activity }));
}

export async function activitiesOverview(db: TenantDb, session: SessionData) {
  const where = await activityWhere(db, session, "view");
  if (!where) throw forbidden();
  const now = new Date();
  const [upcoming, open, pendingConsent, participants] = await Promise.all([
    db.activity.count({ where: { ...where, deletedAt: null, status: { notIn: ["CANCELLED", "COMPLETED"] }, startAt: { gte: now } } }),
    db.activity.count({ where: { ...where, deletedAt: null, status: "REGISTRATION" } }),
    db.activityRegistration.count({ where: { consentStatus: "PENDING", status: { not: "CANCELLED" }, activity: { ...where, deletedAt: null } } }),
    db.activityRegistration.findMany({ where: { status: { in: ["REGISTERED", "ATTENDED"] }, activity: { ...where, deletedAt: null } }, select: { studentId: true }, distinct: ["studentId"] }),
  ]);
  return { upcoming, open, pendingConsent, participants: participants.length };
}
