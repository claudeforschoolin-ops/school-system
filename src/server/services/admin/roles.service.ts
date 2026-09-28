/**
 * الأدوار ومصفوفة الصلاحيات: أدوار نظامية قابلة للتعديل وأدوار مخصصة.
 */
import { isValidPermission, SCOPES, type Scope } from "@/lib/rbac/catalog";
import type { SessionData } from "@/server/auth/session";
import { writeAudit, type TenantDb } from "@/server/db/tenant";
import { AppError, badRequest, notFound } from "@/server/errors";

export async function listRoles(db: TenantDb) {
  const roles = await db.role.findMany({ orderBy: [{ position: "asc" }, { name: "asc" }], include: { permissions: true } });
  const counts = await db.userRole.groupBy({ by: ["roleId"], _count: { _all: true } });
  const countBy = new Map(counts.map((c) => [c.roleId, c._count._all]));
  return roles.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    requires2fa: r.requires2fa,
    color: r.color,
    userCount: countBy.get(r.id) ?? 0,
    permissions: r.permissions.map((p) => ({ module: p.module, action: p.action, scope: p.scope as Scope })),
  }));
}

export async function createRole(
  db: TenantDb,
  session: SessionData,
  input: { name: string; description?: string | null; copyFromRoleId?: string | null },
) {
  const name = input.name.trim();
  if (!name) throw badRequest("اسم الدور مطلوب");
  const key = `CUSTOM_${Date.now().toString(36).toUpperCase()}`;
  const last = await db.role.findFirst({ orderBy: { position: "desc" } });
  const role = await db.role.create({
    data: {
      tenantId: session.tenant.id,
      key,
      name,
      description: input.description ?? null,
      isSystem: false,
      position: (last?.position ?? 0) + 1,
      createdById: session.user.id,
    },
  });
  if (input.copyFromRoleId) {
    const source = await db.rolePermission.findMany({ where: { roleId: input.copyFromRoleId } });
    if (source.length) {
      await db.rolePermission.createMany({
        data: source.map((p) => ({ tenantId: session.tenant.id, roleId: role.id, module: p.module, action: p.action, scope: p.scope })),
      });
    }
  }
  return role;
}

export async function updateRole(
  db: TenantDb,
  _session: SessionData,
  input: { roleId: string; name?: string; description?: string | null; requires2fa?: boolean; color?: string },
) {
  const role = await db.role.findFirst({ where: { id: input.roleId } });
  if (!role) throw notFound("الدور غير موجود");
  if (role.key === "OWNER" && input.requires2fa === false) throw badRequest("المصادقة الثنائية إلزامية لمالك النظام");
  return db.role.update({
    where: { id: role.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() || role.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.requires2fa !== undefined ? { requires2fa: input.requires2fa } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    },
  });
}

export async function setRolePermissions(
  db: TenantDb,
  session: SessionData,
  input: { roleId: string; grants: Array<{ module: string; action: string; scope: Scope }> },
) {
  const role = await db.role.findFirst({ where: { id: input.roleId } });
  if (!role) throw notFound("الدور غير موجود");
  if (role.key === "OWNER") throw new AppError("FORBIDDEN", "صلاحيات مالك النظام ثابتة ولا يمكن تعديلها");
  const seen = new Set<string>();
  for (const g of input.grants) {
    if (!isValidPermission(g.module, g.action)) throw badRequest(`صلاحية غير معروفة: ${g.module}:${g.action}`);
    if (!SCOPES.includes(g.scope)) throw badRequest("نطاق غير صالح");
    const key = `${g.module}:${g.action}`;
    if (seen.has(key)) throw badRequest("صلاحية مكررة");
    seen.add(key);
  }
  const before = await db.rolePermission.findMany({ where: { roleId: role.id } });
  const beforeMap = new Map(before.map((p) => [`${p.module}:${p.action}`, p.scope]));
  const afterMap = new Map(input.grants.map((g) => [`${g.module}:${g.action}`, g.scope]));
  const added = [...afterMap].filter(([k, s]) => beforeMap.get(k) !== s).map(([k, s]) => `${k}=${s}`);
  const removed = [...beforeMap.keys()].filter((k) => !afterMap.has(k));

  await db.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (input.grants.length) {
      await tx.rolePermission.createMany({
        data: input.grants.map((g) => ({ tenantId: session.tenant.id, roleId: role.id, module: g.module, action: g.action, scope: g.scope })),
      });
    }
  });
  await writeAudit(
    { tenantId: session.tenant.id, actor: { id: session.user.id, name: session.user.name } },
    {
      action: "PERMISSION_CHANGE",
      entityType: "Role",
      entityId: role.id,
      summary: `صلاحيات دور ${role.name}: +${added.length} / -${removed.length}`,
      oldValue: { removed },
      newValue: { added },
    },
  );
  return { added: added.length, removed: removed.length };
}

export async function deleteRole(db: TenantDb, _session: SessionData, roleId: string) {
  const role = await db.role.findFirst({ where: { id: roleId } });
  if (!role) throw notFound("الدور غير موجود");
  if (role.isSystem) throw new AppError("FORBIDDEN", "لا يمكن حذف الأدوار النظامية");
  const users = await db.userRole.count({ where: { roleId: role.id } });
  if (users > 0) throw new AppError("CONFLICT", `الدور مسند إلى ${users} مستخدم. أزل الإسناد أولاً`);
  await db.role.delete({ where: { id: role.id } });
  return { id: role.id };
}
