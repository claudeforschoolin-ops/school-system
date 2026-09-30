/**
 * مطابقة عناوين IPv4 مع قائمة سماح (عناوين مفردة أو نطاقات CIDR). نقي وقابل للاختبار.
 */
function toInt(ip: string): number | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

/** يحوّل «::ffff:10.0.0.5» إلى «10.0.0.5» (عناوين IPv4 داخل IPv6) */
export function normalizeIp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]!.trim();
  return first.startsWith("::ffff:") ? first.slice(7) : first;
}

export function ipInCidr(ip: string, cidr: string): boolean {
  const [base, bitsRaw] = cidr.split("/");
  const a = toInt(ip);
  const b = toInt(base ?? "");
  if (a === null || b === null) return false;
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

export function ipAllowed(ip: string | null | undefined, allowlist: readonly string[]): boolean {
  const n = normalizeIp(ip);
  // العناوين المحلية (الخادم نفسه) مسموحة دائماً لتفادي قفل المدير أثناء الإعداد
  if (n === "127.0.0.1" || n === "::1") return true;
  if (!n) return false;
  return allowlist.some((c) => ipInCidr(n, c));
}
