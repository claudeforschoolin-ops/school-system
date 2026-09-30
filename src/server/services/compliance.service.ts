/**
 * الامتثال وحماية البيانات: سياسة الخصوصية بإصدارات وقبول، موافقات أولياء الأمور والموظفين،
 * مدد الاحتفاظ (معاينة ثم تنفيذ)، وطلبات أصحاب البيانات (اطلاع/تصحيح/حذف/نقل/اعتراض) بمهلة.
 * ---------------------------------------------------------------------
 * - الموافقات والقبول سجلات إلحاقية (مشغّل قاعدة البيانات يمنع تعديلها/حذفها): كل تغيير سجل جديد.
 * - الاحتفاظ لا يمس سجل التدقيق ولا القيود والفواتير (سجلات نظامية)، ويُسجَّل كل تنفيذ.
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { resolveScope } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import { decryptField, encryptField } from "@/server/auth/crypto";
import { rootDb } from "@/server/db/client";
import { createTenantDb, writeAudit, type TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { storage } from "@/server/storage";
import { todayIso } from "./finance/common";
import { readModuleSettings } from "./module-settings.service";
import { notify } from "./notifications.service";
import { nextNumber } from "./sequence.service";

// ---------------------------------------------------------------------
// الصلاحيات
// ---------------------------------------------------------------------

/** مسؤول الامتثال: صلاحية الوحدة على مستوى المدرسة */
function isOfficer(session: SessionData, action: "view" | "update" | "create" = "view") {
  return resolveScope(session.access, "compliance", action)?.kind === "all";
}
function requireOfficer(session: SessionData, action: "view" | "update" | "create" = "view") {
  if (!isOfficer(session, action)) throw forbidden("هذا الإجراء لمسؤول حماية البيانات");
}
function requireAny(session: SessionData) {
  if (!resolveScope(session.access, "compliance", "view")) throw forbidden("ليست لديك صلاحية الخصوصية والموافقات");
}

async function childrenOf(db: TenantDb, userId: string) {
  return db.student.findMany({ where: { deletedAt: null, status: "ACTIVE", guardians: { some: { guardian: { userId } } } }, select: { id: true, fullName: true, grade: { select: { name: true } } }, orderBy: { fullName: "asc" } });
}

function audienceOf(session: SessionData): "GUARDIANS" | "STAFF" {
  return session.roleKeys.some((k) => k !== "PARENT" && k !== "STUDENT") ? "STAFF" : "GUARDIANS";
}

// ---------------------------------------------------------------------
// سياسة الخصوصية
// ---------------------------------------------------------------------

export async function listPolicies(db: TenantDb, session: SessionData) {
  requireOfficer(session);
  const policies = await db.privacyPolicy.findMany({ orderBy: { version: "desc" }, include: { _count: { select: { acceptances: true } } } });
  const [staff, guardians] = await Promise.all([
    db.user.count({ where: { deletedAt: null, status: "ACTIVE", roles: { some: { role: { key: { notIn: ["PARENT", "STUDENT"] } } } } } }),
    db.user.count({ where: { deletedAt: null, status: "ACTIVE", roles: { some: { role: { key: "PARENT" } } } } }),
  ]);
  return policies.map((p) => {
    const eligible = p.audience === "STAFF" ? staff : p.audience === "GUARDIANS" ? guardians : staff + guardians;
    return { ...p, accepted: p._count.acceptances, eligible };
  });
}

export async function savePolicyDraft(db: TenantDb, session: SessionData, input: { id?: string | null; title: string; body: string; changes?: string | null; audience: "ALL" | "GUARDIANS" | "STAFF"; requireAcceptance: boolean }) {
  requireOfficer(session, "update");
  if (input.title.trim().length < 3 || input.body.trim().length < 50) throw badRequest("العنوان والنص مطلوبان (٥٠ حرفاً على الأقل)");
  const data = { title: input.title.trim(), body: input.body.trim(), changes: input.changes?.trim() || null, audience: input.audience, requireAcceptance: input.requireAcceptance };
  if (input.id) {
    const p = await db.privacyPolicy.findFirst({ where: { id: input.id } });
    if (!p) throw notFound("الإصدار غير موجود");
    if (p.status !== "DRAFT") throw badRequest("الإصدار المنشور لا يُعدَّل؛ أنشئ إصداراً جديداً");
    return db.privacyPolicy.update({ where: { id: p.id }, data });
  }
  const last = await db.privacyPolicy.findFirst({ orderBy: { version: "desc" } });
  return db.privacyPolicy.create({ data: { tenantId: session.tenant.id, version: (last?.version ?? 0) + 1, createdById: session.user.id, ...data } });
}

