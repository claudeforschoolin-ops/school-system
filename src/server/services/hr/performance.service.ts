/**
 * تقييم الأداء: نماذج بمعايير موزونة، ودورات تقييم تُنشئ تقييماً لكل موظف نشط يقيّمه مديره المباشر؛
 * الموظف يقيّم نفسه وأهدافه، ثم يعتمد المدير الدرجة النهائية (متوسط موزون من ٥ → نسبة) والتقدير.
 */
import type { Prisma } from "@/generated/prisma/client";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden, notFound } from "@/server/errors";
import { notify } from "@/server/services/notifications.service";
import { dateOnly, isHrStaff, myEmployee, requireHr } from "./common";

export interface Criterion {
  key: string;
  name: string;
  weight: number;
  description?: string;
}

const DEFAULT_CRITERIA: Criterion[] = [
  { key: "quality", name: "جودة العمل وإتقانه", weight: 30, description: "دقة المخرجات والالتزام بالمعايير" },
  { key: "commitment", name: "الانضباط والالتزام", weight: 20, description: "الحضور والمواعيد وتنفيذ التكليفات" },
  { key: "teamwork", name: "العمل الجماعي والتواصل", weight: 20 },
  { key: "initiative", name: "المبادرة والتطوير المهني", weight: 15 },
  { key: "students", name: "أثر العمل على الطلاب والأسر", weight: 15 },
];

export const RATINGS = [
  { minBp: 9000, label: "متميز" },
  { minBp: 8000, label: "يفوق التوقعات" },
  { minBp: 6500, label: "يلبي التوقعات" },
  { minBp: 5000, label: "يحتاج تحسيناً" },
  { minBp: 0, label: "غير مرضٍ" },
];

/** الدرجة النهائية: متوسط موزون لدرجات ١–٥ محوّل إلى نسبة (٥ = ١٠٠٪) */
export function finalScore(criteria: Criterion[], scores: Record<string, number>) {
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  if (!total) return null;
  let num = 0;
  for (const c of criteria) {
    const v = scores[c.key];
    if (!v || v < 1 || v > 5) return null;
    num += v * c.weight;
  }
  const bp = Math.floor((num * 2000 * 2 + total) / (total * 2));
  return { bp, rating: RATINGS.find((r) => bp >= r.minBp)!.label };
}

export async function templates(db: TenantDb, session: SessionData) {
  if (!(await db.reviewTemplate.count())) await db.reviewTemplate.create({ data: { tenantId: session.tenant.id, name: "نموذج التقييم السنوي", criteria: DEFAULT_CRITERIA as unknown as Prisma.InputJsonValue } });
  const rows = await db.reviewTemplate.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({ ...r, criteria: r.criteria as unknown as Criterion[] }));
}

export async function saveTemplate(db: TenantDb, session: SessionData, input: { id?: string | null; name: string; criteria: Criterion[] }) {
  requireHr(session, "performance", "update");
  if (input.criteria.reduce((s, c) => s + c.weight, 0) !== 100) throw badRequest("مجموع أوزان المعايير ١٠٠");
  if (new Set(input.criteria.map((c) => c.key)).size !== input.criteria.length) throw badRequest("رموز المعايير مكررة");
  const data = { name: input.name.trim(), criteria: input.criteria as unknown as Prisma.InputJsonValue };
  return input.id ? db.reviewTemplate.update({ where: { id: input.id }, data }) : db.reviewTemplate.create({ data: { tenantId: session.tenant.id, ...data } });
}

