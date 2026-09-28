import { z } from "zod";
import { writeAudit } from "@/server/db/tenant";
import { clearSessionCookie, revokeSession, SESSION_COOKIE, setSessionCookie } from "@/server/auth/session";
import * as auth from "@/server/services/auth.service";
import { authedProcedure, publicProcedure, router } from "../init";

const email = z.string().trim().min(3, "أدخل البريد الإلكتروني").max(200);

export const authRouter = router({
  /** بيانات الجلسة الحالية (أو null) */
  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.session) return null;
    const s = ctx.session;
    return {
      user: s.user,
      tenant: { id: s.tenant.id, name: s.tenant.name, platformName: s.tenant.platformName, logoUrl: s.tenant.logoUrl, isDemo: s.tenant.isDemo },
      requires2faSetup: s.requires2faSetup,
      requires2faChallenge: s.requires2faChallenge,
    };
  }),

  login: publicProcedure
    .input(z.object({ email, password: z.string().min(1, "أدخل كلمة المرور").max(200), tenantSlug: z.string().max(100).nullish() }))
    .mutation(async ({ ctx, input }) => {
      const result = await auth.login(input, { ip: ctx.ip, userAgent: ctx.userAgent });
      if (result.status === "ok") {
        setSessionCookie(ctx.cookies, result.token);
        return { status: "ok" as const, next: result.next };
      }
      return result;
    }),

  requestOtp: publicProcedure
    .input(z.object({ identifier: z.string().trim().min(3).max(200), tenantSlug: z.string().max(100).nullish() }))
    .mutation(({ ctx, input }) => auth.requestLoginOtp(input, { ip: ctx.ip, userAgent: ctx.userAgent })),

  verifyOtp: publicProcedure
    .input(z.object({ challengeId: z.string().min(10).max(100), code: z.string().trim().min(4).max(10) }))
    .mutation(async ({ ctx, input }) => {
      const result = await auth.verifyLoginOtp(input, { ip: ctx.ip, userAgent: ctx.userAgent });
      if (result.status === "ok") {
        setSessionCookie(ctx.cookies, result.token);
        return { status: "ok" as const, next: result.next };
      }
      return result;
    }),

  verifyTwoFactor: authedProcedure
    .meta({ allowPending2fa: true })
    .input(z.object({ code: z.string().trim().min(6).max(20) }))
    .mutation(async ({ ctx, input }) => {
      await auth.verifyTwoFactorForSession(ctx.session.sessionId, input.code, { ip: ctx.ip, userAgent: ctx.userAgent });
      return { next: ctx.session.requires2faSetup ? "/setup-2fa" : "/home" };
    }),

  requestPasswordReset: publicProcedure
    .input(z.object({ email, tenantSlug: z.string().max(100).nullish() }))
    .mutation(async ({ ctx, input }) => {
      await auth.requestPasswordReset(input, { ip: ctx.ip, userAgent: ctx.userAgent });
      return { ok: true };
    }),

  inspectToken: publicProcedure
    .input(z.object({ token: z.string().min(10).max(200), type: z.enum(["PASSWORD_RESET", "INVITE"]) }))
    .query(({ input }) => auth.inspectToken(input.token, input.type)),

  resetPassword: publicProcedure
    .input(z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      await auth.resetPassword(input, { ip: ctx.ip, userAgent: ctx.userAgent });
      return { ok: true };
    }),

  acceptInvite: publicProcedure
    .input(z.object({ token: z.string().min(10).max(200), password: z.string().min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const result = await auth.acceptInvite(input, { ip: ctx.ip, userAgent: ctx.userAgent });
      setSessionCookie(ctx.cookies, result.token);
      return { next: result.next };
    }),

  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.session) {
      await revokeSession(ctx.session.sessionId);
      await writeAudit(
        { tenantId: ctx.session.tenant.id, actor: { id: ctx.session.user.id, name: ctx.session.user.name }, ip: ctx.ip, userAgent: ctx.userAgent },
        { action: "LOGOUT", entityType: "Auth", entityId: ctx.session.user.id, summary: ctx.session.user.email },
      );
    }
    if (ctx.cookies.get(SESSION_COOKIE)) clearSessionCookie(ctx.cookies);
    return { ok: true };
  }),
});
