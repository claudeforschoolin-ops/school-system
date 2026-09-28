/**
 * إدارة المستخدمين: الدعوات، الأدوار، الإيقاف والتفعيل، الجلسات، فك القفل.
 */
import { can } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import { revokeAllUserSessions, revokeSession } from "@/server/auth/session";
import { writeAudit, type TenantDb } from "@/server/db/tenant";
import { AppError, badRequest, forbidden, notFound } from "@/server/errors";
import { requestPasswordReset, sendInvite } from "../auth.service";

export interface RoleAssignmentInput {
  roleId: string;
  branchId?: string | null;
  stageId?: string | null;
}

export async function listUsers(db: TenantDb, input: { search?: string; status?: "ACTIVE" | "INVITED" | "SUSPENDED"; roleId?: string }) {
  const q = input.search?.trim();
  const users = await db.user.findMany({
    where: {
      deletedAt: null,
      ...(input.status ? { status: input.status } : {}),
      ...(input.roleId ? { roles: { some: { roleId: input.roleId } } } : {}),
      ...(q
        ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] }
        : {}),
    },
    include: { roles: { include: { role: { select: { id: true, key: true, name: true, color: true } }, branch: { select: { id: true, name: true } } } } },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    take: 500,
  });
  const activeSessions = await db.session.groupBy({
    by: ["userId"],
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    _count: { _all: true },
  });
  const sessionsByUser = new Map(activeSessions.map((s) => [s.userId, s._count._all]));
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    jobTitle: u.jobTitle,
    avatarColor: u.avatarColor,
    status: u.status,
    twoFactorEnabled: u.twoFactorEnabled,
    lockedUntil: u.lockedUntil,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    activeSessions: sessionsByUser.get(u.id) ?? 0,
    roles: u.roles.map((r) => ({ id: r.id, roleId: r.roleId, key: r.role.key, name: r.role.name, color: r.role.color, branch: r.branch, stageId: r.stageId })),
  }));
}

async function ownerRoleId(db: TenantDb) {
  return (await db.role.findFirst({ where: { key: "OWNER" } }))?.id ?? null;
}

async function assertOwnerSafety(db: TenantDb, session: SessionData, targetUserId: string, nextRoleIds: string[] | null) {
  const ownerId = await ownerRoleId(db);
  if (!ownerId) return;
  const granting = nextRoleIds?.includes(ownerId);
  if (granting && !session.roleKeys.includes("OWNER")) throw forbidden("وحده مالك النظام يمكنه منح دور مالك النظام");
  const isTargetOwner = await db.userRole.findFirst({ where: { userId: targetUserId, roleId: ownerId } });
  if (isTargetOwner && (nextRoleIds === null || !nextRoleIds.includes(ownerId))) {
    const owners = await db.userRole.count({ where: { roleId: ownerId, user: { status: "ACTIVE", deletedAt: null } } });
    if (owners <= 1) throw new AppError("CONFLICT", "لا يمكن إزالة آخر مالك للنظام أو إيقافه");
  }
}

async function validateAssignments(db: TenantDb, roles: RoleAssignmentInput[]) {
  if (roles.length === 0) throw badRequest("يجب إسناد دور واحد على الأقل");
  const roleRecords = await db.role.findMany({ where: { id: { in: roles.map((r) => r.roleId) } } });
  if (roleRecords.length !== new Set(roles.map((r) => r.roleId)).size) throw badRequest("دور غير موجود");
  const branchIds = roles.map((r) => r.branchId).filter((x): x is string => Boolean(x));
  if (branchIds.length) {
    const branches = await db.branch.count({ where: { id: { in: branchIds }, deletedAt: null } });
    if (branches !== new Set(branchIds).size) throw badRequest("فرع غير موجود");
  }
  const stageIds = roles.map((r) => r.stageId).filter((x): x is string => Boolean(x));
  if (stageIds.length) {
    const stages = await db.stage.count({ where: { id: { in: stageIds } } });
    if (stages !== new Set(stageIds).size) throw badRequest("مرحلة غير موجودة");
  }
}

export async function inviteUser(
  db: TenantDb,
  session: SessionData,
  input: { name: string; email: string; phone?: string | null; jobTitle?: string | null; roles: RoleAssignmentInput[] },
) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest("البريد الإلكتروني غير صالح");
  await validateAssignments(db, input.roles);
  await assertOwnerSafety(db, session, "__new__", input.roles.map((r) => r.roleId));
  const exists = await db.user.findFirst({ where: { email } });
  if (exists) throw new AppError("CONFLICT", "يوجد مستخدم بهذا البريد مسبقاً");
  const user = await db.user.create({
    data: {
      tenantId: session.tenant.id,
      email,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      jobTitle: input.jobTitle?.trim() || null,
      status: "INVITED",
      createdById: session.user.id,
    },
  });
  for (const r of input.roles) {
    await db.userRole.create({
      data: { tenantId: session.tenant.id, userId: user.id, roleId: r.roleId, branchId: r.branchId ?? null, stageId: r.stageId ?? null },
    });
  }
  await sendInvite({ tenantId: session.tenant.id, userId: user.id, invitedByName: session.user.name });
  return { id: user.id };
}

