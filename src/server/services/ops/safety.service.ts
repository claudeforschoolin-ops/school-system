/**
 * الأمن والسلامة: سجل الزوار ببطاقة QR (تسجيل مسبق، دخول وخروج بالمسح)، استلام الطلاب من ولي الأمر أو مفوَّض مصرّح
 * (بصورة وتحقق من الهوية، والاستلام المبكر بسبب وإشعار)، سجل الحوادث، خطط الإخلاء، وفحوص الحريق والطوارئ الدورية.
 * العيادة المدرسية: الزيارات (الشكوى والملاحظات مشفّرة)، الأدوية ومخزونها وصلاحيتها، وإشعار ولي الأمر.
 */
import { randomBytes } from "node:crypto";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { decryptField, encryptField } from "@/server/auth/crypto";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { notify } from "@/server/services/notifications.service";
import { idFingerprint, normalizeIdNumber } from "@/server/pii";
import { branchFilter, canOps, dateOnly, isoOf, nextNo, requireOps, todayOf } from "./common";

async function familyStudentIds(db: TenantDb, session: SessionData) {
  const rows = await db.student.findMany({ where: { deletedAt: null, OR: [{ userId: session.user.id }, { guardians: { some: { guardian: { userId: session.user.id } } } }] }, select: { id: true } });
  return rows.map((r) => r.id);
}

async function guardianUserIds(db: TenantDb, studentId: string) {
  const rows = await db.studentGuardian.findMany({ where: { studentId }, include: { guardian: { select: { userId: true } } } });
  return [...new Set(rows.map((r) => r.guardian.userId).filter((x): x is string => Boolean(x)))];
}

const badge = () => randomBytes(6).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 8);
const dayRange = (iso: string) => ({ gte: new Date(dateOnly(iso).getTime() - 14 * 3_600_000), lt: new Date(dateOnly(iso).getTime() + 38 * 3_600_000) });

// ---------------------------------------------------------------------
// الزوار
// ---------------------------------------------------------------------

export async function listVisitors(db: TenantDb, session: SessionData, input: { date?: string | null; q?: string | null }) {
  requireOps(session, "safety", "view");
  const date = input.date ?? todayOf(session);
  const q = input.q?.trim();
  const tz = session.tenant.timezone;
  const local = (d: Date | null) => (d ? new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d) : null);
  const rows = await db.visitor.findMany({ where: { ...branchFilter(session, "safety"), OR: [{ checkInAt: dayRange(date) }, { expectedAt: dayRange(date) }, { checkInAt: { not: null }, checkOutAt: null }], ...(q ? { AND: [{ OR: [{ fullName: { contains: q, mode: "insensitive" } }, { badgeCode: q.toUpperCase() }, { phone: { contains: q } }] }] } : {}) }, orderBy: [{ checkInAt: "desc" }, { expectedAt: "asc" }] });
  const filtered = rows.filter((v) => local(v.checkInAt) === date || local(v.expectedAt) === date || (v.checkInAt && !v.checkOutAt));
  return {
    date,
    visitors: filtered.map((v) => ({ ...v, idHash: undefined, inside: Boolean(v.checkInAt && !v.checkOutAt) })),
    stats: { inside: filtered.filter((v) => v.checkInAt && !v.checkOutAt).length, today: filtered.filter((v) => local(v.checkInAt) === date).length, expected: filtered.filter((v) => !v.checkInAt).length },
    canEdit: canOps(session, "safety", "create"),
  };
}

