/**
 * خدمات المصادقة: الدخول بكلمة المرور، الدخول برمز لمرة واحدة، المصادقة الثنائية،
 * استعادة كلمة المرور، قبول الدعوات، وقفل الحساب بعد المحاولات الفاشلة.
 */
import QRCode from "qrcode";
import { Prisma } from "@/generated/prisma/client";
import { rootDb } from "@/server/db/client";
import { writeAudit } from "@/server/db/tenant";
import { AppError, badRequest } from "@/server/errors";
import { decryptField, encryptField, randomDigits, randomToken, sha256 } from "@/server/auth/crypto";
import { hashPassword, resolvePasswordPolicy, validatePassword, verifyPassword } from "@/server/auth/password";
import { rateLimit } from "@/server/auth/rate-limit";
import { createSession, loadAccessProfile, revokeAllUserSessions } from "@/server/auth/session";
import { generateTotpSecret, totpUri, verifyTotp } from "@/server/auth/totp";
import { deliver } from "./outbox";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export type LoginResult =
  | { status: "choose_tenant"; tenants: Array<{ slug: string; name: string }> }
  | { status: "ok"; token: string; next: string };

const GENERIC_LOGIN_ERROR = "البريد الإلكتروني أو كلمة المرور غير صحيحة";

function appUrl(path: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}

async function findUsersByIdentifier(identifier: string, tenantSlug?: string | null) {
  const value = identifier.trim().toLowerCase();
  const isEmail = value.includes("@");
  return rootDb.user.findMany({
    where: {
      deletedAt: null,
      ...(isEmail ? { email: value } : { phone: identifier.trim() }),
      ...(tenantSlug ? { tenant: { slug: tenantSlug } } : {}),
    },
    include: { tenant: true },
    take: 10,
  });
}

function nextPathAfterLogin(twoFactorEnabled: boolean, requires2fa: boolean): string {
  if (twoFactorEnabled) return "/two-factor";
  if (requires2fa) return "/setup-2fa";
  return "/home";
}

export async function login(
  input: { email: string; password: string; tenantSlug?: string | null },
  meta: RequestMeta,
): Promise<LoginResult> {
  const ipKey = `login:ip:${meta.ip ?? "unknown"}`;
  const idKey = `login:id:${input.email.trim().toLowerCase()}`;
  const ipLimit = rateLimit(ipKey, 30, 10 * 60 * 1000);
  const idLimit = rateLimit(idKey, 10, 10 * 60 * 1000);
  if (!ipLimit.allowed || !idLimit.allowed) {
    throw new AppError("TOO_MANY_REQUESTS", "محاولات كثيرة. يرجى الانتظار قليلاً ثم المحاولة مجدداً");
  }

  const candidates = await findUsersByIdentifier(input.email, input.tenantSlug);
  if (candidates.length > 1 && !input.tenantSlug) {
    return { status: "choose_tenant", tenants: candidates.map((u) => ({ slug: u.tenant.slug, name: u.tenant.name })) };
  }
  const user = candidates[0];
  if (!user) {
    await verifyPassword(input.password, null);
    throw new AppError("UNAUTHORIZED", GENERIC_LOGIN_ERROR);
  }
  const auditCtx = { tenantId: user.tenantId, actor: { id: user.id, name: user.name }, ...meta };

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new AppError("FORBIDDEN", `الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة. حاول بعد ${minutes} دقيقة`);
  }
  if (user.status === "SUSPENDED") throw new AppError("FORBIDDEN", "هذا الحساب موقوف. تواصل مع إدارة النظام");
  if (user.status === "INVITED") throw new AppError("FORBIDDEN", "لم يتم تفعيل الحساب بعد. استخدم رابط الدعوة المرسل إليك");

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    const policy = resolvePasswordPolicy(user.tenant.settings);
    const failed = user.failedLoginCount + 1;
    const lock = failed >= policy.maxFailedAttempts;
    await rootDb.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + policy.lockMinutes * 60000) : null,
      },
    });
    await writeAudit(auditCtx, { action: lock ? "LOCKED" : "LOGIN_FAILED", entityType: "Auth", entityId: user.id, summary: user.email });
    if (lock) throw new AppError("FORBIDDEN", `تم قفل الحساب ${policy.lockMinutes} دقيقة بعد ${policy.maxFailedAttempts} محاولات فاشلة`);
    throw new AppError("UNAUTHORIZED", GENERIC_LOGIN_ERROR);
  }

  await rootDb.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  const { requires2fa } = await loadAccessProfile(user.tenantId, user.id);
  const { token } = await createSession({
    tenantId: user.tenantId,
    userId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    twoFactorVerified: !user.twoFactorEnabled,
  });
  await writeAudit(auditCtx, { action: "LOGIN", entityType: "Auth", entityId: user.id, summary: user.email });
  return { status: "ok", token, next: nextPathAfterLogin(user.twoFactorEnabled, requires2fa) };
}