export async function resendInvite(db: TenantDb, session: SessionData, userId: string) {
  const user = await db.user.findFirst({ where: { id: userId, status: "INVITED" } });
  if (!user) throw badRequest("المستخدم ليس في حالة دعوة");
  await sendInvite({ tenantId: session.tenant.id, userId: user.id, invitedByName: session.user.name });
  return { ok: true };
}

export async function updateUser(
  db: TenantDb,
  _session: SessionData,
  input: { userId: string; name?: string; jobTitle?: string | null; phone?: string | null },
) {
  const user = await db.user.findFirst({ where: { id: input.userId, deletedAt: null } });
  if (!user) throw notFound("المستخدم غير موجود");
  return db.user.update({
    where: { id: user.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() || user.name } : {}),
      ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
    },
  });
}

export async function setUserRoles(db: TenantDb, session: SessionData, input: { userId: string; roles: RoleAssignmentInput[] }) {
  const user = await db.user.findFirst({ where: { id: input.userId, deletedAt: null } });
  if (!user) throw notFound("المستخدم غير موجود");
  await validateAssignments(db, input.roles);
  await assertOwnerSafety(db, session, user.id, input.roles.map((r) => r.roleId));
  const before = await db.userRole.findMany({ where: { userId: user.id }, include: { role: { select: { name: true } } } });
  await db.userRole.deleteMany({ where: { userId: user.id } });
  for (const r of input.roles) {
    await db.userRole.create({
      data: { tenantId: session.tenant.id, userId: user.id, roleId: r.roleId, branchId: r.branchId ?? null, stageId: r.stageId ?? null },
    });
  }
  const after = await db.userRole.findMany({ where: { userId: user.id }, include: { role: { select: { name: true } } } });
  await writeAudit(
    { tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } },
    {
      action: "PERMISSION_CHANGE",
      entityType: "User",
      entityId: user.id,
      summary: `أدوار ${user.name}`,
      oldValue: { roles: before.map((r) => r.role.name) },
      newValue: { roles: after.map((r) => r.role.name) },
    },
  );
  return { ok: true };
}

export async function setUserStatus(db: TenantDb, session: SessionData, input: { userId: string; status: "ACTIVE" | "SUSPENDED" }) {
  if (input.userId === session.user.id) throw badRequest("لا يمكنك تغيير حالة حسابك بنفسك");
  const user = await db.user.findFirst({ where: { id: input.userId, deletedAt: null } });
  if (!user) throw notFound("المستخدم غير موجود");
  if (input.status === "SUSPENDED") await assertOwnerSafety(db, session, user.id, null);
  await db.user.update({ where: { id: user.id }, data: { status: input.status } });
  if (input.status === "SUSPENDED") await revokeAllUserSessions(session.tenant.id, user.id);
  return { ok: true };
}

export async function unlockUser(db: TenantDb, _session: SessionData, userId: string) {
  const user = await db.user.findFirst({ where: { id: userId } });
  if (!user) throw notFound("المستخدم غير موجود");
  await db.user.update({ where: { id: user.id }, data: { lockedUntil: null, failedLoginCount: 0 } });
  return { ok: true };
}

export async function sendResetLink(db: TenantDb, session: SessionData, userId: string) {
  const user = await db.user.findFirst({ where: { id: userId, status: "ACTIVE" } });
  if (!user) throw badRequest("المستخدم غير مفعّل");
  await requestPasswordReset({ email: user.email, tenantSlug: session.tenant.slug }, { ip: null, userAgent: null });
  return { ok: true };
}

export async function listUserSessions(db: TenantDb, userId: string) {
  return db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, ip: true, deviceLabel: true, createdAt: true, lastActiveAt: true, twoFactorVerified: true },
    orderBy: { lastActiveAt: "desc" },
  });
}

export async function revokeUserSession(db: TenantDb, session: SessionData, sessionId: string) {
  const target = await db.session.findFirst({ where: { id: sessionId } });
  if (!target) throw notFound("الجلسة غير موجودة");
  const isSelf = target.userId === session.user.id;
  if (!isSelf && !can(session.access, "users", "update")) throw forbidden();
  await revokeSession(target.id);
  await writeAudit(
    { tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } },
    { action: "SESSION_REVOKE", entityType: "User", entityId: target.userId, summary: target.deviceLabel ?? null },
  );
  return { ok: true };
}
