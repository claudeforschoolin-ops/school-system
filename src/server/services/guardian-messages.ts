/**
 * رسائل أولياء الأمور (قبول، غياب، استدعاء…) بقوالب قابلة للتخصيص من إعدادات المدرسة.
 * الإرسال عبر صندوق الإرسال (لا مزوّد رسائل مربوط بعد)، ومع إشعار داخلي إن كان لولي الأمر حساب.
 */
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { notify } from "./notifications.service";
import { deliver } from "./outbox";

import { DEFAULT_TEMPLATES, type TemplateKey } from "./template-defaults";

export { DEFAULT_TEMPLATES, type TemplateKey };

export function renderTemplate(session: Pick<SessionData, "tenant">, key: TemplateKey, vars: Record<string, string | number | null | undefined>): string {
  const custom = (session.tenant.settings as { messageTemplates?: Partial<Record<TemplateKey, string>> }).messageTemplates?.[key];
  const template = custom?.trim() || DEFAULT_TEMPLATES[key];
  const all: Record<string, string | number | null | undefined> = { school: session.tenant.name, ...vars };
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(all[k] ?? ""));
}

/** يرسل رسالة لأولياء أمور الطالب المسجّلين لتلقي الإشعارات */
export async function messageGuardians(
  db: TenantDb,
  session: Pick<SessionData, "tenant" | "user">,
  studentId: string,
  key: TemplateKey,
  vars: Record<string, string | number | null | undefined>,
  options: { link?: string; title?: string } = {},
): Promise<number> {
  const links = await db.studentGuardian.findMany({
    where: { studentId, receivesNotifications: true },
    include: { guardian: { select: { phone: true, email: true, userId: true } } },
  });
  const body = renderTemplate(session, key, vars);
  const userIds: string[] = [];
  for (const l of links) {
    if (l.guardian.phone) await deliver({ tenantId: session.tenant.id, channel: "sms", to: l.guardian.phone, body });
    if (l.guardian.userId) userIds.push(l.guardian.userId);
  }
  if (userIds.length) {
    await notify(db, { tenantId: session.tenant.id, userIds, type: "SYSTEM", title: options.title ?? body.slice(0, 120), body, link: options.link ?? null, actorId: session.user.id, entityType: "Student", entityId: studentId });
  }
  return links.length;
}

/** رسالة إلى جهة اتصال مباشرة (قبل وجود ملف طالب، مثل طلبات القبول) */
export async function messageContact(session: Pick<SessionData, "tenant">, to: { phone?: string | null; email?: string | null }, key: TemplateKey, vars: Record<string, string | number | null | undefined>) {
  const body = renderTemplate(session, key, vars);
  if (to.phone) await deliver({ tenantId: session.tenant.id, channel: "sms", to: to.phone, body });
  if (to.email) await deliver({ tenantId: session.tenant.id, channel: "email", to: to.email, subject: session.tenant.name, body });
}
