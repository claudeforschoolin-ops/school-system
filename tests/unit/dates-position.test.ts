import { describe, expect, it } from "vitest";
import { formatDate, formatTimeRange, toISODate, zonedTimeToUtc } from "@/lib/dates";
import { positionAtIndex, positionBetween } from "@/lib/position";
import { normalizeArabic } from "@/lib/utils";

describe("التواريخ", () => {
  it("التقويم الهجري (أم القرى)", () => {
    // ١ رمضان ١٤٤٧ هـ = ١٨ فبراير ٢٠٢٦
    const hijri = formatDate("2026-02-18", { calendar: "hijri", digits: "latn", style: "long" });
    expect(hijri).toContain("1447");
    expect(hijri).toContain("رمضان");
  });

  it("الأرقام العربية واللاتينية", () => {
    expect(formatDate("2026-09-28", { digits: "arab" })).toMatch(/[٠-٩]/);
    expect(formatDate("2026-09-28", { digits: "latn" })).toMatch(/2026/);
  });

  it("المنطقة الزمنية للمدرسة", () => {
    expect(toISODate(new Date("2026-09-28T22:30:00Z"), "Asia/Riyadh")).toBe("2026-09-29");
    expect(zonedTimeToUtc("2026-09-28T08:00", "Asia/Riyadh").toISOString()).toBe("2026-09-28T05:00:00.000Z");
  });

  it("نطاق الوقت المختصر", () => {
    const range = formatTimeRange(new Date("2026-09-28T07:00:00Z"), new Date("2026-09-28T08:00:00Z"), "latn", "Asia/Riyadh");
    expect(range).toMatch(/10/);
    expect(range).toMatch(/11/);
  });
});

describe("الترتيب الكسري", () => {
  it("إدراج بين عنصرين وفي الأطراف", () => {
    expect(positionBetween(1024, 2048)).toBe(1536);
    expect(positionBetween(null, 1024)).toBe(0);
    expect(positionBetween(2048, null)).toBe(3072);
    expect(positionAtIndex([1024, 2048, 3072], 1)).toBe(1536);
  });
});

describe("تطبيع العربية للبحث", () => {
  it("الهمزات والتاء المربوطة والتشكيل", () => {
    expect(normalizeArabic("أولياء الأمور")).toBe(normalizeArabic("اولياء الامور"));
    expect(normalizeArabic("مُعَلِّمة")).toBe(normalizeArabic("معلمه"));
  });
});
