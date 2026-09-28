import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, generateTotpSecret, totp, verifyTotp } from "@/server/auth/totp";

// متجهات RFC 6238 (الملحق B) بسر "12345678901234567890" و8 أرقام
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP وفق RFC 6238", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("الوقت %i → %s", (seconds, expected) => {
    expect(totp(RFC_SECRET, seconds * 1000, { digits: 8 })).toBe(expected);
  });

  it("base32 ذهاباً وإياباً", () => {
    const buf = Buffer.from("مرحبا-manassa", "utf8");
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it("التحقق يقبل نافذة ±١ ويرفض ما بعدها", () => {
    const secret = generateTotpSecret();
    const now = 1_700_000_000_000;
    const code = totp(secret, now);
    expect(verifyTotp(secret, code, now)).toBe(true);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(true);
    expect(verifyTotp(secret, code, now + 90_000)).toBe(false);
    expect(verifyTotp(secret, "000000", now) && code !== "000000").toBe(false);
  });
});