export async function registerVisitor(db: TenantDb, session: SessionData, input: { fullName: string; idNumber?: string | null; phone?: string | null; company?: string | null; purpose: string; hostName?: string | null; hostUserId?: string | null; branchId?: string | null; vehiclePlate?: string | null; expectedAt?: string | null; checkInNow: boolean; notes?: string | null }) {
  requireOps(session, "safety", "create");
  if (input.fullName.trim().length < 3) throw badRequest("اسم الزائر مطلوب");
  if (!input.purpose.trim()) throw badRequest("سبب الزيارة مطلوب");
  const id = input.idNumber ? normalizeIdNumber(input.idNumber) : null;
  const v = await db.visitor.create({
    data: {
      tenantId: session.tenant.id,
      number: await nextNo(db, session, "visitor"),
      fullName: input.fullName.trim(),
      idLast4: id ? id.slice(-4) : null,
      idHash: id ? idFingerprint(session.tenant.id, id) : null,
      phone: input.phone || null,
      company: input.company || null,
      purpose: input.purpose.trim(),
      hostName: input.hostName || null,
      hostUserId: input.hostUserId || null,
      branchId: input.branchId || null,
      vehiclePlate: input.vehiclePlate || null,
      badgeCode: badge(),
      expectedAt: input.expectedAt ? new Date(input.expectedAt) : null,
      checkInAt: input.checkInNow ? new Date() : null,
      notes: input.notes || null,
      createdById: session.user.id,
    },
  });
  if (input.checkInNow && input.hostUserId) await notify(db, { tenantId: session.tenant.id, userIds: [input.hostUserId], type: "SYSTEM", title: `زائر لك في الاستقبال: ${v.fullName}`, body: v.purpose, link: "/safety/visitors", actorId: session.user.id, entityType: "Visitor", entityId: v.id });
  return v;
}

/** مسح بطاقة الزائر عند البوابة: دخول إن لم يدخل، وخروج إن كان بالداخل */
export async function scanVisitor(db: TenantDb, session: SessionData, code: string) {
  requireOps(session, "safety", "create");
  const v = await db.visitor.findFirst({ where: { badgeCode: code.trim().toUpperCase() } });
  if (!v) throw notFound("بطاقة غير معروفة");
  if (v.checkOutAt) throw badRequest("البطاقة مستخدمة وانتهت الزيارة");
  if (!v.checkInAt) {
    const u = await db.visitor.update({ where: { id: v.id }, data: { checkInAt: new Date() } });
    if (v.hostUserId) await notify(db, { tenantId: session.tenant.id, userIds: [v.hostUserId], type: "SYSTEM", title: `وصل زائرك: ${v.fullName}`, link: "/safety/visitors", actorId: session.user.id, entityType: "Visitor", entityId: v.id });
    return { action: "IN" as const, visitor: u };
  }
  return { action: "OUT" as const, visitor: await db.visitor.update({ where: { id: v.id }, data: { checkOutAt: new Date() } }) };
}

export async function checkOutVisitor(db: TenantDb, session: SessionData, id: string) {
  requireOps(session, "safety", "create");
  const v = await db.visitor.findFirst({ where: { id } });
  if (!v || !v.checkInAt || v.checkOutAt) throw badRequest("الزائر ليس بالداخل");
  return db.visitor.update({ where: { id }, data: { checkOutAt: new Date() } });
}

// ---------------------------------------------------------------------
// استلام الطلاب
// ---------------------------------------------------------------------

/** بيانات الاستلام لطالب: أولياء الأمور والمفوضون المصرح لهم */
export async function pickupInfo(db: TenantDb, session: SessionData, studentId: string) {
  const staff = canOps(session, "safety", "view");
  if (!staff && !(await familyStudentIds(db, session)).includes(studentId)) throw forbidden();
  const s = await db.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { id: true, fullName: true, photoUrl: true, academicNumber: true, grade: { select: { name: true } }, section: { select: { name: true } }, guardians: { include: { guardian: { select: { id: true, name: true, phone: true, nationalIdLast4: true } } } } } });
  if (!s) throw notFound("الطالب غير موجود");
  const [authorized, recent] = await Promise.all([db.authorizedPickup.findMany({ where: { studentId, isActive: true }, orderBy: { createdAt: "asc" } }), staff ? db.studentPickup.findMany({ where: { studentId }, orderBy: { at: "desc" }, take: 10 }) : []]);
  const today = todayOf(session);
  return {
    student: s,
    guardians: s.guardians.map((g) => ({ id: g.guardian.id, name: g.guardian.name, phone: g.guardian.phone, relation: g.relation, canPickup: g.canPickup ?? true, idLast4: g.guardian.nationalIdLast4 })),
    authorized: authorized.map((a) => ({ ...a, idHash: undefined, expired: Boolean(a.validUntil && isoOf(a.validUntil)! < today) })),
    recent,
    canRecord: staff && canOps(session, "safety", "create"),
    canManageAuthorized: staff || true,
  };
}