/** طلب رمز دخول لمرة واحدة (بريد أو جوال). يعيد معرّف التحدي دائماً لمنع كشف وجود الحساب. */
export async function requestLoginOtp(input: { identifier: string; tenantSlug?: string | null }, meta: RequestMeta) {
  const limit = rateLimit(`otp:${input.identifier.trim().toLowerCase()}`, 5, 15 * 60 * 1000);
  const ipLimit = rateLimit(`otp:ip:${meta.ip ?? "unknown"}`, 20, 15 * 60 * 1000);
  if (!limit.allowed || !ipLimit.allowed) throw new AppError("TOO_MANY_REQUESTS", "طلبات كثيرة للرمز. حاول بعد قليل");

  const challengeId = randomToken(24);
  const users = await findUsersByIdentifier(input.identifier, input.tenantSlug);
  const user = users.length === 1 ? users[0] : undefined;
  if (user && user.status === "ACTIVE") {
    const code = randomDigits(6);
    await rootDb.authToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        type: "LOGIN_OTP",
        tokenHash: sha256(challengeId),
        codeHash: sha256(`${challengeId}:${code}`),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    const viaSms = !input.identifier.includes("@");
    await deliver({
      tenantId: user.tenantId,
      channel: viaSms ? "sms" : "email",
      to: viaSms ? (user.phone ?? input.identifier) : user.email,
      subject: "رمز الدخول",
      body: `رمز الدخول إلى ${user.tenant.platformName}: ${code}\nصالح لمدة ١٠ دقائق. لا تشاركه مع أحد.`,
    });
  }
  return { challengeId };
}

export async function verifyLoginOtp(input: { challengeId: string; code: string }, meta: RequestMeta): Promise<LoginResult> {
  const token = await rootDb.authToken.findUnique({ where: { tokenHash: sha256(input.challengeId) } });
  const invalid = new AppError("UNAUTHORIZED", "الرمز غير صحيح أو منتهي الصلاحية");
  if (!token || token.type !== "LOGIN_OTP" || token.usedAt || token.expiresAt.getTime() < Date.now()) throw invalid;
  if (token.attempts >= 5) throw new AppError("FORBIDDEN", "تجاوزت عدد المحاولات المسموح. اطلب رمزاً جديداً");
  if (token.codeHash !== sha256(`${input.challengeId}:${input.code.trim()}`)) {
    await rootDb.authToken.update({ where: { id: token.id }, data: { attempts: { increment: 1 } } });
    throw invalid;
  }
  await rootDb.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
  const user = await rootDb.user.findUniqueOrThrow({ where: { id: token.userId } });
  const { requires2fa } = await loadAccessProfile(user.tenantId, user.id);
  const session = await createSession({
    tenantId: user.tenantId,
    userId: user.id,
    ip: meta.ip,
    userAgent: meta.userAgent,
    twoFactorVerified: !user.twoFactorEnabled,
  });
  await rootDb.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), failedLoginCount: 0 } });
  await writeAudit(
    { tenantId: user.tenantId, actor: { id: user.id, name: user.name }, ...meta },
    { action: "LOGIN", entityType: "Auth", entityId: user.id, summary: `${user.email} (رمز لمرة واحدة)` },
  );
  return { status: "ok", token: session.token, next: nextPathAfterLogin(user.twoFactorEnabled, requires2fa) };
}

/** التحقق من رمز المصادقة الثنائية (أو رمز استرداد) للجلسة الحالية */
export async function verifyTwoFactorForSession(sessionId: string, code: string, meta: RequestMeta): Promise<void> {
  const limit = rateLimit(`2fa:${sessionId}`, 8, 10 * 60 * 1000);
  if (!limit.allowed) throw new AppError("TOO_MANY_REQUESTS", "محاولات كثيرة. انتظر قليلاً");
  const session = await rootDb.session.findUnique({ where: { id: sessionId }, include: { user: true } });
  if (!session || session.revokedAt) throw new AppError("UNAUTHORIZED", "انتهت الجلسة. سجّل الدخول مجدداً");
  const { user } = session;
  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    await rootDb.session.update({ where: { id: sessionId }, data: { twoFactorVerified: true } });
    return;
  }
  const normalized = code.replace(/[\s-]/g, "");
  let ok = verifyTotp(decryptField(user.twoFactorSecret), normalized);
  if (!ok) {
    // رموز الاسترداد (تُستخدم مرة واحدة)
    const backups = (user.twoFactorBackup as string[] | null) ?? [];
    const hashed = sha256(normalized.toUpperCase());
    if (backups.includes(hashed)) {
      ok = true;
      await rootDb.user.update({ where: { id: user.id }, data: { twoFactorBackup: backups.filter((b) => b !== hashed) } });
    }
  }
  const auditCtx = { tenantId: user.tenantId, actor: { id: user.id, name: user.name }, ...meta };
  if (!ok) {
    await writeAudit(auditCtx, { action: "LOGIN_FAILED", entityType: "Auth", entityId: user.id, summary: "رمز مصادقة ثنائية خاطئ" });
    throw new AppError("UNAUTHORIZED", "رمز التحقق غير صحيح");
  }
  await rootDb.session.update({ where: { id: sessionId }, data: { twoFactorVerified: true } });
}