export async function listCycles(db: TenantDb, session: SessionData) {
  const self = await myEmployee(db, session);
  const hr = isHrStaff(session, "performance", "view");
  const cycles = await db.reviewCycle.findMany({ orderBy: { startDate: "desc" }, include: { reviews: { select: { status: true, employeeId: true, reviewerId: true } } } });
  return {
    hr,
    cycles: cycles.map((c) => ({ id: c.id, name: c.name, status: c.status, startDate: c.startDate, endDate: c.endDate, total: c.reviews.length, completed: c.reviews.filter((r) => r.status === "COMPLETED").length, pendingSelf: c.reviews.filter((r) => r.status === "PENDING_SELF").length })),
    mine: self ? (await db.performanceReview.findMany({ where: { OR: [{ employeeId: self.id }, { reviewerId: session.user.id }] }, include: { cycle: { select: { name: true, status: true } } }, orderBy: { createdAt: "desc" } })).map((r) => ({ id: r.id, cycle: r.cycle.name, status: r.status, asReviewer: r.reviewerId === session.user.id && r.employeeId !== self.id, employeeId: r.employeeId })) : [],
  };
}

export async function createCycle(db: TenantDb, session: SessionData, input: { name: string; templateId: string; startDate: string; endDate: string }) {
  requireHr(session, "performance", "create");
  if (input.endDate < input.startDate) throw badRequest("نهاية الدورة قبل بدايتها");
  const template = await db.reviewTemplate.findFirst({ where: { id: input.templateId } });
  if (!template) throw notFound("النموذج غير موجود");
  const employees = await db.employee.findMany({ where: { deletedAt: null, status: "ACTIVE", hireDate: { lte: dateOnly(input.startDate) } }, include: { manager: { select: { userId: true } } } });
  const cycle = await db.reviewCycle.create({ data: { tenantId: session.tenant.id, name: input.name.trim(), templateId: template.id, startDate: dateOnly(input.startDate), endDate: dateOnly(input.endDate), createdById: session.user.id } });
  await db.performanceReview.createMany({ data: employees.map((e) => ({ tenantId: session.tenant.id, cycleId: cycle.id, employeeId: e.id, reviewerId: e.manager?.userId ?? null })) });
  const users = employees.map((e) => e.userId).filter((u): u is string => Boolean(u));
  if (users.length) await notify(db, { tenantId: session.tenant.id, userIds: users, type: "SYSTEM", title: `بدأت دورة التقييم: ${cycle.name}`, body: "أكمل تقييمك الذاتي وأهدافك", link: "/hr/performance", actorId: session.user.id, entityType: "ReviewCycle", entityId: cycle.id });
  return { cycle, reviews: employees.length, withoutReviewer: employees.filter((e) => !e.manager?.userId).length };
}