export async function saveAuthorized(db: TenantDb, session: SessionData, input: { id?: string | null; studentId: string; name: string; relation: string; idNumber?: string | null; phone?: string | null; photoUrl?: string | null; validUntil?: string | null; isActive: boolean }) {
  const staff = canOps(session, "safety", "create");
  if (!staff && !(await familyStudentIds(db, session)).includes(input.studentId)) throw forbidden("تفويض الاستلام لأبنائك فقط");
  if (input.name.trim().length < 3) throw badRequest("اسم المفوَّض مطلوب");
  const id = input.idNumber ? normalizeIdNumber(input.idNumber) : null;
  const data = { name: input.name.trim(), relation: input.relation.trim(), phone: input.phone || null, photoUrl: input.photoUrl || null, validUntil: input.validUntil ? dateOnly(input.validUntil) : null, isActive: input.isActive, ...(id ? { idLast4: id.slice(-4), idHash: idFingerprint(session.tenant.id, id) } : {}) };
  if (input.id) {
    const a = await db.authorizedPickup.findFirst({ where: { id: input.id, studentId: input.studentId } });
    if (!a) throw notFound("التفويض غير موجود");
    return db.authorizedPickup.update({ where: { id: a.id }, data });
  }
  const created = await db.authorizedPickup.create({ data: { tenantId: session.tenant.id, studentId: input.studentId, createdById: session.user.id, ...data } });
  // إشعار بقية أولياء الأمور بالتفويض الجديد
  const ids = await guardianUserIds(db, input.studentId);
  await notify(db, { tenantId: session.tenant.id, userIds: ids, type: "SYSTEM", title: `تفويض استلام جديد: ${created.name}`, body: created.relation, link: `/safety/pickups/${input.studentId}`, actorId: session.user.id, entityType: "AuthorizedPickup", entityId: created.id });
  return created;
}

/**
 * تسجيل الاستلام: المستلم وليّ أمر مرتبط أو مفوَّض ساري؛ رقم الهوية (إن أُدخل) يُطابق ببصمته.
 * الاستلام المبكر يتطلب سبباً ويُشعر أولياء الأمور.
 */
