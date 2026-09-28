import { describe, expect, it } from "vitest";
import { allocateMinor, currencyFractionDigits, formatMoney, minorToDecimalString, MoneyError, parseMoney, sumMinor } from "@/lib/money";

describe("المبالغ بأصغر وحدة (دون float)", () => {
  it("منازل العملات", () => {
    expect(currencyFractionDigits("SAR")).toBe(2);
    expect(currencyFractionDigits("KWD")).toBe(3);
    expect(currencyFractionDigits("JPY")).toBe(0);
  });

  it("تحويل إلى نص عشري دقيق", () => {
    expect(minorToDecimalString(123450, "SAR")).toBe("1234.50");
    expect(minorToDecimalString(5, "SAR")).toBe("0.05");
    expect(minorToDecimalString(-7, "SAR")).toBe("-0.07");
    expect(minorToDecimalString(1234, "KWD")).toBe("1.234");
    expect(minorToDecimalString(1234, "JPY")).toBe("1234");
    expect(() => minorToDecimalString(1.5, "SAR")).toThrow(MoneyError);
  });

  it("تحليل الإدخال بالأرقام العربية والفواصل", () => {
    expect(parseMoney("١٬٢٣٤٫٥", "SAR")).toBe(123450);
    expect(parseMoney("1,234.56", "SAR")).toBe(123456);
    expect(parseMoney("0.1", "SAR")).toBe(10);
    expect(parseMoney("-12", "SAR")).toBe(-1200);
    expect(parseMoney("1.234", "KWD")).toBe(1234);
    expect(parseMoney(19.99, "SAR")).toBe(1999);
  });

  it("لا خطأ تقريب كلاسيكي: 0.1 + 0.2", () => {
    expect(sumMinor([parseMoney("0.1", "SAR"), parseMoney("0.2", "SAR")])).toBe(parseMoney("0.3", "SAR"));
  });

  it("يرفض الصيغ الخاطئة والمنازل الزائدة", () => {
    expect(() => parseMoney("abc", "SAR")).toThrow(MoneyError);
    expect(() => parseMoney("1.234", "SAR")).toThrow(/منازل/);
    expect(() => parseMoney("", "SAR")).toThrow(MoneyError);
    expect(() => parseMoney("1.2.3", "SAR")).toThrow(MoneyError);
  });

  it("يرفض تجاوز الحد الآمن", () => {
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(MoneyError);
    expect(() => parseMoney("99999999999999999", "SAR")).toThrow(MoneyError);
  });

  it("توزيع الأقساط دون فقد هللات", () => {
    expect(allocateMinor(10000, [1, 1, 1])).toEqual([3334, 3333, 3333]);
    expect(allocateMinor(10001, [1, 1])).toEqual([5001, 5000]);
    const parts = allocateMinor(99_999, [3, 2, 5]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(99_999);
    expect(() => allocateMinor(100, [])).toThrow(MoneyError);
  });

  it("العرض بالأرقام العربية واللاتينية", () => {
    expect(formatMoney(123450, { currency: "SAR", digits: "latn", symbol: false })).toBe("1,234.50");
    expect(formatMoney(123450, { currency: "SAR", digits: "arab", symbol: false })).toBe("١٬٢٣٤٫٥٠");
  });
});
