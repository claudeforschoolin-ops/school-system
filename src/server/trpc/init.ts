/**
 * تهيئة tRPC: المحوّل، تنسيق الأخطاء بالعربية، وإجراءات المصادقة والصلاحيات.
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { resolveScope, type DataScope } from "@/lib/rbac/access";
import type { Action } from "@/lib/rbac/catalog";
import { TenantIsolationError, type TenantDb } from "@/server/db/tenant";
import { AppError } from "@/server/errors";
import type { SessionData } from "@/server/auth/session";
import type { Context } from "./context";

export interface Meta {
  /** يسمح بالإجراء قبل إكمال المصادقة الثنائية (إعدادها أو التحقق منها) */
  allowPending2fa?: boolean;
}

const INTERNAL_MESSAGE = "حدث خطأ غير متوقع. حاول مجدداً، وإن تكرر فتواصل مع الدعم الفني";

const t = initTRPC
  .context<Context>()
  .meta<Meta>()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      const zod = error.cause instanceof ZodError ? error.cause.flatten() : null;
      const isInternal = error.code === "INTERNAL_SERVER_ERROR";
      return {
        ...shape,
        message: isInternal && process.env.NODE_ENV === "production" ? INTERNAL_MESSAGE : shape.message,
        data: {
          ...shape.data,
          stack: process.env.NODE_ENV === "production" ? undefined : shape.data.stack,
          fieldErrors: zod?.fieldErrors ?? null,
        },
      };
    },
  });

/** تحويل أخطاء التطبيق وقاعدة البيانات إلى أخطاء tRPC برسائل عربية */
function toTrpcError(cause: unknown): TRPCError | null {
  if (cause instanceof AppError) return new TRPCError({ code: cause.code, message: cause.message, cause });
  if (cause instanceof TenantIsolationError) return new TRPCError({ code: "FORBIDDEN", message: cause.message, cause });
  if (cause instanceof ZodError) return new TRPCError({ code: "BAD_REQUEST", message: "البيانات المدخلة غير صالحة", cause });
  if (cause instanceof Prisma.PrismaClientKnownRequestError) {
    if (cause.code === "P2002") return new TRPCError({ code: "CONFLICT", message: "القيمة مستخدمة مسبقاً ويجب أن تكون فريدة", cause });
    if (cause.code === "P2025") return new TRPCError({ code: "NOT_FOUND", message: "العنصر المطلوب غير موجود أو تم حذفه", cause });
    if (cause.code === "P2003") return new TRPCError({ code: "BAD_REQUEST", message: "لا يمكن تنفيذ العملية لارتباط العنصر ببيانات أخرى", cause });
  }
  return null;
}

const errorMapping = t.middleware(async ({ next, path }) => {
  const result = await next();
  if (!result.ok) {
    const mapped = toTrpcError(result.error.cause) ?? (result.error.cause ? toTrpcError(result.error) : null);
    if (mapped) throw mapped;
    if (result.error.code === "INTERNAL_SERVER_ERROR") {
      console.error(`[trpc] ${path}:`, result.error.cause ?? result.error);
    }
  }
  return result;
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const middleware = t.middleware;

export const publicProcedure = t.procedure.use(errorMapping);

export interface AuthedContext extends Context {
  session: SessionData;
  db: TenantDb;
}

export const authedProcedure = publicProcedure.use(async ({ ctx, meta, next }) => {
  if (!ctx.session || !ctx.db) throw new TRPCError({ code: "UNAUTHORIZED", message: "يجب تسجيل الدخول أولاً" });
  const pending = ctx.session.requires2faChallenge || ctx.session.requires2faSetup;
  if (pending && !meta?.allowPending2fa) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ctx.session.requires2faChallenge ? "أكمل التحقق بخطوتين للمتابعة" : "يجب تفعيل المصادقة الثنائية لدورك قبل المتابعة",
    });
  }
  return next({ ctx: { ...ctx, session: ctx.session, db: ctx.db } as AuthedContext });
});

/** إجراء محمي بصلاحية (وحدة × إجراء) ويضيف نطاق البيانات إلى السياق */
export function permissionProcedure(module: string, action: Action) {
  return authedProcedure.use(async ({ ctx, next }) => {
    const scope = resolveScope(ctx.session.access, module, action);
    if (!scope) throw new TRPCError({ code: "FORBIDDEN", message: "ليست لديك صلاحية لتنفيذ هذا الإجراء" });
    return next({ ctx: { ...ctx, scope } as AuthedContext & { scope: DataScope } });
  });
}
