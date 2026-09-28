import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { revokeAllUserSessions } from "@/server/auth/session";
import * as auth from "@/server/services/auth.service";
import { listUserSessions, revokeUserSession } from "@/server/services/admin/users.service";
import { flattenPermissions } from "@/lib/rbac/access";
import { badRequest } from "@/server/errors";
import { authedProcedure, router } from "../init";

const preferencesSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  digits: z.enum(["arab", "latn"]).optional(),
  calendar: z.enum(["gregory", "hijri", "both"]).optional(),
  locale: z.enum(["ar", "en"]).optional(),
  sidebarWidth: z.number().int().min(220).max(380).optional(),
  sidebarCollapsed: z.boolean().optional(),
  reducedMotion: z.boolean().optional(),
});

export const accountRouter = router({
  /** بيانات المستخدم الحالي مع الصلاحيات المسطحة (لإظهار/إخفاء عناصر الواجهة) */
  context: authedProcedure.meta({ allowPending2fa: true }).query(({ ctx }) => {
    const s = ctx.session;
    return {
      user: s.user,
      tenant: s.tenant,
      roles: s.access.assignments.map((a) => ({ key: a.roleKey, name: a.roleName, branchId: a.branchId, stageId: a.stageId })),
      permissions: flattenPermissions(s.access),
      requires2faSetup: s.requires2faSetup,
      sessionId: s.sessionId,
    };
  }),

  updateProfile: authedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(120).optional(), jobTitle: z.string().max(120).nullish(), phone: z.string().max(30).nullish(), avatarColor: z.enum(["navy", "teal", "slate", "gold", "green", "orange", "red", "purple", "brown"]).optional() }))
    .mutation(({ ctx, input }) =>
      ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.jobTitle !== undefined ? { jobTitle: input.jobTitle || null } : {}),
          ...(input.phone !== undefined ? { phone: input.phone || null } : {}),
          ...(input.avatarColor ? { avatarColor: input.avatarColor } : {}),
          updatedById: ctx.session.user.id,
        },
        select: { id: true },
      }),
    ),

  updatePreferences: authedProcedure
    .meta({ allowPending2fa: true })
    .input(preferencesSchema)
    .mutation(async ({ ctx, input }) => {
      const merged = { ...ctx.session.user.preferences, ...input };
      // التفضيلات لا تحتاج تدقيقاً (تغييرات شخصية عالية التكرار) فتُحدَّث عبر استعلام مباشر مقيّد
      await ctx.db.$executeRaw`UPDATE "User" SET "preferences" = ${JSON.stringify(merged)}::jsonb WHERE id = ${ctx.session.user.id} AND "tenantId" = ${ctx.session.tenant.id}`;
      return merged as Prisma.JsonObject;
    }),

  changePassword: authedProcedure
    .input(z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await auth.changePassword(ctx.session.user.id, input, ctx.session.sessionId, { ip: ctx.ip, userAgent: ctx.userAgent });
      return { ok: true };
    }),

  twoFactorBegin: authedProcedure.meta({ allowPending2fa: true }).mutation(({ ctx }) => {
    if (ctx.session.requires2faChallenge) throw badRequest("أكمل التحقق بخطوتين أولاً");
    return auth.beginTwoFactorSetup(ctx.session.user.id);
  }),

  twoFactorConfirm: authedProcedure
    .meta({ allowPending2fa: true })
    .input(z.object({ code: z.string().trim().length(6) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.session.requires2faChallenge) throw badRequest("أكمل التحقق بخطوتين أولاً");
      const backupCodes = await auth.confirmTwoFactorSetup(ctx.session.user.id, input.code, ctx.session.sessionId, { ip: ctx.ip, userAgent: ctx.userAgent });
      return { backupCodes };
    }),

  twoFactorDisable: authedProcedure
    .input(z.object({ password: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await auth.disableTwoFactor(ctx.session.user.id, input.password, { ip: ctx.ip, userAgent: ctx.userAgent });
      return { ok: true };
    }),

  sessions: authedProcedure.meta({ allowPending2fa: true }).query(async ({ ctx }) => {
    const sessions = await listUserSessions(ctx.db, ctx.session.user.id);
    return sessions.map((s) => ({ ...s, isCurrent: s.id === ctx.session.sessionId }));
  }),

  revokeSession: authedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(({ ctx, input }) => revokeUserSession(ctx.db, ctx.session, input.sessionId)),

  revokeOtherSessions: authedProcedure.mutation(async ({ ctx }) => {
    const count = await revokeAllUserSessions(ctx.session.tenant.id, ctx.session.user.id, ctx.session.sessionId);
    return { count };
  }),
});
