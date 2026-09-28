/**
 * حماية أرقام الهوية: تُخزَّن مشفّرة، مع بصمة HMAC خاصة بكل مدرسة للبحث ومنع التكرار،
 * وآخر ٤ أرقام للعرض. لا يُكشف الرقم كاملاً إلا لمن يملك صلاحية تعديل الوحدة.
 */
import { createHmac } from "node:crypto";
import { normalizeDigits } from "@/lib/students";
import { decryptField, encryptField } from "@/server/auth/crypto";

function hmacKey(): string {
  const key = process.env.AUTH_SECRET ?? process.env.FIELD_ENCRYPTION_KEY;
  if (!key) throw new Error("AUTH_SECRET غير مضبوط");
  return key;
}

export function normalizeIdNumber(raw: string): string {
  return normalizeDigits(raw).toUpperCase();
}

/** بصمة ثابتة للرقم داخل مدرسة واحدة (لا تسمح بالربط بين المدارس) */
export function idFingerprint(tenantId: string, raw: string): string {
  return createHmac("sha256", hmacKey()).update(`${tenantId}:${normalizeIdNumber(raw)}`).digest("hex");
}

export interface ProtectedId {
  nationalIdHash: string;
  nationalIdEnc: string;
  nationalIdLast4: string;
}

export function protectId(tenantId: string, raw: string): ProtectedId {
  const id = normalizeIdNumber(raw);
  return { nationalIdHash: idFingerprint(tenantId, id), nationalIdEnc: encryptField(id), nationalIdLast4: id.slice(-4) };
}

export function revealId(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    return decryptField(enc);
  } catch {
    return null;
  }
}

/** عرض مقنّع: ••••••1234 */
export function maskId(last4: string | null | undefined): string | null {
  return last4 ? `••••••${last4}` : null;
}
