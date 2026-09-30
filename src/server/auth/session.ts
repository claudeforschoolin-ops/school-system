/**
 * الجلسات: رمز عشوائي في ملف تعريف ارتباط HttpOnly، ويُخزَّن في قاعدة البيانات
 * مُجزّأً فقط (SHA-256). تدعم الجلسات المتعددة الأجهزة وإنهاءها عن بُعد.
 */
import { rootDb } from "@/server/db/client";
import type { AccessProfile, RoleAssignment } from "@/lib/rbac/access";
import type { Scope } from "@/lib/rbac/catalog";
import { randomToken, sha256 } from "./crypto";
import { describeDevice } from "./device";

export const SESSION_COOKIE = "manassa_session";
export const SESSION_TTL_DAYS = 14;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export interface CookieJar {
  get(name: string): string | undefined;
  set(name: string, value: string, options: { maxAge: number; httpOnly: boolean; secure: boolean; sameSite: "lax"; path: string }): void;
  delete(name: string): void;
}

export interface UserPreferences {
  theme?: "light" | "dark" | "system";
  digits?: "arab" | "latn";
  calendar?: "gregory" | "hijri" | "both";
  locale?: "ar" | "en";
  sidebarWidth?: number;
  sidebarCollapsed?: boolean;
  reducedMotion?: boolean;
}

export interface SessionUser {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  avatarUrl: string | null;
  avatarColor: string;
  twoFactorEnabled: boolean;
  preferences: UserPreferences;
}

export interface SessionTenant {
  id: string;
  slug: string;
  name: string;
  platformName: string;
  logoUrl: string | null;
  accentColor: string;
  currency: string;
  timezone: string;
  settings: Record<string, unknown>;
  isDemo: boolean;
}

export interface SessionData {
  sessionId: string;
  twoFactorVerified: boolean;
  /** دور المستخدم يتطلب المصادقة الثنائية ولم يفعّلها بعد */
  requires2faSetup: boolean;
  /** المستخدم فعّل المصادقة الثنائية ولم يتحقق منها في هذه الجلسة بعد */
  requires2faChallenge: boolean;
  user: SessionUser;
  tenant: SessionTenant;
  access: AccessProfile;
  roleKeys: string[];
  /** أحد أدوار المستخدم حساس (يتطلب التحقق بخطوتين) — لقيود الشبكة */
  sensitive?: boolean;
}

export function cookieOptions(maxAgeSeconds: number) {
  return {
    maxAge: maxAgeSeconds,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function createSession(params: {
  tenantId: string;
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
  twoFactorVerified: boolean;
}): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000);
  const session = await rootDb.session.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      tokenHash: sha256(token),
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      deviceLabel: describeDevice(params.userAgent),
      twoFactorVerified: params.twoFactorVerified,
      expiresAt,
    },
  });
  return { token, sessionId: session.id, expiresAt };
}

export function setSessionCookie(jar: CookieJar, token: string): void {
  jar.set(SESSION_COOKIE, token, cookieOptions(SESSION_TTL_DAYS * 24 * 3600));
}

export function clearSessionCookie(jar: CookieJar): void {
  jar.delete(SESSION_COOKIE);
}

/** يحمّل ملف الصلاحيات للمستخدم (الأدوار + المنح + قيود الفرع/المرحلة) */
export async function loadAccessProfile(tenantId: string, userId: string): Promise<{ profile: AccessProfile; roleKeys: string[]; requires2fa: boolean }> {
  const userRoles = await rootDb.userRole.findMany({
    where: { tenantId, userId },
    include: { role: { include: { permissions: true } } },
  });
  const assignments: RoleAssignment[] = userRoles.map((ur) => ({
    roleKey: ur.role.key,
    roleName: ur.role.name,
    branchId: ur.branchId,
    stageId: ur.stageId,
    grants: ur.role.permissions.map((p) => ({ module: p.module, action: p.action, scope: p.scope as Scope })),
  }));
  return {
    profile: { userId, assignments },
    roleKeys: [...new Set(userRoles.map((ur) => ur.role.key))],
    requires2fa: userRoles.some((ur) => ur.role.requires2fa),
  };
}

