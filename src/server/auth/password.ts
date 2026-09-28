/**
 * كلمات المرور: تجزئة bcrypt وسياسة قابلة للضبط من إعدادات المستأجر.
 */
import bcrypt from "bcryptjs";

export interface PasswordPolicy {
  minLength: number;
  requireLetters: boolean;
  requireDigits: boolean;
  requireSymbols: boolean;
  /** عدد المحاولات الفاشلة قبل القفل المؤقت */
  maxFailedAttempts: number;
  /** مدة القفل بالدقائق */
  lockMinutes: number;
}

export const DEFAULT_PASSWORD_POLICY: PasswordPolicy = {
  minLength: 10,
  requireLetters: true,
  requireDigits: true,
  requireSymbols: false,
  maxFailedAttempts: 5,
  lockMinutes: 15,
};

export function resolvePasswordPolicy(settings: unknown): PasswordPolicy {
  const s = (settings && typeof settings === "object" ? (settings as Record<string, unknown>).passwordPolicy : null) as
    | Partial<PasswordPolicy>
    | null
    | undefined;
  return { ...DEFAULT_PASSWORD_POLICY, ...(s ?? {}) };
}

/** يعيد قائمة المخالفات بالعربية (فارغة = مقبولة) */
export function validatePassword(password: string, policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY): string[] {
  const errors: string[] = [];
  if (password.length < policy.minLength) errors.push(`يجب ألا تقل كلمة المرور عن ${policy.minLength} أحرف`);
  if (policy.requireLetters && !/[A-Za-z؀-ۿ]/.test(password)) errors.push("يجب أن تحتوي على حرف واحد على الأقل");
  if (policy.requireDigits && !/[0-9٠-٩]/.test(password)) errors.push("يجب أن تحتوي على رقم واحد على الأقل");
  if (policy.requireSymbols && !/[^A-Za-z0-9؀-ۿ\s]/.test(password)) errors.push("يجب أن تحتوي على رمز خاص واحد على الأقل");
  return errors;
}

const COST = process.env.NODE_ENV === "test" ? 4 : 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

let dummyHash: string | null = null;

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    // مقارنة وهمية لتوحيد زمن الاستجابة ومنع كشف وجود الحساب
    dummyHash ??= await bcrypt.hash("manassa-timing-equalizer", COST);
    await bcrypt.compare(password, dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}
