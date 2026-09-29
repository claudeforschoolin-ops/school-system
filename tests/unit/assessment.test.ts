import { describe, expect, it } from "vitest";
import { bandFor, bpToPercentString, componentBp, DEFAULT_BANDS, DEFAULT_COMPONENTS, divRound, parseTenths, rankBy, subjectResult, tenthsToString, termResult, validateScheme } from "@/lib/assessment/calc";

const scheme = { components: DEFAULT_COMPONENTS, passBp: 5000, bands: DEFAULT_BANDS, maxSecondRoundSubjects: 3 };

describe("نسب المكونات", () => {
  it("مجموع الدرجات ÷ مجموع العظمى بتقريب نصف للأعلى", () => {
    expect(componentBp([{ maxTenths: 100, scoreTenths: 85 }, { maxTenths: 100, scoreTenths: 90 }])).toBe(8750);
    expect(componentBp([{ maxTenths: 30, scoreTenths: 20 }])).toBe(6667); // 66.666…
  });
  it("الغياب بغير عذر صفر، وبعذر أو غير المرصود لا يُحتسب", () => {
    expect(componentBp([{ maxTenths: 100, scoreTenths: null, absent: true }, { maxTenths: 100, scoreTenths: 80 }])).toBe(4000);
    expect(componentBp([{ maxTenths: 100, scoreTenths: null, excused: true }, { maxTenths: 100, scoreTenths: 80 }])).toBe(8000);
    expect(componentBp([{ maxTenths: 100, scoreTenths: null }])).toBeNull();
  });
});

describe("درجة المادة الموزونة", () => {
  it("متوسط موزون بالأوزان الافتراضية", () => {
    const r = subjectResult(DEFAULT_COMPONENTS, { classwork: 10000, homework: 9000, quizzes: 8000, project: 10000, midterm: 7500, final: 8000 });
    // (10×100 + 10×90 + 10×80 + 10×100 + 20×75 + 40×80) / 100 = 84
    expect(r.bp).toBe(8400);
    expect(r.missing).toEqual([]);
  });
  it("المكوّن غير المرصود يُعاد توزيع وزنه ويُعلَّم ناقصاً", () => {
    const r = subjectResult(DEFAULT_COMPONENTS, { classwork: 10000, homework: 10000, quizzes: 10000, project: 10000, midterm: 5000 });
    expect(r.bp).toBe(divRound(4 * 10 * 10000 + 20 * 5000, 60));
    expect(r.missing).toEqual(["final"]);
  });
});

describe("التقدير والنتيجة", () => {
  it("حدود التقديرات", () => {
    expect(bandFor(9000, DEFAULT_BANDS)?.label).toBe("ممتاز");
    expect(bandFor(8999, DEFAULT_BANDS)?.label).toBe("جيد جداً");
    expect(bandFor(5000, DEFAULT_BANDS)?.label).toBe("مقبول");
    expect(bandFor(4999, DEFAULT_BANDS)?.letter).toBe("F");
    expect(bandFor(null, DEFAULT_BANDS)).toBeNull();
  });
  it("ناجح / دور ثانٍ / راسب / غير مكتمل", () => {
    expect(termResult([9000, 8000, 7000], scheme)).toMatchObject({ averageBp: 8000, result: "PASS", failed: 0, gpa: 400 });
    expect(termResult([9000, 4000, 4500], scheme)).toMatchObject({ result: "SECOND_ROUND", failed: 2 });
    expect(termResult([4000, 4000, 4000, 4000], scheme)).toMatchObject({ result: "FAIL", failed: 4 });
    expect(termResult([9000, null], scheme).result).toBe("INCOMPLETE");
    expect(termResult([], scheme).averageBp).toBeNull();
  });
  it("ترتيب تنافسي مع التعادل", () => {
    const rows = [{ n: "أ", v: 9000 }, { n: "ب", v: 9500 }, { n: "ج", v: 9000 }, { n: "د", v: null }, { n: "هـ", v: 8000 }];
    const r = rankBy(rows, (x) => x.v);
    expect(rows.map((x) => r.get(x))).toEqual([2, 1, 2, null, 4]);
  });
});

describe("التحويلات والتحقق", () => {
  it("الأعشار والنسب", () => {
    expect(tenthsToString(175)).toBe("17.5");
    expect(tenthsToString(200)).toBe("20");
    expect(bpToPercentString(8750)).toBe("87.5");
    expect(bpToPercentString(6667)).toBe("66.7");
    expect(parseTenths("١٧٫٥")).toBe(175);
    expect(parseTenths("20")).toBe(200);
    expect(parseTenths("")).toBeNull();
    expect(Number.isNaN(parseTenths("17.55"))).toBe(true);
    expect(Number.isNaN(parseTenths("abc"))).toBe(true);
  });
  it("نظام التقييم: الأوزان مجموعها ١٠٠ والرموز فريدة", () => {
    expect(validateScheme(scheme)).toBeNull();
    expect(validateScheme({ ...scheme, components: [{ key: "a", name: "أ", weight: 50 }] })).toContain("١٠٠");
    expect(validateScheme({ ...scheme, components: [{ key: "a", name: "أ", weight: 50 }, { key: "a", name: "ب", weight: 50 }] })).toContain("مختلفة");
  });
});
