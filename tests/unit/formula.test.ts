import { describe, expect, it } from "vitest";
import { evaluateFormula, referencedProps, type FormulaValue } from "@/lib/database/formula";

const props: Record<string, FormulaValue> = {
  الدرجة: 18,
  العظمى: 20,
  مكتمل: true,
  الاسم: "سارة",
  الموعد: new Date("2026-10-05T00:00:00Z"),
};
const ctx = { getProp: (name: string) => props[name] ?? null, now: new Date("2026-09-28T09:00:00Z") };
const run = (expr: string) => evaluateFormula(expr, ctx);

describe("لغة المعادلات (دون eval)", () => {
  it("حساب وأولوية العمليات", () => {
    expect(run("1 + 2 * 3").value).toBe(7);
    expect(run("(1 + 2) * 3").value).toBe(9);
    expect(run('prop("الدرجة") / prop("العظمى") * 100').value).toBe(90);
  });

  it("الأسماء العربية البديلة للدوال", () => {
    expect(run('إذا(خاصية("مكتمل"), "منجز", "قيد العمل")').value).toBe("منجز");
    expect(run('دمج(خاصية("الاسم"), " - ", "٢/أ")').value).toBe("سارة - ٢/أ");
    expect(run('طول("مرحبا")').value).toBe(5);
    expect(run("تقريب(2.567, 2)").value).toBeCloseTo(2.57);
  });

  it("الأرقام العربية والفاصلة العربية في المعادلة، والنصوص تبقى كما هي", () => {
    expect(run("١٢ + ٣٫٥").value).toBe(15.5);
    expect(run('إذا(صح، "٣ أيام"، "لا")').value).toBe("٣ أيام");
  });

  it("فرق التواريخ بالأيام", () => {
    expect(run('dateBetween(prop("الموعد"), now(), "days")').value).toBe(6);
  });

  it("أخطاء مفهومة بالعربية بدل الاستثناءات", () => {
    const r = run("unknownFn(1)");
    expect(r.value).toBeNull();
    expect(r.error).toMatch(/غير معروفة/);
    expect(run("1 +").error).toBeTruthy();
  });

  it("لا وصول لبيئة JavaScript", () => {
    for (const expr of ["constructor", "process.exit()", 'this["constructor"]', "globalThis"]) {
      expect(run(expr).error, expr).toBeTruthy();
    }
  });

  it("استخراج الخصائص المستخدمة (لكشف الدوران)", () => {
    expect(referencedProps('prop("الدرجة") + خاصية("العظمى")').sort()).toEqual(["الدرجة", "العظمى"].sort());
  });
});
