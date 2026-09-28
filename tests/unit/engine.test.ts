import { describe, expect, it } from "vitest";
import { EMPTY_GROUP, applyView, calculate, filterRows, groupRows, sortRows, valueForGroupMove, type EngineContext } from "@/lib/database/engine";
import type { PropertyDef, RowRecord } from "@/lib/database/types";

const status: PropertyDef = {
  id: "status",
  name: "الحالة",
  type: "STATUS",
  position: 1,
  config: {
    options: [
      { id: "todo", name: "لم تبدأ", color: "gray" },
      { id: "doing", name: "قيد التنفيذ", color: "navy" },
      { id: "done", name: "مكتملة", color: "green" },
    ],
  },
};
const cost: PropertyDef = { id: "cost", name: "التكلفة", type: "MONEY", position: 2, config: { currency: "SAR" } };
const owner: PropertyDef = { id: "owner", name: "المسؤول", type: "PERSON", position: 3, config: {} };
const due: PropertyDef = { id: "due", name: "الموعد", type: "DATE", position: 4, config: {} };
const properties = [status, cost, owner, due];

let n = 0;
const row = (title: string, values: Record<string, unknown>): RowRecord => ({
  id: `r${++n}`,
  number: n,
  title,
  icon: null,
  cover: null,
  values,
  position: n * 1024,
  createdAt: "2026-09-01T00:00:00Z",
  updatedAt: "2026-09-01T00:00:00Z",
  createdById: "u1",
  updatedById: "u1",
});

const rows = [
  row("تجهيز المعامل", { status: "doing", cost: 250000, owner: ["u1"], due: { start: "2026-09-29" } }),
  row("خطة الإشراف", { status: "todo", cost: 0, owner: ["u2"], due: { start: "2026-10-15" } }),
  row("اجتماع أولياء الأمور", { status: "done", cost: 120050, owner: ["u1", "u2"] }),
  row("صيانة المكيفات", { status: "doing", owner: [] }),
];
const ctx: EngineContext = { properties, currentUserId: "u1", now: new Date("2026-09-28T09:00:00Z"), timeZone: "Asia/Riyadh", defaultCurrency: "SAR" };

describe("محرك قواعد البيانات", () => {
  it("تصفية: يساوي، فارغ، أنا، ومنطق أو", () => {
    expect(filterRows(rows, { conjunction: "and", rules: [{ id: "1", propertyId: "status", operator: "equals", value: "doing" }] }, ctx).map((r) => r.title)).toEqual(["تجهيز المعامل", "صيانة المكيفات"]);
    expect(filterRows(rows, { conjunction: "and", rules: [{ id: "1", propertyId: "due", operator: "is_empty" }] }, ctx)).toHaveLength(2);
    expect(filterRows(rows, { conjunction: "and", rules: [{ id: "1", propertyId: "owner", operator: "is_me" }] }, ctx)).toHaveLength(2);
    expect(
      filterRows(rows, { conjunction: "or", rules: [{ id: "1", propertyId: "status", operator: "equals", value: "done" }, { id: "2", propertyId: "status", operator: "equals", value: "todo" }] }, ctx),
    ).toHaveLength(2);
  });

  it("فرز بالمبلغ تنازلياً مع الفارغ في النهاية", () => {
    expect(sortRows(rows, [{ propertyId: "cost", direction: "desc" }], ctx).map((r) => r.title)).toEqual(["تجهيز المعامل", "اجتماع أولياء الأمور", "خطة الإشراف", "صيانة المكيفات"]);
  });

  it("تجميع حسب الحالة بترتيب الخيارات", () => {
    const groups = groupRows(rows, status, ctx);
    const byKey = Object.fromEntries(groups.map((g) => [g.key, g.rows.length]));
    expect(byKey).toMatchObject({ todo: 1, doing: 2, done: 1 });
    // مجموعة «بدون قيمة» أولاً كما في Notion، ثم الخيارات بترتيبها
    expect(groups.map((g) => g.key)).toEqual([EMPTY_GROUP, "todo", "doing", "done"]);
  });

  it("نقل بطاقة بين الأعمدة يغيّر قيمة الحالة", () => {
    expect(valueForGroupMove(rows[0]!, status, "doing", "done")).toBe("done");
  });

  it("الحسابات: مجموع المبالغ بأصغر وحدة ونسبة غير الفارغ", () => {
    expect(calculate(rows, cost, "sum", ctx)).toBe(370050);
    expect(calculate(rows, cost, "count_values", ctx)).toBe(3);
  });

  it("applyView: بحث عربي مع تطبيع الهمزات", () => {
    expect(applyView(rows, {}, "اولياء", ctx).map((r) => r.title)).toEqual(["اجتماع أولياء الأمور"]);
  });
});