export async function recordPickup(db: TenantDb, session: SessionData, input: { studentId: string; guardianId?: string | null; authorizedPickupId?: string | null; verification: "ID_CHECK" | "PHOTO" | "CODE"; idNumber?: string | null; early: boolean; reason?: string | null; notes?: string | null }) {
  requireOps(session, "safety", "create");
  const info = await pickupInfo(db, session, input.studentId);
  let name: string;
  let relation: string;
  if (input.guardianId) {
    const g = info.guardians.find((x) => x.id === input.guardianId);
    if (!g) throw badRequest("ولي الأمر غير مرتبط بالطالب");
    if (g.canPickup === false) throw forbidden("ولي الأمر هذا غير مصرح له بالاستلام");
    name = g.name;
    relation = g.relation;
  } else if (input.authorizedPickupId) {
    const a = await db.authorizedPickup.findFirst({ where: { id: input.authorizedPickupId, studentId: input.studentId, isActive: true } });
    if (!a) throw badRequest("المفوَّض غير مصرح له بهذا الطالب");
    if (a.validUntil && isoOf(a.validUntil)! < todayOf(session)) throw badRequest("انتهت صلاحية التفويض");
    if (input.verification === "ID_CHECK") {
      if (!input.idNumber) throw badRequest("أدخل رقم هوية المستلم للمطابقة");
      if (a.idHash && idFingerprint(session.tenant.id, normalizeIdNumber(input.idNumber)) !== a.idHash) throw forbidden("رقم الهوية لا يطابق المفوَّض المسجل — لا تسلّم الطالب");
    }
    name = a.name;
    relation = a.relation;
  } else throw badRequest("اختر المستلم من القائمة المصرح لها");
  if (input.early && !input.reason?.trim()) throw badRequest("اذكر سبب الاستلام المبكر");
  const p = await db.studentPickup.create({ data: { tenantId: session.tenant.id, studentId: input.studentId, guardianId: input.guardianId ?? null, authorizedPickupId: input.authorizedPickupId ?? null, pickedByName: name, relation, verification: input.verification, early: input.early, reason: input.reason ?? null, recordedById: session.user.id, notes: input.notes ?? null } });
  const ids = await guardianUserIds(db, input.studentId);
  await notify(db, { tenantId: session.tenant.id, userIds: ids, type: "SYSTEM", title: `${input.early ? "استلام مبكر" : "تم استلام"} ${info.student.fullName}`, body: `بواسطة ${name} (${relation})${input.reason ? ` — ${input.reason}` : ""}`, link: `/safety/pickups/${input.studentId}`, actorId: session.user.id, entityType: "StudentPickup", entityId: p.id });
  return p;
}

export async function pickupsToday(db: TenantDb, session: SessionData, input: { date?: string | null }) {
  requireOps(session, "safety", "view");
  const date = input.date ?? todayOf(session);
  const rows = await db.studentPickup.findMany({ where: { at: dayRange(date) }, orderBy: { at: "desc" } });
  const tz = session.tenant.timezone;
  const list = rows.filter((r) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(r.at) === date);
  const students = await db.student.findMany({ where: { id: { in: list.map((r) => r.studentId) } }, select: { id: true, fullName: true, grade: { select: { name: true } } } });
  return { date, pickups: list.map((r) => ({ ...r, student: students.find((s) => s.id === r.studentId)?.fullName ?? "", grade: students.find((s) => s.id === r.studentId)?.grade.name ?? "" })), early: list.filter((r) => r.early).length };
}

// ---------------------------------------------------------------------
// الحوادث
// ---------------------------------------------------------------------

export async function listIncidents(db: TenantDb, session: SessionData, input: { status?: string | null }) {
  requireOps(session, "safety", "view");
  const [rows, users, branches] = await Promise.all([db.safetyIncident.findMany({ where: { ...branchFilter(session, "safety"), ...(input.status ? { status: input.status } : {}) }, orderBy: { occurredAt: "desc" } }), db.user.findMany({ select: { id: true, name: true } }), db.branch.findMany({ select: { id: true, name: true } })]);
  return { incidents: rows.map((r) => ({ ...r, reporter: users.find((u) => u.id === r.reportedById)?.name ?? null, branch: branches.find((b) => b.id === r.branchId)?.name ?? null })), canEdit: canOps(session, "safety", "create"), canClose: canOps(session, "safety", "update") };
}

