/**
 * سياق tRPC لكل طلب: الجلسة، عميل قاعدة البيانات المقيّد بالمستأجر، وبيانات الطلب.
 */
import { cookies } from "next/headers";
import { createTenantDb, type TenantDb } from "@/server/db/tenant";
import { SESSION_COOKIE, validateSessionToken, type CookieJar, type SessionData } from "@/server/auth/session";

export interface Context {
  session: SessionData | null;
  /** عميل مقيّد بمستأجر المستخدم الحالي (null لغير المسجّلين) */
  db: TenantDb | null;
  ip: string | null;
  userAgent: string | null;
  cookies: CookieJar;
}

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return headers.get("x-real-ip");
}

export async function nextCookieJar(): Promise<CookieJar> {
  const store = await cookies();
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, options) => {
      store.set(name, value, options);
    },
    delete: (name) => {
      store.delete(name);
    },
  };
}

export function buildContext(params: {
  session: SessionData | null;
  ip: string | null;
  userAgent: string | null;
  cookies: CookieJar;
}): Context {
  const { session } = params;
  return {
    ...params,
    db: session
      ? createTenantDb({
          tenantId: session.tenant.id,
          actor: { id: session.user.id, name: session.user.name },
          ip: params.ip,
          userAgent: params.userAgent,
        })
      : null,
  };
}

export async function createContext({ req }: { req: Request }): Promise<Context> {
  const jar = await nextCookieJar();
  const session = await validateSessionToken(jar.get(SESSION_COOKIE));
  return buildContext({ session, ip: clientIp(req.headers), userAgent: req.headers.get("user-agent"), cookies: jar });
}
