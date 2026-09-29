import { describe, expect, it } from "vitest";
import {
  agingBucket,
  allocateToInstallments,
  applyBp,
  computeInvoice,
  decodeTlv,
  recognizedToDate,
  serviceMonths,
  siblingDiscountBp,
  splitInstallments,
  splitTaxInclusive,
  unusedMonths,
  zatcaQrPayload,
} from "@/lib/finance/calc";
import { allocateMinor } from "@/lib/money";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe("النسب بنقاط الأساس (تقريب نصف للأعلى، أعداد صحيحة فقط)", () => {
  it("١٥٪ من مبالغ مختلفة", () => {
    expect(applyBp(1_800_000, 1500)).toBe(270_000);
    expect(applyBp(333, 1500)).toBe(50); // 49.95 ← 50
    expect(applyBp(1, 1500)).toBe(0); // 0.15 ← 0
    expect(applyBp(10, 500)).toBe(1); // 0.5 ← 1 (نصف للأعلى)
    expect(applyBp(-333, 1500)).toBe(-50);
  });
  it("يرفض الكسور", () => {
    expect(() => applyBp(10.5, 1500)).toThrow();
  });
});

describe("احتساب الفاتورة", () => {
  const tuition = { feeItemId: "T", description: "رسوم دراسية", unitMinor: 1_800_000, taxRateBp: 0 };
  const books = { feeItemId: "B", description: "كتب", unitMinor: 80_000, taxRateBp: 1500 };

  it("الضريبة على الصافي بعد الخصم، والإجمالي = الصافي + الضريبة", () => {
    const inv = computeInvoice(
      [{ ...tuition, taxRateBp: 1500 }, books],
      [{ id: "s", name: "خصم الأشقاء", method: "PERCENT", value: 500, feeItemIds: ["T"] }],
    );
    expect(inv.lines[0]!.discountMinor).toBe(90_000);
    expect(inv.lines[0]!.taxMinor).toBe(applyBp(1_710_000, 1500));
    expect(inv.lines[1]!.discountMinor).toBe(0);
    expect(inv.lines[1]!.taxMinor).toBe(12_000);
    expect(inv.totalMinor).toBe(inv.subtotalMinor - inv.discountMinor + inv.taxMinor);
  });

  it("المواطن: الدراسية بنسبة صفر والكتب ١٥٪", () => {
    const inv = computeInvoice([tuition, books]);
    expect(inv.taxMinor).toBe(12_000);
    expect(inv.totalMinor).toBe(1_892_000);
  });

  it("الخصم الثابت يوزَّع على البنود المشمولة بنسبها ولا يتجاوز مبلغها", () => {
    const inv = computeInvoice(
      [tuition, { ...books, feeItemId: "B", taxRateBp: 0 }],
      [{ id: "f", name: "ثابت", method: "FIXED", value: 100_001, feeItemIds: ["T", "B"] }],
    );
    expect(inv.discountMinor).toBe(100_001);
    expect(inv.lines[0]!.discountMinor + inv.lines[1]!.discountMinor).toBe(100_001);
    const huge = computeInvoice(
      [books],
      [{ id: "f", name: "ثابت", method: "FIXED", value: 10_000_000, feeItemIds: ["B"] }],
    );
    expect(huge.lines[0]!.discountMinor).toBe(80_000);
    expect(huge.totalMinor).toBe(0);
  });

  it("خصمان على البند نفسه لا يتجاوزان مبلغه (منحة كاملة + تفوق)", () => {
    const inv = computeInvoice(
      [tuition],
      [
        { id: "sch", name: "منحة", method: "PERCENT", value: 10000, feeItemIds: ["T"] },
        { id: "m", name: "تفوق", method: "PERCENT", value: 1000, feeItemIds: ["T"] },
      ],
    );
    expect(inv.lines[0]!.discountMinor).toBe(1_800_000);
    expect(inv.lines[0]!.discounts).toHaveLength(1);
    expect(inv.totalMinor).toBe(0);
  });

  it("الكمية تضرب السعر", () => {
    expect(computeInvoice([{ ...books, quantity: 3 }]).lines[0]!.amountMinor).toBe(240_000);
  });
});

describe("خصم الأشقاء بالشرائح", () => {
  const tiers = [
    { order: 2, valueBp: 500 },
    { order: 3, valueBp: 1000 },
    { order: 4, valueBp: 1500 },
  ];
  it("الأكبر بلا خصم، ثم حسب الترتيب، والخامس يأخذ آخر شريحة", () => {
    expect(siblingDiscountBp(1, tiers)).toBe(0);
    expect(siblingDiscountBp(2, tiers)).toBe(500);
    expect(siblingDiscountBp(3, tiers)).toBe(1000);
    expect(siblingDiscountBp(5, tiers)).toBe(1500);
  });
});