export async function saveIncident(db: TenantDb, session: SessionData, input: { id?: string | null; kind: string; severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; occurredAt: string; branchId?: string | null; location: string; description: string; involved: Array<{ type: "STUDENT" | "STAFF" | "OTHER"; id?: string | null; name: string; role?: string | null }>; actionsTaken?: string | null; status?: "OPEN" | "INVESTIGATING" | "CLOSED"; guardiansNotified?: boolean; attachments?: unknown[] }) {
  requireOps(session, "safety", "create");
  if (input.description.trim().length < 10) throw badRequest("صف الحادث بتفصيل كافٍ");
  if (input.status === "CLOSED" && !canOps(session, "safety", "update")) throw forbidden("إغلاق الحادث لمسؤول الأمن والسلامة");
  const data = { kind: input.kind, severity: input.severity, occurredAt: new Date(input.occurredAt), branchId: input.branchId || null, location: input.location.trim(), description: input.description.trim(), involved: input.involved as never, actionsTaken: input.actionsTaken || null, ...(input.status ? { status: input.status, ...(input.status === "CLOSED" ? { closedAt: new Date() } : {}) } : {}), ...(input.guardiansNotified !== undefined ? { guardiansNotified: input.guardiansNotified } : {}), ...(input.attachments ? { attachments: input.attachments as never } : {}) };
  const saved = input.id ? await db.safetyIncident.update({ where: { id: input.id }, data }) : await db.safetyIncident.create({ data: { tenantId: session.tenant.id, number: await nextNo(db, session, "incident"), reportedById: session.user.id, ...data } });
  if (!input.id && (input.severity === "HIGH" || input.severity === "CRITICAL")) {
    const leaders = await db.userRole.findMany({ where: { role: { key: { in: ["PRINCIPAL", "OWNER", "VP_STUDENTS"] } } }, select: { userId: true } });
    await notify(db, { tenantId: session.tenant.id, userIds: leaders.map((l) => l.userId), type: "SYSTEM", title: `حادث ${input.severity === "CRITICAL" ? "حرج" : "خطير"}: ${saved.location}`, body: saved.description.slice(0, 140), link: `/safety/incidents`, actorId: session.user.id, entityType: "SafetyIncident", entityId: saved.id });
  }
  return saved;
}

// ---------------------------------------------------------------------
// فحوص الطوارئ وخطط الإخلاء
// ---------------------------------------------------------------------

export async function listDrills(db: TenantDb, session: SessionData) {
  requireOps(session, "safety", "view");
  const [drills, plans, branches] = await Promise.all([db.safetyDrill.findMany({ where: branchFilter(session, "safety"), orderBy: { scheduledAt: "desc" } }), db.evacuationPlan.findMany({ where: branchFilter(session, "safety"), orderBy: { createdAt: "asc" } }), db.branch.findMany({ select: { id: true, name: true } })]);
  const now = new Date();
  return {
    drills: drills.map((d) => ({ ...d, branch: branches.find((b) => b.id === d.branchId)?.name ?? null, overdue: d.status === "SCHEDULED" && d.scheduledAt < now })),
    plans: plans.map((p) => ({ ...p, branch: branches.find((b) => b.id === p.branchId)?.name ?? null, reviewDue: Boolean(p.nextReview && isoOf(p.nextReview)! <= todayOf(session)) })),
    canEdit: canOps(session, "safety", "update"),
  };
}

export async function saveDrill(db: TenantDb, session: SessionData, input: { id?: string | null; kind: string; branchId?: string | null; scheduledAt: string; conductedAt?: string | null; durationSeconds?: number | null; participants?: number | null; result?: string | null; issues?: string | null; status: "SCHEDULED" | "DONE" | "MISSED" }) {
  requireOps(session, "safety", "update");
  if (input.status === "DONE" && (!input.conductedAt || !input.durationSeconds)) throw badRequest("سجّل وقت التنفيذ ومدة الإخلاء");
  const data = { kind: input.kind, branchId: input.branchId || null, scheduledAt: new Date(input.scheduledAt), conductedAt: input.conductedAt ? new Date(input.conductedAt) : null, durationSeconds: input.durationSeconds ?? null, participants: input.participants ?? null, result: input.result || null, issues: input.issues || null, status: input.status };
  return input.id ? db.safetyDrill.update({ where: { id: input.id }, data }) : db.safetyDrill.create({ data: { tenantId: session.tenant.id, createdById: session.user.id, ...data } });
}

