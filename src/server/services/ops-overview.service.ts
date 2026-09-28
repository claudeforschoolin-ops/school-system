/**
 * مؤشرات صفحات التحويلات والإجازات والسلوك والإرشاد (ضمن نطاق المستخدم).
 */
import { can } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { caseWhere } from "./behavior.service";
import { studentWhere } from "./student-scope";

export async function transfersOverview(db: TenantDb, session: SessionData) {
  const where = await studentWhere(db, session, "transfers", "view");
  if (!where) return null;
  const s = { deletedAt: null, student: where };
  const yearStart = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
  const [pending, approved, awaitingClearance, completed, leavesPending, leavesToday] = await Promise.all([
    db.transfer.count({ where: { ...s, status: "PENDING" } }),
    db.transfer.count({ where: { ...s, status: "APPROVED" } }),
    db.transfer.count({ where: { ...s, status: "PENDING", type: { in: ["OUTGOING", "WITHDRAWAL"] }, financialClearance: false } }),
    db.transfer.count({ where: { ...s, status: "COMPLETED", updatedAt: { gte: yearStart } } }),
    db.studentLeave.count({ where: { ...s, status: "PENDING" } }),
    db.studentLeave.count({ where: { ...s, status: "APPROVED", startDate: { lte: new Date() }, endDate: { gte: new Date(new Date().toISOString().slice(0, 10)) } } }),
  ]);
  return { pending, approved, awaitingClearance, completed, leavesPending, leavesToday };
}

export async function behaviorOverview(db: TenantDb, session: SessionData) {
  const where = await studentWhere(db, session, "counseling", "view");
  if (!where) return null;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const s = { deletedAt: null, student: where, occurredAt: { gte: monthStart } };
  const [positive, negative, severe, points] = await Promise.all([
    db.behaviorRecord.count({ where: { ...s, kind: "POSITIVE" } }),
    db.behaviorRecord.count({ where: { ...s, kind: "NEGATIVE" } }),
    db.behaviorRecord.count({ where: { ...s, severity: { in: ["HIGH", "CRITICAL"] } } }),
    db.behaviorRecord.aggregate({ where: s, _sum: { points: true } }),
  ]);
  let openCases: number | null = null;
  let sessionsThisWeek: number | null = null;
  if (can(session.access, "counseling", "update")) {
    const cw = await caseWhere(db, session);
    openCases = await db.counselingCase.count({ where: { ...cw, status: { not: "CLOSED" } } });
    sessionsThisWeek = await db.counselingSession.count({ where: { case: cw, status: "SCHEDULED", scheduledAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 86_400_000) } } });
  }
  return { positive, negative, severe, points: points._sum.points ?? 0, openCases, sessionsThisWeek };
}
