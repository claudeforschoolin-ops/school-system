import { z } from "zod";
import { SCOPES } from "@/lib/rbac/catalog";
import * as users from "@/server/services/admin/users.service";
import * as roles from "@/server/services/admin/roles.service";
import * as org from "@/server/services/admin/org.service";
import * as audit from "@/server/services/admin/audit.service";
import { permissionProcedure, router } from "../init";

const id = z.string().min(1).max(64);
const roleAssignment = z.object({ roleId: id, branchId: id.nullish(), stageId: id.nullish() });

export const usersRouter = router({
  list: permissionProcedure("users", "view")
    .input(z.object({ search: z.string().max(100).optional(), status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]).optional(), roleId: id.optional() }))
    .query(({ ctx, input }) => users.listUsers(ctx.db, input)),
  invite: permissionProcedure("users", "create")
    .input(z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().max(200), phone: z.string().max(30).nullish(), jobTitle: z.string().max(120).nullish(), roles: z.array(roleAssignment).min(1).max(10) }))
    .mutation(({ ctx, input }) => users.inviteUser(ctx.db, ctx.session, input)),
  resendInvite: permissionProcedure("users", "create").input(z.object({ userId: id })).mutation(({ ctx, input }) => users.resendInvite(ctx.db, ctx.session, input.userId)),
  update: permissionProcedure("users", "update")
    .input(z.object({ userId: id, name: z.string().max(120).optional(), jobTitle: z.string().max(120).nullish(), phone: z.string().max(30).nullish() }))
    .mutation(({ ctx, input }) => users.updateUser(ctx.db, ctx.session, input)),
  setRoles: permissionProcedure("users", "update")
    .input(z.object({ userId: id, roles: z.array(roleAssignment).min(1).max(10) }))
    .mutation(({ ctx, input }) => users.setUserRoles(ctx.db, ctx.session, input)),
  setStatus: permissionProcedure("users", "update")
    .input(z.object({ userId: id, status: z.enum(["ACTIVE", "SUSPENDED"]) }))
    .mutation(({ ctx, input }) => users.setUserStatus(ctx.db, ctx.session, input)),
  unlock: permissionProcedure("users", "update").input(z.object({ userId: id })).mutation(({ ctx, input }) => users.unlockUser(ctx.db, ctx.session, input.userId)),
  sendReset: permissionProcedure("users", "update").input(z.object({ userId: id })).mutation(({ ctx, input }) => users.sendResetLink(ctx.db, ctx.session, input.userId)),
  sessions: permissionProcedure("users", "view").input(z.object({ userId: id })).query(({ ctx, input }) => users.listUserSessions(ctx.db, input.userId)),
  revokeSession: permissionProcedure("users", "update").input(z.object({ sessionId: id })).mutation(({ ctx, input }) => users.revokeUserSession(ctx.db, ctx.session, input.sessionId)),
});

export const rolesRouter = router({
  list: permissionProcedure("roles", "view").query(({ ctx }) => roles.listRoles(ctx.db)),
  /** قائمة مختصرة للأدوار (لنموذج الدعوة) */
  options: permissionProcedure("users", "view").query(({ ctx }) =>
    ctx.db.role.findMany({ select: { id: true, key: true, name: true, description: true, color: true }, orderBy: { position: "asc" } }),
  ),
  create: permissionProcedure("roles", "create")
    .input(z.object({ name: z.string().trim().min(2).max(80), description: z.string().max(300).nullish(), copyFromRoleId: id.nullish() }))
    .mutation(({ ctx, input }) => roles.createRole(ctx.db, ctx.session, input)),
  update: permissionProcedure("roles", "update")
    .input(z.object({ roleId: id, name: z.string().max(80).optional(), description: z.string().max(300).nullish(), requires2fa: z.boolean().optional(), color: z.string().max(20).optional() }))
    .mutation(({ ctx, input }) => roles.updateRole(ctx.db, ctx.session, input)),
  setPermissions: permissionProcedure("roles", "update")
    .input(z.object({ roleId: id, grants: z.array(z.object({ module: z.string().max(60), action: z.string().max(20), scope: z.enum(SCOPES) })).max(1000) }))
    .mutation(({ ctx, input }) => roles.setRolePermissions(ctx.db, ctx.session, input)),
  delete: permissionProcedure("roles", "delete").input(z.object({ roleId: id })).mutation(({ ctx, input }) => roles.deleteRole(ctx.db, ctx.session, input.roleId)),
});