export async function savePlan(db: TenantDb, session: SessionData, input: { id?: string | null; branchId?: string | null; title: string; assemblyPoints?: string | null; description?: string | null; fileUrl?: string | null; reviewedAt?: string | null; nextReview?: string | null }) {
  requireOps(session, "safety", "update");
  const data = { branchId: input.branchId || null, title: input.title.trim(), assemblyPoints: input.assemblyPoints || null, description: input.description || null, fileUrl: input.fileUrl || null, reviewedAt: input.reviewedAt ? dateOnly(input.reviewedAt) : null, nextReview: input.nextReview ? dateOnly(input.nextReview) : null };
  return input.id ? db.evacuationPlan.update({ where: { id: input.id }, data }) : db.evacuationPlan.create({ data: { tenantId: session.tenant.id, ...data } });
}

// ---------------------------------------------------------------------
// العيادة المدرسية
// ---------------------------------------------------------------------

const dec = (v: string | null) => {
  if (!v) return null;
  try {
    return decryptField(v);
  } catch {
    return null;
  }
};

export async function clinicDashboard(db: TenantDb, session: SessionData, input: { date?: string | null; studentId?: string | null }) {
  requireOps(session, "clinic", "view");
  const date = input.date ?? todayOf(session);
  const where = input.studentId ? { studentId: input.studentId } : { visitAt: dayRange(date) };
  const [visits, meds, users] = await Promise.all([db.clinicVisit.findMany({ where, orderBy: { visitAt: "desc" }, include: { dispenses: { include: { medicine: { select: { name: true, unit: true } } } } }, take: 200 }), db.clinicMedicine.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }), db.user.findMany({ select: { id: true, name: true } })]);
  const tz = session.tenant.timezone;
  const list = input.studentId ? visits : visits.filter((v) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(v.visitAt) === date);
  const soon = dateOnly(todayOf(session)).getTime() + 60 * 86_400_000;
  return {
    date,
    visits: list.map((v) => ({ id: v.id, number: v.number, patientName: v.patientName, studentId: v.studentId, employeeId: v.employeeId, visitAt: v.visitAt, complaint: dec(v.complaintEnc), notes: dec(v.notesEnc), temperatureTenths: v.temperatureTenths, outcome: v.outcome, guardianNotified: v.guardianNotified, nurse: users.find((u) => u.id === v.nurseId)?.name ?? null, medicines: v.dispenses.map((d) => `${d.medicine.name} × ${d.quantity} ${d.medicine.unit}`) })),
    medicines: meds.map((m) => ({ ...m, low: m.quantity <= m.minQty, expiring: Boolean(m.expiryDate && m.expiryDate.getTime() <= soon), expired: Boolean(m.expiryDate && isoOf(m.expiryDate)! < todayOf(session)) })),
    stats: { today: list.length, sentHome: list.filter((v) => v.outcome === "SENT_HOME" || v.outcome === "REFERRED" || v.outcome === "AMBULANCE").length },
    canEdit: canOps(session, "clinic", "create"),
  };
}

/** معلومات صحية مختصرة للطالب عند الزيارة (فصيلة الدم والأمراض والحساسية) */
export async function patientInfo(db: TenantDb, session: SessionData, studentId: string) {
  requireOps(session, "clinic", "view");
  const s = await db.student.findFirst({ where: { id: studentId, deletedAt: null }, select: { id: true, fullName: true, academicNumber: true, bloodType: true, chronicConditions: true, allergies: true, grade: { select: { name: true } }, section: { select: { name: true } } } });
  if (!s) throw notFound("الطالب غير موجود");
  const visits = await db.clinicVisit.count({ where: { studentId, visitAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } });
  return { ...s, visits30: visits };
}