export async function requestPasswordReset(input: { email: string; tenantSlug?: string | null }, meta: RequestMeta): Promise<void> {
  const limit = rateLimit(`reset:${input.email.trim().toLowerCase()}`, 3, 15 * 60 * 1000);
  const ipLimit = rateLimit(`reset:ip:${meta.ip ?? "unknown"}`, 10, 15 * 60 * 1000);
  if (!limit.allowed || !ipLimit.allowed) throw new AppError("TOO_MANY_REQUESTS", "طلبات كثيرة. حاول بعد قليل");
  const users = await findUsersByIdentifier(input.email, input.tenantSlug);
  for (const user of users) {
    if (user.status !== "ACTIVE") continue;
    const token = randomToken(32);
    await rootDb.authToken.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        type: "PASSWORD_RESET",
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    await deliver({
      tenantId: user.tenantId,
      channel: "email",
      to: user.email,
      subject: "استعادة كلمة المرور",
      body: `مرحباً ${user.name}،\nلتعيين كلمة مرور جديدة لحسابك في ${user.tenant.platformName} افتح الرابط التالي (صالح لمدة ساعة):\n${appUrl(`/reset-password?token=${token}`)}\nإذا لم تطلب ذلك فتجاهل هذه الرسالة.`,
    });
  }
}

async function consumeToken(rawToken: string, type: "PASSWORD_RESET" | "INVITE") {
  const token = await rootDb.authToken.findUnique({ where: { tokenHash: sha256(rawToken) } });
  if (!token || token.type !== type || token.usedAt || token.expiresAt.getTime() < Date.now()) {
    throw new AppError("BAD_REQUEST", "الرابط غير صالح أو منتهي الصلاحية");
  }
  return token;
}

export async function inspectToken(rawToken: string, type: "PASSWORD_RESET" | "INVITE") {
  const token = await consumeToken(rawToken, type);
  const user = await rootDb.user.findUniqueOrThrow({ where: { id: token.userId }, include: { tenant: true } });
  return { name: user.name, email: user.email, schoolName: user.tenant.name };
}

export async function resetPassword(input: { token: string; password: string }, meta: RequestMeta): Promise<void> {
  const token = await consumeToken(input.token, "PASSWORD_RESET");
  const user = await rootDb.user.findUniqueOrThrow({ where: { id: token.userId }, include: { tenant: true } });
  const errors = validatePassword(input.password, resolvePasswordPolicy(user.tenant.settings));
  if (errors.length) throw badRequest(errors.join("، "));
  await rootDb.$transaction([
    rootDb.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    }),
    rootDb.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
  ]);
  await revokeAllUserSessions(user.tenantId, user.id);
  await writeAudit({ tenantId: user.tenantId, actor: { id: user.id, name: user.name }, ...meta }, {
    action: "PASSWORD_RESET",
    entityType: "User",
    entityId: user.id,
    summary: user.email,
  });
}

export async function acceptInvite(input: { token: string; password: string }, meta: RequestMeta): Promise<{ token: string; next: string }> {
  const token = await consumeToken(input.token, "INVITE");
  const user = await rootDb.user.findUniqueOrThrow({ where: { id: token.userId }, include: { tenant: true } });
  const errors = validatePassword(input.password, resolvePasswordPolicy(user.tenant.settings));
  if (errors.length) throw badRequest(errors.join("، "));
  await rootDb.$transaction([
    rootDb.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password), passwordChangedAt: new Date(), status: "ACTIVE", lastLoginAt: new Date() },
    }),
    rootDb.authToken.update({ where: { id: token.id }, data: { usedAt: new Date() } }),
  ]);
  const { requires2fa } = await loadAccessProfile(user.tenantId, user.id);
  const session = await createSession({ tenantId: user.tenantId, userId: user.id, ip: meta.ip, userAgent: meta.userAgent, twoFactorVerified: true });
  await writeAudit({ tenantId: user.tenantId, actor: { id: user.id, name: user.name }, ...meta }, {
    action: "LOGIN",
    entityType: "Auth",
    entityId: user.id,
    summary: `${user.email} (قبول دعوة)`,
  });
  return { token: session.token, next: requires2fa ? "/setup-2fa" : "/home" };
}