const branchInput = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(2).max(120),
  gender: z.enum(["BOYS", "GIRLS", "MIXED"]),
  address: z.string().max(300).nullish(),
  phone: z.string().max(30).nullish(),
  email: z.string().max(200).nullish(),
});

export const orgRouter = router({
  settings: permissionProcedure("settings", "view").query(({ ctx }) => org.getSettings(ctx.db, ctx.session)),
  updateSettings: permissionProcedure("settings", "update")
    .input(
      z.object({
        name: z.string().max(200).optional(),
        platformName: z.string().max(60).optional(),
        logoUrl: z.string().max(500).nullish(),
        accentColor: z.string().max(20).optional(),
        currency: z.string().length(3).optional(),
        timezone: z.string().max(60).optional(),
        settings: z
          .object({
            passwordPolicy: z
              .object({
                minLength: z.number().int().min(8).max(64),
                requireLetters: z.boolean(),
                requireDigits: z.boolean(),
                requireSymbols: z.boolean(),
                maxFailedAttempts: z.number().int().min(3).max(20),
                lockMinutes: z.number().int().min(1).max(1440),
              })
              .optional(),
            defaultDigits: z.enum(["arab", "latn"]).optional(),
            defaultCalendar: z.enum(["gregory", "hijri", "both"]).optional(),
            address: z.string().max(300).optional(),
            phone: z.string().max(30).optional(),
            email: z.string().max(200).optional(),
            website: z.string().max(200).optional(),
            taxNumber: z.string().max(40).optional(),
            crNumber: z.string().max(40).optional(),
          })
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) => org.updateSettings(ctx.db, ctx.session, input)),
  branches: permissionProcedure("settings", "view").input(z.object({ includeArchived: z.boolean().optional() }).optional()).query(({ ctx, input }) => org.listBranches(ctx.db, input?.includeArchived)),
  /** قائمة الفروع للاختيار (متاحة لمن يدير المستخدمين) */
  branchOptions: permissionProcedure("users", "view").query(({ ctx }) =>
    ctx.db.branch.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true }, orderBy: { code: "asc" } }),
  ),
  stageOptions: permissionProcedure("users", "view").query(({ ctx }) =>
    ctx.db.stage.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true }, orderBy: { order: "asc" } }),
  ),
  createBranch: permissionProcedure("settings", "update").input(branchInput).mutation(({ ctx, input }) => org.createBranch(ctx.db, ctx.session, input)),
  updateBranch: permissionProcedure("settings", "update")
    .input(branchInput.partial().extend({ id, isActive: z.boolean().optional() }))
    .mutation(({ ctx, input }) => {
      const { id: branchId, ...rest } = input;
      return org.updateBranch(ctx.db, ctx.session, branchId, rest);
    }),
  archiveBranch: permissionProcedure("settings", "update").input(z.object({ id })).mutation(({ ctx, input }) => org.archiveBranch(ctx.db, ctx.session, input.id)),
  structure: permissionProcedure("settings", "view").query(({ ctx }) => org.structure(ctx.db)),
  outbox: permissionProcedure("settings", "view").query(({ ctx }) =>
    ctx.db.outboundMessage.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  ),
});

export const auditRouter = router({
  list: permissionProcedure("audit", "view")
    .input(
      z.object({
        userId: id.nullish(),
        entityType: z.string().max(60).nullish(),
        entityId: id.nullish(),
        action: z.string().max(40).nullish(),
        from: z.coerce.date().nullish(),
        to: z.coerce.date().nullish(),
        search: z.string().max(100).nullish(),
        cursor: id.nullish(),
      }),
    )
    .query(({ ctx, input }) => audit.listAudit(ctx.db, input)),
  facets: permissionProcedure("audit", "view").query(({ ctx }) => audit.auditFacets(ctx.db)),
});