export async function recordVisit(db: TenantDb, session: SessionData, input: { studentId?: string | null; employeeId?: string | null; patientName?: string | null; complaint: string; notes?: string | null; temperatureTenths?: number | null; outcome: "RETURNED_TO_CLASS" | "RESTED" | "SENT_HOME" | "REFERRED" | "AMBULANCE"; notifyGuardian: boolean; medicines: Array<{ medicineId: string; quantity: number }> }) {
  requireOps(session, "clinic", "create");
  if (input.complaint.trim().length < 3) throw badRequest("اكتب الشكوى");
  if (input.temperatureTenths !== null && input.temperatureTenths !== undefined && (input.temperatureTenths < 340 || input.temperatureTenths > 430)) throw badRequest("درجة حرارة غير منطقية");
  const student = input.studentId ? await db.student.findFirst({ where: { id: input.studentId }, select: { id: true, fullName: true, allergies: true } }) : null;
  const emp = input.employeeId ? await db.employee.findFirst({ where: { id: input.employeeId }, select: { fullName: true } }) : null;
  const name = student?.fullName ?? emp?.fullName ?? input.patientName?.trim();
  if (!name) throw badRequest("اختر المريض");
  const visit = await db.$transaction(async (tx) => {
    for (const m of input.medicines) {
      if (m.quantity <= 0) throw badRequest("كمية الدواء موجبة");
      const med = await tx.clinicMedicine.findFirst({ where: { id: m.medicineId, isActive: true } });
      if (!med) throw notFound("الدواء غير موجود");
      if (med.quantity < m.quantity) throw badRequest(`رصيد ${med.name} ${med.quantity} فقط`);
      if (med.expiryDate && isoOf(med.expiryDate)! < todayOf(session)) throw badRequest(`${med.name} منتهي الصلاحية`);
      await tx.clinicMedicine.update({ where: { id: med.id }, data: { quantity: { decrement: m.quantity } } });
    }
    return tx.clinicVisit.create({ data: { tenantId: session.tenant.id, number: await nextNo(tx as unknown as TenantDb, session, "clinic"), studentId: student?.id ?? null, employeeId: input.employeeId ?? null, patientName: name, complaintEnc: encryptField(input.complaint.trim()), notesEnc: input.notes ? encryptField(input.notes.trim()) : null, temperatureTenths: input.temperatureTenths ?? null, outcome: input.outcome, guardianNotified: Boolean(student && input.notifyGuardian), nurseId: session.user.id, dispenses: { create: input.medicines.map((m) => ({ tenantId: session.tenant.id, medicineId: m.medicineId, quantity: m.quantity })) } } });
  });
  if (student && input.notifyGuardian) {
    const ids = await guardianUserIds(db, student.id);
    const outcome = { RETURNED_TO_CLASS: "عاد إلى الفصل", RESTED: "استراح في العيادة", SENT_HOME: "يحتاج الاستلام إلى المنزل", REFERRED: "أُحيل إلى جهة صحية", AMBULANCE: "نُقل بالإسعاف" }[input.outcome];
    // الإشعار لا يتضمن تفاصيل الشكوى (بيانات صحية) — التفاصيل عند التواصل مع العيادة
    await notify(db, { tenantId: session.tenant.id, userIds: ids, type: "SYSTEM", title: `زار ${student.fullName} العيادة المدرسية`, body: outcome, actorId: session.user.id, entityType: "ClinicVisit", entityId: visit.id });
  }
  return visit;
}

export async function saveMedicine(db: TenantDb, session: SessionData, input: { id?: string | null; name: string; form?: string | null; unit: string; quantity: number; minQty: number; expiryDate?: string | null; isActive: boolean }) {
  requireOps(session, "clinic", "update");
  if (input.quantity < 0 || input.minQty < 0) throw badRequest("كميات غير سالبة");
  const data = { name: input.name.trim(), form: input.form || null, unit: input.unit.trim() || "قرص", quantity: input.quantity, minQty: input.minQty, expiryDate: input.expiryDate ? dateOnly(input.expiryDate) : null, isActive: input.isActive };
  return input.id ? db.clinicMedicine.update({ where: { id: input.id }, data }) : db.clinicMedicine.create({ data: { tenantId: session.tenant.id, ...data } });
}