/** التحقق من رمز الجلسة وتحميل بياناتها كاملة */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionData | null> {
  if (!token) return null;
  const session = await rootDb.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: { include: { tenant: true } } },
  });
  if (!session) return null;
  const now = Date.now();
  if (session.revokedAt || session.expiresAt.getTime() <= now) return null;
  const { user } = session;
  if (user.status !== "ACTIVE" || user.deletedAt || user.tenantId !== session.tenantId) return null;

  if (now - session.lastActiveAt.getTime() > TOUCH_INTERVAL_MS) {
    await rootDb.session.update({ where: { id: session.id }, data: { lastActiveAt: new Date() } });
  }

  const { profile, roleKeys, requires2fa } = await loadAccessProfile(user.tenantId, user.id);
  const tenant = user.tenant;
  return {
    sessionId: session.id,
    twoFactorVerified: session.twoFactorVerified,
    requires2faSetup: requires2fa && !user.twoFactorEnabled,
    requires2faChallenge: user.twoFactorEnabled && !session.twoFactorVerified,
    user: {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      phone: user.phone,
      jobTitle: user.jobTitle,
      avatarUrl: user.avatarUrl,
      avatarColor: user.avatarColor,
      twoFactorEnabled: user.twoFactorEnabled,
      preferences: (user.preferences ?? {}) as UserPreferences,
    },
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      platformName: tenant.platformName,
      logoUrl: tenant.logoUrl,
      accentColor: tenant.accentColor,
      currency: tenant.currency,
      timezone: tenant.timezone,
      settings: (tenant.settings ?? {}) as Record<string, unknown>,
      isDemo: tenant.isDemo,
    },
    access: profile,
    roleKeys,
    sensitive: requires2fa,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await rootDb.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function revokeAllUserSessions(tenantId: string, userId: string, exceptSessionId?: string): Promise<number> {
  const result = await rootDb.session.updateMany({
    where: { tenantId, userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/**
 * جلسة نظام للمهام المجدولة (الإهلاك الشهري، الصيانة الوقائية…): تعمل بصلاحيات مالك المدرسة
 * وتُنسب عملياتها إليه في سجل التدقيق. لا تُنشأ جلسة دخول فعلية.
 */
export async function systemSessionFor(tenantId: string): Promise<SessionData | null> {
  const owner = await rootDb.user.findFirst({ where: { tenantId, status: "ACTIVE", deletedAt: null, roles: { some: { role: { key: "OWNER" } } } }, orderBy: { createdAt: "asc" } });
  return owner ? sessionForUser(tenantId, owner.id) : null;
}

/** جلسة خادمية بصلاحيات مستخدم محدد (لتشغيل تقاريره المجدولة بنطاقه هو لا أوسع) */
export async function sessionForUser(tenantId: string, userId: string): Promise<SessionData | null> {
  const owner = await rootDb.user.findFirst({ where: { id: userId, tenantId, status: "ACTIVE", deletedAt: null }, include: { tenant: true } });
  if (!owner) return null;
  const { profile, roleKeys } = await loadAccessProfile(tenantId, owner.id);
  const t = owner.tenant;
  return {
    sessionId: "system",
    twoFactorVerified: true,
    requires2faSetup: false,
    requires2faChallenge: false,
    user: { id: owner.id, tenantId, name: owner.name, email: owner.email, phone: owner.phone, jobTitle: owner.jobTitle, avatarUrl: owner.avatarUrl, avatarColor: owner.avatarColor, twoFactorEnabled: owner.twoFactorEnabled, preferences: (owner.preferences ?? {}) as UserPreferences },
    tenant: { id: t.id, slug: t.slug, name: t.name, platformName: t.platformName, logoUrl: t.logoUrl, accentColor: t.accentColor, currency: t.currency, timezone: t.timezone, settings: (t.settings ?? {}) as Record<string, unknown>, isDemo: t.isDemo },
    access: profile,
    roleKeys,
  };
}
