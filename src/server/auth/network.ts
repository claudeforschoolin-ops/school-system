/**
 * قيد الشبكة (قائمة عناوين IP المسموحة) — يُطبَّق على tRPC ومسارات التنزيل وصفحات التطبيق.
 */
import { headers } from "next/headers";
import { ipAllowed } from "@/lib/ip";
import type { SessionData } from "@/server/auth/session";
import { readModuleSettings } from "@/server/services/module-settings.service";

export const NETWORK_BLOCKED_MESSAGE = "حسابك مقيّد بشبكة المدرسة؛ اتصل من داخل المدرسة أو تواصل مع مسؤول النظام";

export function clientIpFrom(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? null;
  return h.get("x-real-ip");
}

/** هل يُسمح لهذه الجلسة من هذا العنوان؟ (يُطبَّق على الأدوار الحساسة أو كل الموظفين حسب الإعداد) */
export function networkAllowed(session: SessionData, ip: string | null | undefined) {
  const sec = readModuleSettings(session.tenant.settings, "security");
  if (!sec.ipRestrictionEnabled || !sec.ipAllowlist.length) return true;
  const applies = sec.ipScope === "ALL_STAFF" ? session.roleKeys.some((k) => k !== "PARENT" && k !== "STUDENT") : Boolean(session.sensitive);
  return !applies || ipAllowed(ip, sec.ipAllowlist);
}

/** للمسارات والصفحات على الخادم: عنوان الطلب الحالي من الترويسات */
export async function requestNetworkAllowed(session: SessionData) {
  return networkAllowed(session, clientIpFrom(await headers()));
}
