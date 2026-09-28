import { randomUUID } from "node:crypto";
import { rootDb } from "@/server/db/client";
import { createSession, validateSessionToken, type CookieJar } from "@/server/auth/session";
import { provisionTenant } from "@/server/services/admin/provisioning.service";
import { buildContext } from "@/server/trpc/context";
import { createCaller } from "@/server/trpc/root";

export const uid = () => randomUUID().slice(0, 8);

/** مستأجر جديد بأدواره ومساحاته الافتراضية */
export async function makeTenant(label = "مدرسة اختبار") {
  return provisionTenant({ slug: `t-${uid()}`, name: `${label} ${uid()}` });
}

/** مستخدم بدور نظامي (مع قيد فرع/مرحلة اختياري) */
export async function makeUser(tenant: Awaited<ReturnType<typeof makeTenant>>, roleKey: string, opts: { branchId?: string; stageId?: string; name?: string; twoFactor?: boolean } = {}) {
  const user = await rootDb.user.create({
    data: {
      tenantId: tenant.tenant.id,
      email: `${roleKey.toLowerCase()}-${uid()}@test.manassa.sa`,
      name: opts.name ?? `مستخدم ${roleKey}`,
      // الأدوار الحساسة تتطلب المصادقة الثنائية؛ الجلسات في الاختبار متحققة ثنائياً
      twoFactorEnabled: opts.twoFactor ?? true,
    },
  });
  await rootDb.userRole.create({ data: { tenantId: tenant.tenant.id, userId: user.id, roleId: tenant.roles[roleKey]!, branchId: opts.branchId ?? null, stageId: opts.stageId ?? null } });
  return user;
}

const memoryJar = (): CookieJar => {
  const store = new Map<string, string>();
  return { get: (n) => store.get(n), set: (n, v) => void store.set(n, v), delete: (n) => void store.delete(n) };
};

/** مستدعي tRPC بجلسة حقيقية (كما لو كان المستخدم مسجلاً ومتحققاً ثنائياً) */
export async function callerFor(tenantId: string, userId: string) {
  const { token } = await createSession({ tenantId, userId, twoFactorVerified: true, ip: "10.0.0.7", userAgent: "vitest" });
  const session = await validateSessionToken(token);
  if (!session) throw new Error("تعذّر إنشاء الجلسة");
  return { caller: createCaller(buildContext({ session, ip: "10.0.0.7", userAgent: "vitest", cookies: memoryJar() })), session };
}