/** إنشاء دعوة لمستخدم جديد وإرسال الرابط */
export async function sendInvite(params: { tenantId: string; userId: string; invitedByName: string }): Promise<string> {
  const user = await rootDb.user.findUniqueOrThrow({ where: { id: params.userId }, include: { tenant: true } });
  const token = randomToken(32);
  await rootDb.authToken.create({
    data: {
      tenantId: params.tenantId,
      userId: user.id,
      type: "INVITE",
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
    },
  });
  const link = appUrl(`/invite?token=${token}`);
  await deliver({
    tenantId: params.tenantId,
    channel: "email",
    to: user.email,
    subject: `دعوة للانضمام إلى ${user.tenant.platformName}`,
    body: `مرحباً ${user.name}،\nدعاك ${params.invitedByName} للانضمام إلى ${user.tenant.name} على ${user.tenant.platformName}.\nلتفعيل حسابك وتعيين كلمة المرور افتح الرابط (صالح ٧ أيام):\n${link}`,
  });
  return link;
}

// ---------------------------------------------------------------------
// إعداد المصادقة الثنائية
// ---------------------------------------------------------------------

export async function beginTwoFactorSetup(userId: string): Promise<{ secret: string; uri: string; qrDataUrl: string }> {
  const user = await rootDb.user.findUniqueOrThrow({ where: { id: userId }, include: { tenant: true } });
  if (user.twoFactorEnabled) throw badRequest("المصادقة الثنائية مفعّلة مسبقاً");
  const secret = generateTotpSecret();
  await rootDb.user.update({ where: { id: userId }, data: { twoFactorSecret: encryptField(secret) } });
  const uri = totpUri(secret, user.email, user.tenant.platformName);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220, color: { dark: "#0F172A", light: "#FFFFFF" } });
  return { secret, uri, qrDataUrl };
}

export async function confirmTwoFactorSetup(userId: string, code: string, sessionId: string, meta: RequestMeta): Promise<string[]> {
  const user = await rootDb.user.findUniqueOrThrow({ where: { id: userId } });
  if (!user.twoFactorSecret) throw badRequest("ابدأ الإعداد أولاً");
  if (!verifyTotp(decryptField(user.twoFactorSecret), code)) throw badRequest("رمز التحقق غير صحيح. تأكد من ضبط وقت الجهاز");
  const backupCodes = Array.from({ length: 8 }, () => randomToken(6).replace(/[^A-Za-z0-9]/g, "").slice(0, 8).toUpperCase().padEnd(8, "X"));
  await rootDb.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true, twoFactorBackup: backupCodes.map((c) => sha256(c)) },
  });
  await rootDb.session.update({ where: { id: sessionId }, data: { twoFactorVerified: true } });
  await writeAudit({ tenantId: user.tenantId, actor: { id: user.id, name: user.name }, ...meta }, {
    action: "TWO_FACTOR_ENABLE",
    entityType: "User",
    entityId: user.id,
    summary: user.email,
  });
  return backupCodes;
}

export async function disableTwoFactor(userId: string, password: string, meta: RequestMeta): Promise<void> {
  const user = await rootDb.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(password, user.passwordHash))) throw badRequest("كلمة المرور غير صحيحة");
  const { requires2fa } = await loadAccessProfile(user.tenantId, user.id);
  if (requires2fa) throw new AppError("FORBIDDEN", "المصادقة الثنائية إلزامية لدورك ولا يمكن تعطيلها");
  await rootDb.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null, twoFactorBackup: Prisma.DbNull } });
  await writeAudit({ tenantId: user.tenantId, actor: { id: user.id, name: user.name }, ...meta }, {
    action: "TWO_FACTOR_DISABLE",
    entityType: "User",
    entityId: user.id,
    summary: user.email,
  });
}

export async function changePassword(
  userId: string,
  input: { current: string; next: string },
  sessionId: string,
  meta: RequestMeta,
): Promise<void> {
  const user = await rootDb.user.findUniqueOrThrow({ where: { id: userId }, include: { tenant: true } });
  if (!(await verifyPassword(input.current, user.passwordHash))) throw badRequest("كلمة المرور الحالية غير صحيحة");
  const errors = validatePassword(input.next, resolvePasswordPolicy(user.tenant.settings));
  if (errors.length) throw badRequest(errors.join("، "));
  await rootDb.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(input.next), passwordChangedAt: new Date() } });
  await revokeAllUserSessions(user.tenantId, user.id, sessionId);
  await writeAudit({ tenantId: user.tenantId, actor: { id: user.id, name: user.name }, ...meta }, {
    action: "PASSWORD_CHANGE",
    entityType: "User",
    entityId: user.id,
    summary: user.email,
  });
}
