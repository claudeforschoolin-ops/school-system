/**
 * TOTP (RFC 6238) للمصادقة الثنائية — تنفيذ مستقل دون مكتبات خارجية.
 * متوافق مع Google Authenticator و Microsoft Authenticator وغيرها.
 */
import { createHmac, randomBytes } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error("ترميز Base32 غير صالح");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export interface TotpOptions {
  step?: number;
  digits?: number;
  algorithm?: "sha1" | "sha256" | "sha512";
}

/** HOTP (RFC 4226) */
export function hotp(secret: Buffer, counter: number, digits = 6, algorithm: TotpOptions["algorithm"] = "sha1"): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac(algorithm ?? "sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0x0f;
  const code =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return String(code % 10 ** digits).padStart(digits, "0");
}

export function totp(secretBase32: string, timeMs = Date.now(), { step = 30, digits = 6, algorithm = "sha1" }: TotpOptions = {}): string {
  return hotp(base32Decode(secretBase32), Math.floor(timeMs / 1000 / step), digits, algorithm);
}

/** التحقق مع سماح بانحراف خطوة واحدة قبل/بعد */
export function verifyTotp(secretBase32: string, code: string, timeMs = Date.now(), window = 1): boolean {
  const normalized = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  for (let w = -window; w <= window; w++) {
    if (totp(secretBase32, timeMs + w * 30_000) === normalized) return true;
  }
  return false;
}

export function totpUri(secretBase32: string, accountName: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({ secret: secretBase32, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${label}?${params.toString()}`;
}