export async function publishPolicy(db: TenantDb, session: SessionData, id: string) {
  requireOfficer(session, "update");
  const p = await db.privacyPolicy.findFirst({ where: { id } });
  if (!p || p.status !== "DRAFT") throw badRequest("يُنشر إصدار المسودة فقط");
  // الإصدار السابق لنفس الجمهور (أو للجميع) يُؤرشف
  await db.privacyPolicy.updateMany({ where: { status: "PUBLISHED", OR: [{ audience: p.audience }, { audience: "ALL" }, ...(p.audience === "ALL" ? [{ audience: { in: ["STAFF", "GUARDIANS"] } }] : [])] }, data: { status: "ARCHIVED" } });
  const published = await db.privacyPolicy.update({ where: { id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  if (p.requireAcceptance) {
    const users = await db.user.findMany({ where: { deletedAt: null, status: "ACTIVE", ...(p.audience === "ALL" ? {} : { roles: { some: { role: p.audience === "GUARDIANS" ? { key: "PARENT" } : { key: { notIn: ["PARENT", "STUDENT"] } } } } }) }, select: { id: true } });
    await notify(db, { tenantId: session.tenant.id, userIds: users.map((u) => u.id), type: "SYSTEM", title: `تحديث سياسة الخصوصية (الإصدار ${p.version})`, body: p.changes ?? "يرجى الاطلاع على السياسة المحدثة والموافقة عليها", link: "/privacy", actorId: session.user.id });
  }
  return published;
}

/** السياسة السارية لهذا المستخدم، وهل عليه قبولها */
export async function currentPolicy(db: TenantDb, session: SessionData) {
  const audience = audienceOf(session);
  const cfg = readModuleSettings(session.tenant.settings, "compliance");
  const dpo = { name: cfg.dpoName, email: cfg.dpoEmail, days: cfg.dataRequestDays };
  const p = await db.privacyPolicy.findFirst({ where: { status: "PUBLISHED", audience: { in: ["ALL", audience] } }, orderBy: { version: "desc" } });
  if (!p) return { policy: null, needsAcceptance: false, acceptedAt: null, dpo };
  const acc = await db.policyAcceptance.findFirst({ where: { policyId: p.id, userId: session.user.id } });
  return { policy: { id: p.id, version: p.version, title: p.title, body: p.body, changes: p.changes, publishedAt: p.publishedAt, requireAcceptance: p.requireAcceptance }, needsAcceptance: p.requireAcceptance && !acc, acceptedAt: acc?.acceptedAt ?? null, dpo };
}

export async function acceptPolicy(db: TenantDb, session: SessionData, input: { policyId: string }, meta: { ip: string | null; userAgent: string | null }) {
  const cur = await currentPolicy(db, session);
  if (!cur.policy || cur.policy.id !== input.policyId) throw badRequest("هذا ليس الإصدار الساري");
  if (!cur.needsAcceptance) return { ok: true };
  await db.policyAcceptance.create({ data: { tenantId: session.tenant.id, policyId: input.policyId, userId: session.user.id, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null } });
  return { ok: true };
}

// ---------------------------------------------------------------------
// الموافقات
// ---------------------------------------------------------------------

export async function listConsentTypes(db: TenantDb, session: SessionData) {
  requireAny(session);
  return db.consentType.findMany({ where: isOfficer(session) ? {} : { isActive: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

export async function saveConsentType(db: TenantDb, session: SessionData, input: { id?: string | null; name: string; description: string; subject: "STUDENT" | "STAFF"; isRequired: boolean; isActive: boolean }) {
  requireOfficer(session, "update");
  if (input.name.trim().length < 3 || input.description.trim().length < 10) throw badRequest("الاسم والوصف مطلوبان");
  const data = { name: input.name.trim(), description: input.description.trim(), subject: input.subject, isRequired: input.isRequired, isActive: input.isActive };
  if (input.id) return db.consentType.update({ where: { id: input.id }, data });
  const count = await db.consentType.count();
  return db.consentType.create({ data: { tenantId: session.tenant.id, key: `c${Date.now().toString(36)}`, sortOrder: count, ...data } });
}

type Status = "GRANTED" | "WITHDRAWN" | "DENIED";

/** الحالة الحالية لكل (نوع × طالب/موظف): أحدث سجل */
async function latestConsents(db: TenantDb, where: { studentIds?: string[]; employeeIds?: string[] }) {
  const recs = await db.consentRecord.findMany({
    where: { OR: [...(where.studentIds ? [{ studentId: { in: where.studentIds } }] : []), ...(where.employeeIds ? [{ employeeId: { in: where.employeeIds } }] : [])] },
    orderBy: { createdAt: "desc" },
    select: { consentTypeId: true, studentId: true, employeeId: true, status: true, createdAt: true, givenByName: true, method: true },
  });
  const map = new Map<string, (typeof recs)[number]>();
  for (const r of recs) {
    const k = `${r.consentTypeId}|${r.studentId ?? r.employeeId}`;
    if (!map.has(k)) map.set(k, r);
  }
  return map;
}

/** مصفوفة الموافقات للطلاب (لمسؤول الامتثال): الطلاب × أنواع الموافقة */
export async function consentMatrix(db: TenantDb, session: SessionData, input: { gradeId?: string | null; typeId?: string | null; status?: "GRANTED" | "MISSING" | "WITHDRAWN" | null }) {
  requireOfficer(session);
  const types = await db.consentType.findMany({ where: { isActive: true, subject: "STUDENT", ...(input.typeId ? { id: input.typeId } : {}) }, orderBy: { sortOrder: "asc" } });
  const students = await db.student.findMany({ where: { deletedAt: null, status: "ACTIVE", ...(input.gradeId ? { gradeId: input.gradeId } : {}) }, select: { id: true, fullName: true, academicNumber: true, grade: { select: { name: true } }, section: { select: { name: true } } }, orderBy: [{ grade: { order: "asc" } }, { fullName: "asc" }] });
  const latest = await latestConsents(db, { studentIds: students.map((s) => s.id) });
  const rows = students.map((s) => ({ id: s.id, name: s.fullName, number: s.academicNumber, grade: `${s.grade.name}${s.section ? ` / ${s.section.name}` : ""}`, consents: Object.fromEntries(types.map((t) => [t.id, latest.get(`${t.id}|${s.id}`)?.status ?? null])) as Record<string, Status | null> }));
  const filtered = input.status && input.typeId ? rows.filter((r) => (input.status === "MISSING" ? r.consents[input.typeId!] === null : r.consents[input.typeId!] === input.status)) : rows;
  const summary = types.map((t) => ({ id: t.id, name: t.name, granted: rows.filter((r) => r.consents[t.id] === "GRANTED").length, withdrawn: rows.filter((r) => r.consents[t.id] === "WITHDRAWN" || r.consents[t.id] === "DENIED").length, missing: rows.filter((r) => r.consents[t.id] === null).length }));
  const grades = await db.grade.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: [{ stage: { order: "asc" } }, { order: "asc" }] });
  return { types: types.map((t) => ({ id: t.id, name: t.name, isRequired: t.isRequired })), rows: filtered.slice(0, 400), total: filtered.length, summary, grades };
}

/** موافقاتي: ولي الأمر لأبنائه، والموظف عن نفسه — مع السجل */
export async function myConsents(db: TenantDb, session: SessionData) {
  requireAny(session);
  const children = await childrenOf(db, session.user.id);
  const employee = await db.employee.findFirst({ where: { userId: session.user.id, deletedAt: null }, select: { id: true, fullName: true } });
  const guardian = await db.guardian.findFirst({ where: { userId: session.user.id, deletedAt: null }, select: { id: true } });
  const types = await db.consentType.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
  const history = await db.consentRecord.findMany({ where: { OR: [{ studentId: { in: children.map((c) => c.id) } }, ...(employee ? [{ employeeId: employee.id }] : [])] }, orderBy: { createdAt: "desc" }, take: 100, include: { consentType: { select: { name: true } } } });
  const latest = await latestConsents(db, { studentIds: children.map((c) => c.id), employeeIds: employee ? [employee.id] : [] });
  return {
    students: children.map((c) => ({ id: c.id, name: c.fullName, grade: c.grade.name, consents: types.filter((t) => t.subject === "STUDENT").map((t) => ({ typeId: t.id, name: t.name, description: t.description, isRequired: t.isRequired, status: (latest.get(`${t.id}|${c.id}`)?.status ?? null) as Status | null, at: latest.get(`${t.id}|${c.id}`)?.createdAt ?? null })) })),
    staff: employee ? types.filter((t) => t.subject === "STAFF").map((t) => ({ typeId: t.id, name: t.name, description: t.description, isRequired: t.isRequired, status: (latest.get(`${t.id}|${employee.id}`)?.status ?? null) as Status | null, at: latest.get(`${t.id}|${employee.id}`)?.createdAt ?? null })) : [],
    employeeId: employee?.id ?? null,
    guardianId: guardian?.id ?? null,
    history: history.map((h) => ({ id: h.id, type: h.consentType.name, status: h.status, by: h.givenByName, method: h.method, at: h.createdAt, studentId: h.studentId })),
  };
}

export async function setConsent(db: TenantDb, session: SessionData, input: { consentTypeId: string; studentId?: string | null; employeeId?: string | null; status: Status; method?: "PORTAL" | "PAPER" | "STAFF_ENTRY"; note?: string | null }, meta: { ip: string | null; userAgent: string | null }) {
  requireAny(session);
  const type = await db.consentType.findFirst({ where: { id: input.consentTypeId, isActive: true } });
  if (!type) throw notFound("نوع الموافقة غير موجود");
  if (Boolean(input.studentId) === Boolean(input.employeeId)) throw badRequest("حدد الطالب أو الموظف");
  if ((type.subject === "STUDENT") !== Boolean(input.studentId)) throw badRequest("نوع الموافقة لا يناسب صاحبها");
  let method = input.method ?? "PORTAL";
  if (input.studentId) {
    const mine = (await childrenOf(db, session.user.id)).some((c) => c.id === input.studentId);
    if (!mine) {
      // إدخال نيابة عن ولي الأمر (نموذج ورقي) لمسؤول الامتثال فقط
      requireOfficer(session, "update");
      if (method === "PORTAL") method = "STAFF_ENTRY";
    }
  } else {
    const own = await db.employee.findFirst({ where: { id: input.employeeId!, userId: session.user.id } });
    if (!own) {
      requireOfficer(session, "update");
      if (method === "PORTAL") method = "STAFF_ENTRY";
    }
  }
  const policy = await db.privacyPolicy.findFirst({ where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, select: { version: true } });
  return db.consentRecord.create({
    data: { tenantId: session.tenant.id, consentTypeId: type.id, studentId: input.studentId ?? null, employeeId: input.employeeId ?? null, givenById: session.user.id, givenByName: session.user.name, status: input.status, method, policyVersion: policy?.version ?? null, note: input.note?.trim() || null, ip: meta.ip, userAgent: meta.userAgent?.slice(0, 300) ?? null },
  });
}

/** هل لدى الطالب موافقة سارية من نوع معيّن (للوحدات: نشر الصور، الرحلات…) */
export async function hasConsent(db: TenantDb, studentId: string, typeKey: string) {
  const type = await db.consentType.findFirst({ where: { key: typeKey, isActive: true }, select: { id: true } });
  if (!type) return true;
  const last = await db.consentRecord.findFirst({ where: { consentTypeId: type.id, studentId }, orderBy: { createdAt: "desc" }, select: { status: true } });
  return last?.status === "GRANTED";
}

// ---------------------------------------------------------------------
// مدد الاحتفاظ
// ---------------------------------------------------------------------

interface RetentionCategory {
  key: string;
  label: string;
  description: string;
  defaultDays: number;
  action: "DELETE" | "ANONYMIZE";
  count: (tenantId: string, cutoff: Date) => Promise<number>;
  apply: (tenantId: string, cutoff: Date) => Promise<number>;
}

const ANON = "محذوف وفق سياسة الاحتفاظ";

export const RETENTION_CATEGORIES: RetentionCategory[] = [
  {
    key: "NOTIFICATIONS",
    label: "الإشعارات المقروءة",
    description: "إشعارات قُرئت أو أُرشفت منذ مدة الاحتفاظ",
    defaultDays: 180,
    action: "DELETE",
    count: (t, c) => rootDb.notification.count({ where: { tenantId: t, createdAt: { lt: c }, OR: [{ readAt: { not: null } }, { archivedAt: { not: null } }] } }),
    apply: async (t, c) => (await rootDb.notification.deleteMany({ where: { tenantId: t, createdAt: { lt: c }, OR: [{ readAt: { not: null } }, { archivedAt: { not: null } }] } })).count,
  },
  {
    key: "SESSIONS",
    label: "جلسات الدخول المنتهية",
    description: "سجلات الجلسات المنتهية أو الملغاة (عنوان IP والمتصفح)",
    defaultDays: 90,
    action: "DELETE",
    count: (t, c) => rootDb.session.count({ where: { tenantId: t, expiresAt: { lt: c } } }),
    apply: async (t, c) => (await rootDb.session.deleteMany({ where: { tenantId: t, expiresAt: { lt: c } } })).count,
  },
  {
    key: "OUTBOUND",
    label: "الرسائل المرسلة",
    description: "نسخ الرسائل النصية والبريد المرسلة لأولياء الأمور",
    defaultDays: 365,
    action: "DELETE",
    count: (t, c) => rootDb.outboundMessage.count({ where: { tenantId: t, createdAt: { lt: c } } }),
    apply: async (t, c) => (await rootDb.outboundMessage.deleteMany({ where: { tenantId: t, createdAt: { lt: c } } })).count,
  },
  {
    key: "VISITORS",
    label: "بيانات الزوار",
    description: "اسم الزائر وجواله وهويته ولوحة سيارته (يبقى السجل للإحصاء بلا بيانات شخصية)",
    defaultDays: 365,
    action: "ANONYMIZE",
    count: (t, c) => rootDb.visitor.count({ where: { tenantId: t, createdAt: { lt: c }, NOT: { fullName: ANON } } }),
    apply: async (t, c) => (await rootDb.visitor.updateMany({ where: { tenantId: t, createdAt: { lt: c }, NOT: { fullName: ANON } }, data: { fullName: ANON, phone: null, idHash: null, idLast4: null, vehiclePlate: null, company: null } })).count,
  },
  {
    key: "REJECTED_ADMISSIONS",
    label: "طلبات القبول المرفوضة",
    description: "بيانات المتقدمين الذين لم يُقبلوا (الاسم والهوية وبيانات التواصل)",
    defaultDays: 365,
    action: "ANONYMIZE",
    count: (t, c) => rootDb.admission.count({ where: { tenantId: t, stage: "REJECTED", updatedAt: { lt: c }, NOT: { fullName: ANON } } }),
    apply: async (t, c) =>
      (await rootDb.admission.updateMany({ where: { tenantId: t, stage: "REJECTED", updatedAt: { lt: c }, NOT: { fullName: ANON } }, data: { fullName: ANON, firstName: "—", fatherName: "—", grandfatherName: "—", familyName: "—", nationalIdHash: null, nationalIdEnc: null, nationalIdLast4: null, guardianName: null, guardianPhone: null, guardianEmail: null, address: null, birthDate: null } })).count,
  },
  {
    key: "FORMER_STUDENTS_HEALTH",
    label: "البيانات الصحية للطلاب السابقين",
    description: "زيارات العيادة والملاحظات الصحية لمن غادر المدرسة (منقول، متخرج، منسحب)",
    defaultDays: 730,
    action: "ANONYMIZE",
    count: (t, c) => rootDb.clinicVisit.count({ where: { tenantId: t, visitAt: { lt: c }, notesEnc: { not: null }, studentId: { not: null } } }).then(async () => {
      const ids = (await rootDb.student.findMany({ where: { tenantId: t, status: { in: ["TRANSFERRED", "GRADUATED", "WITHDRAWN"] }, updatedAt: { lt: c } }, select: { id: true } })).map((s) => s.id);
      return ids.length ? rootDb.clinicVisit.count({ where: { tenantId: t, studentId: { in: ids }, patientName: { not: ANON } } }) : 0;
    }),
    apply: async (t, c) => {
      const ids = (await rootDb.student.findMany({ where: { tenantId: t, status: { in: ["TRANSFERRED", "GRADUATED", "WITHDRAWN"] }, updatedAt: { lt: c } }, select: { id: true } })).map((s) => s.id);
      if (!ids.length) return 0;
      await rootDb.student.updateMany({ where: { tenantId: t, id: { in: ids } }, data: { chronicConditions: null, allergies: null, medications: null, healthNotes: null, bloodType: null, criticalHealth: false } });
      return (await rootDb.clinicVisit.updateMany({ where: { tenantId: t, studentId: { in: ids }, patientName: { not: ANON } }, data: { patientName: ANON, complaintEnc: encryptField(ANON), notesEnc: null } })).count;
    },
  },
  {
    key: "REPORT_FILES",
    label: "ملفات التقارير المجدولة",
    description: "نسخ ملفات Excel/CSV المرسلة آلياً (يبقى سجل الإرسال)",
    defaultDays: 90,
    action: "DELETE",
    count: (t, c) => rootDb.reportRun.count({ where: { tenantId: t, createdAt: { lt: c }, fileId: { not: null } } }),
    apply: async (t, c) => {
      const runs = await rootDb.reportRun.findMany({ where: { tenantId: t, createdAt: { lt: c }, fileId: { not: null } }, select: { id: true, fileId: true } });
      for (const r of runs) await storage().remove(r.fileId!).catch(() => undefined);
      return (await rootDb.reportRun.updateMany({ where: { id: { in: runs.map((r) => r.id) } }, data: { fileId: null } })).count;
    },
  },
  {
    key: "AUTOMATION_LOGS",
    label: "سجلات تشغيل الأتمتة",
    description: "سجل تشغيل قواعد الأتمتة وأتمتة قواعد البيانات",
    defaultDays: 180,
    action: "DELETE",
    count: async (t, c) => (await rootDb.automationRuleRun.count({ where: { tenantId: t, createdAt: { lt: c } } })) + (await rootDb.automationRun.count({ where: { tenantId: t, createdAt: { lt: c } } })),
    apply: async (t, c) => (await rootDb.automationRuleRun.deleteMany({ where: { tenantId: t, createdAt: { lt: c } } })).count + (await rootDb.automationRun.deleteMany({ where: { tenantId: t, createdAt: { lt: c } } })).count,
  },
];

/** سجلات محمية لا تخضع للحذف (للعرض والشرح) */
export const PROTECTED_RECORDS = [
  { label: "سجل التدقيق", reason: "دليل رقابي غير قابل للتعديل أو الحذف بمشغّل قاعدة البيانات" },
  { label: "القيود والفواتير والسندات", reason: "سجلات محاسبية يلزم الاحتفاظ بها نظاماً (عادة ١٠ سنوات)" },
  { label: "سجلات الموافقات وقبول السياسة", reason: "دليل امتثال إلحاقي يُحتفظ به طوال مدة التعامل وبعدها" },
  { label: "الدرجات والشهادات المعتمدة", reason: "سجل أكاديمي دائم" },
];

export async function retentionOverview(db: TenantDb, session: SessionData) {
  requireOfficer(session);
  const policies = await db.retentionPolicy.findMany();
  const runs = await db.retentionRun.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const now = Date.now();
  const cats = [];
  for (const c of RETENTION_CATEGORIES) {
    const p = policies.find((x) => x.category === c.key);
    const days = p?.retainDays ?? c.defaultDays;
    cats.push({ key: c.key, label: c.label, description: c.description, action: c.action, retainDays: days, isEnabled: p?.isEnabled ?? false, lastRunAt: p?.lastRunAt ?? null, lastAffected: p?.lastAffected ?? 0, eligible: await c.count(session.tenant.id, new Date(now - days * 86_400_000)) });
  }
  return { categories: cats, protected: PROTECTED_RECORDS, runs };
}

export async function saveRetention(db: TenantDb, session: SessionData, input: { category: string; retainDays: number; isEnabled: boolean }) {
  requireOfficer(session, "update");
  const c = RETENTION_CATEGORIES.find((x) => x.key === input.category);
  if (!c) throw badRequest("فئة غير معروفة");
  if (input.retainDays < 30) throw badRequest("أقل مدة احتفاظ ٣٠ يوماً");
  const existing = await db.retentionPolicy.findFirst({ where: { category: c.key } });
  if (existing) return db.retentionPolicy.update({ where: { id: existing.id }, data: { retainDays: input.retainDays, isEnabled: input.isEnabled, action: c.action, updatedById: session.user.id } });
  return db.retentionPolicy.create({ data: { tenantId: session.tenant.id, category: c.key, retainDays: input.retainDays, isEnabled: input.isEnabled, action: c.action, updatedById: session.user.id } });
}

/** تنفيذ فئة (أو معاينتها) — يُسجَّل في سجل الاحتفاظ والتدقيق */
export async function runRetention(tenantId: string, category: string, opts: { dryRun: boolean; actorId?: string | null; actorName?: string | null }) {
  const c = RETENTION_CATEGORIES.find((x) => x.key === category);
  if (!c) throw badRequest("فئة غير معروفة");
  const p = await rootDb.retentionPolicy.findFirst({ where: { tenantId, category } });
  const cutoff = new Date(Date.now() - (p?.retainDays ?? c.defaultDays) * 86_400_000);
  const affected = opts.dryRun ? await c.count(tenantId, cutoff) : await c.apply(tenantId, cutoff);
  await rootDb.retentionRun.create({ data: { tenantId, category, dryRun: opts.dryRun, affected, cutoff, triggeredById: opts.actorId ?? null } });
  if (!opts.dryRun) {
    if (p) await rootDb.retentionPolicy.update({ where: { id: p.id }, data: { lastRunAt: new Date(), lastAffected: affected } });
    await writeAudit({ tenantId, actor: opts.actorId ? { id: opts.actorId, name: opts.actorName ?? "" } : null }, { action: c.action === "DELETE" ? "PURGE" : "ANONYMIZE", entityType: "RetentionPolicy", summary: `${c.label}: ${affected} سجلاً أقدم من ${cutoff.toISOString().slice(0, 10)}` });
  }
  return { category, affected, cutoff, dryRun: opts.dryRun };
}

export async function runRetentionNow(db: TenantDb, session: SessionData, input: { category: string; dryRun: boolean }) {
  requireOfficer(session, "update");
  return runRetention(session.tenant.id, input.category, { dryRun: input.dryRun, actorId: session.user.id, actorName: session.user.name });
}

/** المهمة اليومية: الفئات المفعّلة */
export async function runEnabledRetention(tenantId: string) {
  const enabled = await rootDb.retentionPolicy.findMany({ where: { tenantId, isEnabled: true } });
  let total = 0;
  for (const p of enabled) total += (await runRetention(tenantId, p.category, { dryRun: false })).affected;
  return { categories: enabled.length, affected: total };
}

// ---------------------------------------------------------------------
// طلبات أصحاب البيانات
// ---------------------------------------------------------------------

export const REQUEST_KIND = { ACCESS: "الاطلاع على البيانات", CORRECTION: "تصحيح البيانات", DELETION: "حذف البيانات", PORTABILITY: "نسخة قابلة للنقل", OBJECTION: "الاعتراض على المعالجة" } as const;

export async function listRequests(db: TenantDb, session: SessionData, input: { status?: string | null }) {
  requireAny(session);
  const officer = isOfficer(session);
  const rows = await db.dataRequest.findMany({ where: { ...(officer ? {} : { requesterUserId: session.user.id }), ...(input.status ? { status: input.status } : {}) }, orderBy: [{ status: "asc" }, { dueDate: "asc" }], take: 300 });
  const assignees = await db.user.findMany({ where: { id: { in: rows.map((r) => r.assigneeId ?? "") } }, select: { id: true, name: true } });
  const today = todayIso(session);
  return { officer, rows: rows.map((r) => ({ ...r, assignee: assignees.find((a) => a.id === r.assigneeId)?.name ?? null, overdue: !["COMPLETED", "REJECTED"].includes(r.status) && r.dueDate.toISOString().slice(0, 10) < today })) };
}

/** صاحب البيانات يقدّم طلباً عن نفسه أو عن أبنائه؛ ومسؤول الامتثال يسجّل طلباً وصل بالبريد أو ورقياً */
export async function createRequest(db: TenantDb, session: SessionData, input: { kind: keyof typeof REQUEST_KIND; subjectType: "GUARDIAN" | "STUDENT" | "EMPLOYEE" | "USER"; subjectId?: string | null; description: string; requesterName?: string | null; requesterContact?: string | null }) {
  requireAny(session);
  if (input.description.trim().length < 10) throw badRequest("صف طلبك (١٠ أحرف على الأقل)");
  const officer = isOfficer(session, "create");
  let subjectId = input.subjectId ?? null;
  let subjectName = "";
  if (input.subjectType === "USER") {
    subjectId = session.user.id;
    subjectName = session.user.name;
  } else if (input.subjectType === "STUDENT") {
    const kids = await childrenOf(db, session.user.id);
    const s = subjectId ? await db.student.findFirst({ where: { id: subjectId }, select: { id: true, fullName: true } }) : null;
    if (!s || (!officer && !kids.some((k) => k.id === s.id))) throw forbidden("تقدّم الطلب عن أبنائك فقط");
    subjectName = s.fullName;
  } else if (input.subjectType === "GUARDIAN") {
    const g = subjectId ? await db.guardian.findFirst({ where: { id: subjectId } }) : await db.guardian.findFirst({ where: { userId: session.user.id, deletedAt: null } });
    if (!g || (!officer && g.userId !== session.user.id)) throw forbidden("تقدّم الطلب عن نفسك فقط");
    subjectId = g.id;
    subjectName = g.name;
  } else {
    const e = subjectId ? await db.employee.findFirst({ where: { id: subjectId } }) : await db.employee.findFirst({ where: { userId: session.user.id, deletedAt: null } });
    if (!e || (!officer && e.userId !== session.user.id)) throw forbidden("تقدّم الطلب عن نفسك فقط");
    subjectId = e.id;
    subjectName = e.fullName;
  }
  const days = readModuleSettings(session.tenant.settings, "compliance").dataRequestDays;
  const due = new Date(Date.parse(`${todayIso(session)}T00:00:00Z`) + days * 86_400_000);
  const r = await db.dataRequest.create({
    data: { tenantId: session.tenant.id, number: await nextNumber(db, session.tenant.id, "data-request"), kind: input.kind, subjectType: input.subjectType, subjectId: subjectId!, subjectName, requesterUserId: officer && input.requesterName ? null : session.user.id, requesterName: input.requesterName?.trim() || session.user.name, requesterContact: input.requesterContact?.trim() || null, description: input.description.trim(), dueDate: due },
  });
  const officers = await rootDb.userRole.findMany({ where: { tenantId: session.tenant.id, role: { key: { in: ["DPO", "OWNER"] } } }, select: { userId: true } });
  await notify(db, { tenantId: session.tenant.id, userIds: officers.map((o) => o.userId), type: "SYSTEM", title: `طلب بيانات جديد: ${REQUEST_KIND[input.kind]} — ${subjectName}`, body: `المهلة حتى ${due.toISOString().slice(0, 10)}`, link: "/compliance/requests", actorId: session.user.id, entityType: "DataRequest", entityId: r.id });
  return r;
}

export async function updateRequest(db: TenantDb, session: SessionData, input: { id: string; status?: "VERIFYING" | "IN_PROGRESS" | "COMPLETED" | "REJECTED"; assigneeId?: string | null; resolution?: string | null }) {
  requireOfficer(session, "update");
  const r = await db.dataRequest.findFirst({ where: { id: input.id } });
  if (!r) throw notFound("الطلب غير موجود");
  if (["COMPLETED", "REJECTED"].includes(r.status)) throw badRequest("الطلب مغلق");
  if ((input.status === "COMPLETED" || input.status === "REJECTED") && !(input.resolution ?? r.resolution)?.trim()) throw badRequest("اكتب نتيجة الطلب قبل إغلاقه");
  if (input.status === "COMPLETED" && ["ACCESS", "PORTABILITY"].includes(r.kind) && !r.exportFileId) throw badRequest("أنشئ نسخة البيانات أولاً");
  const updated = await db.dataRequest.update({ where: { id: r.id }, data: { ...(input.status ? { status: input.status } : {}), ...(input.assigneeId !== undefined ? { assigneeId: input.assigneeId } : {}), ...(input.resolution !== undefined ? { resolution: input.resolution?.trim() || null } : {}), ...(input.status === "COMPLETED" || input.status === "REJECTED" ? { completedAt: new Date() } : {}) } });
  if ((input.status === "COMPLETED" || input.status === "REJECTED") && r.requesterUserId) {
    await notify(db, { tenantId: session.tenant.id, userIds: [r.requesterUserId], type: "SYSTEM", title: `${input.status === "COMPLETED" ? "اكتمل" : "رُفض"} طلبك رقم ${r.number}: ${REQUEST_KIND[r.kind as keyof typeof REQUEST_KIND]}`, body: input.resolution ?? r.resolution, link: "/privacy", actorId: session.user.id });
  }
  return updated;
}

/** يجمع كل بيانات صاحب الطلب في ملف JSON مضغوط (للاطلاع والنقل) */
export async function generateExport(db: TenantDb, session: SessionData, id: string) {
  requireOfficer(session, "update");
  const r = await db.dataRequest.findFirst({ where: { id } });
  if (!r) throw notFound("الطلب غير موجود");
  const data = await collectSubjectData(db, r.subjectType, r.subjectId);
  const payload = { school: session.tenant.name, generatedAt: new Date().toISOString(), request: { number: r.number, kind: r.kind, subject: r.subjectName }, data };
  const json = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const key = `${session.tenant.id}/data-requests/${r.id}-${Date.now()}.json.gz`;
  await storage().put(key, gzipSync(json), "application/gzip");
  await db.dataRequest.update({ where: { id: r.id }, data: { exportFileId: key, status: r.status === "RECEIVED" ? "IN_PROGRESS" : r.status } });
  await writeAudit({ tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } }, { action: "EXPORT", entityType: "DataRequest", entityId: r.id, summary: `نسخة بيانات ${r.subjectName} (${Math.round(json.length / 1024)} ك.ب، بصمة ${createHash("sha256").update(json).digest("hex").slice(0, 12)})` });
  return { ok: true, sizeKb: Math.round(json.length / 1024) };
}

/** ملف النسخة: لمسؤول الامتثال، ولمقدّم الطلب بعد اكتماله */
export async function requestExportFile(session: SessionData, id: string) {
  const db = createTenantDb({ tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } });
  const r = await db.dataRequest.findFirst({ where: { id } });
  if (!r || !r.exportFileId) throw notFound("لا نسخة لهذا الطلب");
  if (!isOfficer(session) && !(r.requesterUserId === session.user.id && r.status === "COMPLETED")) throw forbidden("النسخة متاحة لمقدّم الطلب بعد اكتماله");
  return { buffer: await storage().get(r.exportFileId), filename: `بيانات-${r.subjectName}-${r.number}.json.gz` };
}

async function collectSubjectData(db: TenantDb, type: string, id: string) {
  const dec = (v: string | null) => {
    if (!v) return null;
    try {
      return decryptField(v);
    } catch {
      return null;
    }
  };
  if (type === "STUDENT") {
    const s = await db.student.findFirst({ where: { id }, include: { grade: { select: { name: true } }, section: { select: { name: true } }, branch: { select: { name: true } } } });
    if (!s) throw notFound("الطالب غير موجود");
    const [attendance, behavior, marks, invoices, loans, clinic, consents, transport] = await Promise.all([
      db.attendance.findMany({ where: { studentId: id }, select: { date: true, period: true, status: true, reason: true }, orderBy: { date: "asc" } }),
      db.behaviorRecord.findMany({ where: { studentId: id, deletedAt: null }, select: { occurredAt: true, kind: true, category: true, points: true, description: true, actionTaken: true } }),
      db.mark.findMany({ where: { studentId: id }, select: { scoreTenths: true, absent: true, assessment: { select: { title: true, maxTenths: true, status: true, subjectId: true } } } }),
      db.invoice.findMany({ where: { studentId: id, deletedAt: null }, select: { number: true, issueDate: true, dueDate: true, totalMinor: true, paidMinor: true, status: true } }),
      db.libraryLoan.findMany({ where: { studentId: id }, select: { loanedAt: true, dueDate: true, returnedAt: true, fineMinor: true, copy: { select: { book: { select: { title: true } } } } } }),
      db.clinicVisit.findMany({ where: { studentId: id }, select: { visitAt: true, complaintEnc: true, notesEnc: true, outcome: true } }),
      db.consentRecord.findMany({ where: { studentId: id }, select: { status: true, method: true, createdAt: true, givenByName: true, consentType: { select: { name: true } } } }),
      db.transportAssignment.findMany({ where: { studentId: id }, select: { startDate: true, endDate: true, direction: true, status: true, route: { select: { name: true } } } }),
    ]);
    return {
      profile: { fullName: s.fullName, academicNumber: s.academicNumber, gender: s.gender, nationality: s.nationality, birthDate: s.birthDate, nationalId: dec(s.nationalIdEnc), branch: s.branch.name, grade: s.grade.name, section: s.section?.name ?? null, status: s.status, enrollmentDate: s.enrollmentDate, health: { bloodType: s.bloodType, chronicConditions: s.chronicConditions, allergies: s.allergies, medications: s.medications } },
      attendance, behavior, marks, invoices, libraryLoans: loans, transport, consents,
      clinicVisits: clinic.map((c) => ({ visitAt: c.visitAt, complaint: dec(c.complaintEnc), notes: dec(c.notesEnc), outcome: c.outcome })),
    };
  }
  if (type === "GUARDIAN") {
    const g = await db.guardian.findFirst({ where: { id }, include: { students: { include: { student: { select: { fullName: true, academicNumber: true } } } } } });
    if (!g) throw notFound("ولي الأمر غير موجود");
    const [invoices, receipts, messages] = await Promise.all([
      db.invoice.findMany({ where: { guardianId: id, deletedAt: null }, select: { number: true, issueDate: true, totalMinor: true, paidMinor: true, status: true } }),
      db.receipt.findMany({ where: { guardianId: id }, select: { number: true, date: true, amountMinor: true, method: true, status: true } }),
      g.phone ? db.outboundMessage.findMany({ where: { to: g.phone }, select: { channel: true, body: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 500 }) : [],
    ]);
    return { profile: { name: g.name, phone: g.phone, phoneAlt: g.phoneAlt, email: g.email, occupation: g.occupation, employer: g.employer, address: g.address, nationalId: dec(g.nationalIdEnc) }, children: g.students.map((s) => ({ ...s.student, relation: s.relation, isPrimary: s.isPrimary })), invoices, receipts, messagesSent: messages };
  }
  if (type === "EMPLOYEE") {
    const e = await db.employee.findFirst({ where: { id } });
    if (!e) throw notFound("الموظف غير موجود");
    const [contracts, attendance, leaves, payslips, consents] = await Promise.all([
      db.employmentContract.findMany({ where: { employeeId: id }, select: { number: true, type: true, startDate: true, endDate: true, basicMinor: true, housingMinor: true, transportMinor: true, status: true } }),
      db.employeeAttendance.findMany({ where: { employeeId: id }, select: { date: true, status: true, checkIn: true, checkOut: true, lateMinutes: true } }),
      db.staffLeaveRequest.findMany({ where: { employeeId: id, deletedAt: null }, select: { number: true, startDate: true, endDate: true, days: true, status: true } }),
      db.payrollLine.findMany({ where: { employeeId: id }, select: { grossMinor: true, deductionsMinor: true, netMinor: true, run: { select: { month: true, status: true } } } }),
      db.consentRecord.findMany({ where: { employeeId: id }, select: { status: true, createdAt: true, consentType: { select: { name: true } } } }),
    ]);
    return { profile: { fullName: e.fullName, number: e.number, gender: e.gender, nationality: e.nationality, birthDate: e.birthDate, nationalId: dec(e.nationalIdEnc), phone: e.phone, email: e.email, address: e.address, iban: e.iban, hireDate: e.hireDate, status: e.status }, contracts, attendance, leaves, payslips, consents };
  }
  const u = await db.user.findFirst({ where: { id }, select: { name: true, email: true, phone: true, jobTitle: true, createdAt: true, lastLoginAt: true } });
  if (!u) throw notFound("المستخدم غير موجود");
  const [sessions, audit] = await Promise.all([db.session.findMany({ where: { userId: id }, select: { createdAt: true, ip: true, userAgent: true, expiresAt: true } }), db.auditLog.findMany({ where: { userId: id }, select: { createdAt: true, action: true, entityType: true, summary: true }, take: 2000, orderBy: { createdAt: "desc" } })]);
  return { profile: u, sessions, activity: audit };
}

// ---------------------------------------------------------------------
// لوحة الامتثال
// ---------------------------------------------------------------------

export async function complianceOverview(db: TenantDb, session: SessionData) {
  requireOfficer(session);
  const today = new Date(`${todayIso(session)}T00:00:00Z`);
  const [policy, open, overdue, types, retentionEnabled] = await Promise.all([
    db.privacyPolicy.findFirst({ where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, include: { _count: { select: { acceptances: true } } } }),
    db.dataRequest.count({ where: { status: { notIn: ["COMPLETED", "REJECTED"] } } }),
    db.dataRequest.count({ where: { status: { notIn: ["COMPLETED", "REJECTED"] }, dueDate: { lt: today } } }),
    db.consentType.count({ where: { isActive: true } }),
    db.retentionPolicy.count({ where: { isEnabled: true } }),
  ]);
  const eligible = policy ? await db.user.count({ where: { deletedAt: null, status: "ACTIVE", ...(policy.audience === "ALL" ? {} : { roles: { some: { role: policy.audience === "GUARDIANS" ? { key: "PARENT" } : { key: { notIn: ["PARENT", "STUDENT"] } } } } }) } }) : 0;
  const settings = readModuleSettings(session.tenant.settings, "compliance");
  return { policy: policy ? { version: policy.version, title: policy.title, accepted: policy._count.acceptances, eligible, publishedAt: policy.publishedAt } : null, openRequests: open, overdueRequests: overdue, consentTypes: types, retentionEnabled, retentionTotal: RETENTION_CATEGORIES.length, dpo: { name: settings.dpoName, email: settings.dpoEmail }, dataRequestDays: settings.dataRequestDays };
}
