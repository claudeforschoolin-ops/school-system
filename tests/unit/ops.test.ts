import { describe, expect, it } from "vitest";
import { averageCost, budgetState, depreciationSchedule, disposalGain, exceedsDailyLimit, isbnValid, issueCost, libraryFine, monthlyDepreciation, monthsBetween, nextMonth, posTotals, timesOverlap, transportFee, upliftBudget } from "@/lib/ops/calc";

describe("الإهلاك", () => {
  it("القسط الثابت: مجموع الجدول = التكلفة − الخردة تماماً، والشهر الأخير يستكمل الكسور", () => {
    const s = depreciationSchedule({ costMinor: 1_000_000, salvageMinor: 100_000, usefulLifeMonths: 7, method: "STRAIGHT_LINE" });
    expect(s.reduce((a, b) => a + b, 0)).toBe(900_000);
    expect(s.slice(0, 6).every((x) => x === 128_571)).toBe(true);
    expect(s[6]).toBe(900_000 - 6 * 128_571);
  });
  it("المتناقص: أكبر في البداية، لا ينزل تحت الخردة، ويكتمل في نهاية العمر", () => {
    const s = depreciationSchedule({ costMinor: 3_600_000, salvageMinor: 0, usefulLifeMonths: 36, method: "DECLINING" });
    expect(s[0]).toBeGreaterThan(s[20]!);
    expect(s.reduce((a, b) => a + b, 0)).toBe(3_600_000);
    expect(s.every((x) => x >= 0)).toBe(true);
  });
  it("لا إهلاك للأراضي، ولا قسط بعد اكتمال الإهلاك", () => {
    expect(monthlyDepreciation({ costMinor: 5_000_000, salvageMinor: 0, usefulLifeMonths: 1, method: "NONE", accumulatedMinor: 0, monthsElapsed: 0 })).toBe(0);
    expect(monthlyDepreciation({ costMinor: 1000, salvageMinor: 0, usefulLifeMonths: 10, method: "STRAIGHT_LINE", accumulatedMinor: 1000, monthsElapsed: 10 })).toBe(0);
  });
  it("الاستبعاد والأشهر", () => {
    expect(disposalGain(1_200_000, 400_000, 900_000)).toBe(100_000);
    expect(disposalGain(1_200_000, 400_000, 0)).toBe(-800_000);
    expect(monthsBetween("2025-09", "2026-06")).toBe(10);
    expect(nextMonth("2025-12")).toBe("2026-01");
  });
});

describe("المخزون ونقطة البيع", () => {
  it("المتوسط المرجّح: آخر وحدة تأخذ القيمة المتبقية بلا فروق تقريب", () => {
    // ٣ وحدات بقيمة ١٠٠ (غير قابلة للقسمة)
    const a = issueCost(3, 100, 1);
    const b = issueCost(2, 100 - a, 1);
    const c = issueCost(1, 100 - a - b, 1);
    expect(a + b + c).toBe(100);
    expect(averageCost(3, 100)).toBe(33);
    expect(() => issueCost(2, 100, 3)).toThrow();
  });
  it("إجماليات البيع بالضريبة لكل سطر، والحد اليومي", () => {
    const t = posTotals([{ unitMinor: 250, quantity: 3, taxBp: 1500 }, { unitMinor: 199, quantity: 1, taxBp: 0 }]);
    expect(t.subtotalMinor).toBe(949);
    expect(t.taxMinor).toBe(113);
    expect(t.totalMinor).toBe(1062);
    expect(exceedsDailyLimit(800, 300, 1000)).toBe(true);
    expect(exceedsDailyLimit(700, 300, 1000)).toBe(false);
    expect(exceedsDailyLimit(99_999, 1, null)).toBe(false);
  });
});

describe("المكتبة والنقل والموازنة", () => {
  it("غرامة المكتبة بعد المهلة وبحد أعلى", () => {
    const r = { finePerDayMinor: 100, fineCapMinor: 500, graceDays: 1 };
    expect(libraryFine("2026-09-10", "2026-09-10", r).fineMinor).toBe(0);
    expect(libraryFine("2026-09-10", "2026-09-13", r)).toEqual({ lateDays: 3, fineMinor: 200 });
    expect(libraryFine("2026-09-10", "2026-10-10", r).fineMinor).toBe(500);
    expect(libraryFine("2026-09-10", "2026-10-10", { ...r, fineCapMinor: 0 }).fineMinor).toBe(2900);
  });
  it("ISBN-10 وISBN-13", () => {
    expect(isbnValid("978-0-306-40615-7")).toBe(true);
    expect(isbnValid("9780306406156")).toBe(false);
    expect(isbnValid("0-306-40615-2")).toBe(true);
    expect(isbnValid("123")).toBe(false);
  });
  it("رسوم النقل: كاملة في بداية العام، ونسبية للأشهر المتبقية، ونسبة الاتجاه الواحد", () => {
    const base = { annualFeeMinor: 300_000, oneWayBp: 6000, prorate: true, yearStartIso: "2025-09-01", yearEndIso: "2026-06-30" };
    expect(transportFee({ ...base, direction: "BOTH", startIso: "2025-09-01" }).amountMinor).toBe(300_000);
    const mid = transportFee({ ...base, direction: "BOTH", startIso: "2026-02-15" });
    expect(mid.months).toBe(5);
    expect(mid.amountMinor).toBe(150_000);
    expect(transportFee({ ...base, direction: "MORNING", startIso: "2025-09-01" }).amountMinor).toBe(180_000);
    expect(transportFee({ ...base, prorate: false, direction: "BOTH", startIso: "2026-05-01" }).amountMinor).toBe(300_000);
  });
  it("حالة الموازنة: أخضر، برتقالي عند ٨٠٪، أحمر عند التجاوز؛ ونسخ بزيادة", () => {
    expect(budgetState(100_000, 50_000).state).toBe("OK");
    expect(budgetState(100_000, 80_000).state).toBe("WARNING");
    expect(budgetState(100_000, 100_001).state).toBe("OVER");
    expect(budgetState(0, 1).state).toBe("OVER");
    expect(budgetState(0, 0).state).toBe("NONE");
    expect(upliftBudget(100_000, 500)).toBe(105_000);
  });
  it("تداخل أوقات الحجز", () => {
    expect(timesOverlap("08:00", "09:00", "08:30", "10:00")).toBe(true);
    expect(timesOverlap("08:00", "09:00", "09:00", "10:00")).toBe(false);
  });
});