describe("الأقساط", () => {
  it("التقسيم بلا فقد هللات (الباقي الأكبر)", () => {
    const parts = splitInstallments(100_001, [
      { label: "أ", weight: 1, dueDate: "2026-08-31" },
      { label: "ب", weight: 1, dueDate: "2027-01-31" },
      { label: "ج", weight: 1, dueDate: "2027-03-31" },
    ]);
    expect(parts.reduce((s, p) => s + p.amountMinor, 0)).toBe(100_001);
    expect(parts.map((p) => p.amountMinor)).toEqual([33_334, 33_334, 33_333]);
    expect(parts[2]!.seq).toBe(3);
  });

  it("الأوزان ٤٠/٣٠/٣٠", () => {
    const parts = splitInstallments(2_000_000, [
      { label: "١", weight: 40, dueDate: "x" },
      { label: "٢", weight: 30, dueDate: "y" },
      { label: "٣", weight: 30, dueDate: "z" },
    ]);
    expect(parts.map((p) => p.amountMinor)).toEqual([800_000, 600_000, 600_000]);
  });

  it("الدفعة تسدد الأقدم أولاً وتعيد الباقي", () => {
    const r = allocateToInstallments(70_000, [
      { id: "1", amountMinor: 50_000, paidMinor: 20_000 },
      { id: "2", amountMinor: 50_000, paidMinor: 0 },
      { id: "3", amountMinor: 50_000, paidMinor: 0 },
    ]);
    expect(r.allocations).toEqual([
      { id: "1", amountMinor: 30_000 },
      { id: "2", amountMinor: 40_000 },
    ]);
    expect(r.remainder).toBe(0);
    expect(
      allocateToInstallments(10_000, [{ id: "1", amountMinor: 5_000, paidMinor: 5_000 }]).remainder,
    ).toBe(10_000);
  });

  it("توزيع مبلغ سالب يحافظ على المجموع (التدفقات النقدية)", () => {
    const parts = allocateMinor(-100, [1, 1, 1]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(-100);
  });
});

describe("المبالغ الشاملة للضريبة", () => {
  it("التفكيك يعيد الإجمالي نفسه", () => {
    for (const total of [115, 11_500, 1_000_000, 99_999, 1]) {
      const { netMinor, taxMinor } = splitTaxInclusive(total, 1500);
      expect(netMinor + taxMinor).toBe(total);
      expect(Math.abs(applyBp(netMinor, 1500) - taxMinor)).toBeLessThanOrEqual(1);
    }
    expect(splitTaxInclusive(11_500, 1500)).toEqual({ netMinor: 10_000, taxMinor: 1_500 });
    expect(splitTaxInclusive(500, 0)).toEqual({ netMinor: 500, taxMinor: 0 });
  });
});

describe("الاعتراف بالإيراد المؤجل", () => {
  const start = d("2026-08-23");
  const end = d("2027-06-10");
  it("١١ شهراً من أغسطس إلى يونيو، والتراكمي يصل للمبلغ كاملاً في آخر شهر", () => {
    expect(serviceMonths(start, end)).toBe(11);
    expect(recognizedToDate(1_100_000, start, end, d("2026-07-31"))).toBe(0);
    expect(recognizedToDate(1_100_000, start, end, d("2026-08-31"))).toBe(100_000);
    expect(recognizedToDate(1_100_000, start, end, d("2026-12-15"))).toBe(500_000);
    expect(recognizedToDate(1_100_000, start, end, d("2027-06-30"))).toBe(1_100_000);
    expect(recognizedToDate(1_100_000, start, end, d("2028-01-01"))).toBe(1_100_000);
  });
  it("مبلغ لا يقسم بالتساوي: لا هللة مفقودة", () => {
    const total = 1_000_001;
    let prev = 0;
    for (let m = 0; m < 11; m++) {
      const asOf = new Date(Date.UTC(2026, 7 + m, 28));
      const cum = recognizedToDate(total, start, end, asOf);
      expect(cum).toBeGreaterThanOrEqual(prev);
      prev = cum;
    }
    expect(prev).toBe(total);
  });
  it("الأشهر غير المستهلكة عند الانسحاب", () => {
    expect(unusedMonths(start, end, d("2026-11-10"))).toBe(7);
    expect(unusedMonths(start, end, d("2027-06-01"))).toBe(0);
    expect(unusedMonths(start, end, d("2026-07-01"))).toBe(11);
  });
});

describe("تقادم الذمم", () => {
  const asOf = d("2026-09-29");
  it("حدود الشرائح", () => {
    expect(agingBucket(d("2026-10-01"), asOf)).toBe("current");
    expect(agingBucket(d("2026-09-29"), asOf)).toBe("current");
    expect(agingBucket(d("2026-09-28"), asOf)).toBe("d30");
    expect(agingBucket(d("2026-08-30"), asOf)).toBe("d30");
    expect(agingBucket(d("2026-08-29"), asOf)).toBe("d60");
    expect(agingBucket(d("2026-07-01"), asOf)).toBe("d90");
    expect(agingBucket(d("2026-06-30"), asOf)).toBe("d90p");
  });
});

describe("رمز QR للفاتورة الضريبية (TLV)", () => {
  it("يرمز الحقول الخمسة ويفك ترميزها كما هي (بالعربية)", () => {
    const fields = {
      seller: "مدارس منصة الأهلية",
      vatNumber: "310000000000003",
      timestamp: "2026-08-20T09:30:00.000Z",
      total: "20585.00",
      vat: "2685.00",
    };
    const b64 = zatcaQrPayload(fields);
    expect(decodeTlv(b64)).toEqual([
      fields.seller,
      fields.vatNumber,
      fields.timestamp,
      fields.total,
      fields.vat,
    ]);
    const raw = Buffer.from(b64, "base64");
    expect(raw[0]).toBe(1);
    expect(raw[1]).toBe(Buffer.byteLength(fields.seller, "utf8"));
  });
  it("يرفض القيم الأطول من ٢٥٥ بايتاً", () => {
    expect(() =>
      zatcaQrPayload({ seller: "م".repeat(200), vatNumber: "3", timestamp: "t", total: "1", vat: "0" }),
    ).toThrow();
  });
});