export async function cycleDetail(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "performance", "view");
  const c = await db.reviewCycle.findFirst({ where: { id }, include: { reviews: true } });
  if (!c) throw notFound("الدورة غير موجودة");
  const [employees, users] = await Promise.all([db.employee.findMany({ where: { id: { in: c.reviews.map((r) => r.employeeId) } }, select: { id: true, fullName: true, department: { select: { name: true } } } }), db.user.findMany({ where: { id: { in: c.reviews.map((r) => r.reviewerId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })]);
  const rows = c.reviews.map((r) => ({ id: r.id, status: r.status, finalBp: r.finalBp, rating: r.rating, employee: employees.find((e) => e.id === r.employeeId)!, reviewer: users.find((u) => u.id === r.reviewerId)?.name ?? null })).sort((a, b) => a.employee.fullName.localeCompare(b.employee.fullName));
  const done = rows.filter((r) => r.finalBp !== null);
  return { cycle: { id: c.id, name: c.name, status: c.status, startDate: c.startDate, endDate: c.endDate }, rows, distribution: RATINGS.map((r) => ({ label: r.label, count: done.filter((x) => x.rating === r.label).length })) };
}

export async function closeCycle(db: TenantDb, session: SessionData, id: string) {
  requireHr(session, "performance", "approve", "إغلاق الدورة لمدير الموارد البشرية");
  return db.reviewCycle.update({ where: { id }, data: { status: "CLOSED" } });
}

async function loadReview(db: TenantDb, session: SessionData, id: string) {
  const r = await db.performanceReview.findFirst({ where: { id }, include: { cycle: true } });
  if (!r) throw notFound("التقييم غير موجود");
  const self = await myEmployee(db, session);
  const role = { self: self?.id === r.employeeId, reviewer: r.reviewerId === session.user.id, hr: isHrStaff(session, "performance", "view") };
  if (!role.self && !role.reviewer && !role.hr) throw forbidden();
  return { r, role };
}

export async function getReview(db: TenantDb, session: SessionData, id: string) {
  const { r, role } = await loadReview(db, session, id);
  const [template, employee, reviewer] = await Promise.all([db.reviewTemplate.findFirst({ where: { id: r.cycle.templateId } }), db.employee.findFirst({ where: { id: r.employeeId }, select: { fullName: true, department: { select: { name: true } }, positionRef: { select: { title: true } } } }), r.reviewerId ? db.user.findFirst({ where: { id: r.reviewerId }, select: { name: true } }) : null]);
  // الموظف لا يرى درجات المدير قبل الاعتماد
  const showManager = role.reviewer || role.hr || r.status === "COMPLETED";
  return { review: { ...r, managerScores: showManager ? r.managerScores : {}, managerComment: showManager ? r.managerComment : null }, criteria: (template?.criteria ?? []) as unknown as Criterion[], employee, reviewer: reviewer?.name ?? null, role };
}

export async function submitSelf(db: TenantDb, session: SessionData, input: { id: string; scores: Record<string, number>; goals: Array<{ title: string; target: string; progressBp: number }>; comment: string | null }) {
  const { r, role } = await loadReview(db, session, input.id);
  if (!role.self) throw forbidden("التقييم الذاتي لصاحبه");
  if (r.cycle.status !== "OPEN" || r.status !== "PENDING_SELF") throw badRequest("التقييم الذاتي مغلق");
  const template = await db.reviewTemplate.findFirst({ where: { id: r.cycle.templateId } });
  if (!finalScore((template?.criteria ?? []) as unknown as Criterion[], input.scores)) throw badRequest("قيّم كل المعايير من ١ إلى ٥");
  const updated = await db.performanceReview.update({ where: { id: r.id }, data: { selfScores: input.scores, goals: input.goals, selfComment: input.comment, selfSubmittedAt: new Date(), status: "PENDING_MANAGER" } });
  if (r.reviewerId) await notify(db, { tenantId: session.tenant.id, userIds: [r.reviewerId], type: "APPROVAL", title: "تقييم ذاتي بانتظار تقييمك", link: `/hr/performance/reviews/${r.id}`, actorId: session.user.id, entityType: "PerformanceReview", entityId: r.id });
  return updated;
}

export async function submitManager(db: TenantDb, session: SessionData, input: { id: string; scores: Record<string, number>; comment: string | null }) {
  const { r, role } = await loadReview(db, session, input.id);
  if (!role.reviewer && !isHrStaff(session, "performance", "approve")) throw forbidden("اعتماد التقييم للمدير المباشر");
  if (r.cycle.status !== "OPEN" || r.status === "COMPLETED") throw badRequest("التقييم مغلق");
  const template = await db.reviewTemplate.findFirst({ where: { id: r.cycle.templateId } });
  const f = finalScore((template?.criteria ?? []) as unknown as Criterion[], input.scores);
  if (!f) throw badRequest("قيّم كل المعايير من ١ إلى ٥");
  const updated = await db.performanceReview.update({ where: { id: r.id }, data: { managerScores: input.scores, managerComment: input.comment, managerSubmittedAt: new Date(), finalBp: f.bp, rating: f.rating, status: "COMPLETED", reviewerId: r.reviewerId ?? session.user.id } });
  const emp = await db.employee.findFirst({ where: { id: r.employeeId }, select: { userId: true } });
  if (emp?.userId) await notify(db, { tenantId: session.tenant.id, userIds: [emp.userId], type: "SYSTEM", title: `اكتمل تقييم أدائك: ${f.rating}`, link: `/hr/performance/reviews/${r.id}`, actorId: session.user.id, entityType: "PerformanceReview", entityId: r.id });
  return updated;
}
