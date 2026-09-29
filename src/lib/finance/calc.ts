/**
 * حسابات مالية نقية (دون قاعدة بيانات) — كلها بأعداد صحيحة بأصغر وحدة، ولا float في المبالغ.
 * التقريب: نصف للأعلى (half-up) على مستوى السطر.
 */
import { allocateMinor } from "@/lib/money";

/** نسبة بنقاط الأساس مع تقريب نصف للأعلى: 10000 × 1500bp = 1500 */
export function applyBp(amountMinor: number, bp: number): number {
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(bp)) throw new Error("قيم غير صحيحة");
  const sign = amountMinor < 0 ? -1 : 1;
  const abs = Math.abs(amountMinor);
  // (abs * bp + 5000) / 10000 بقسمة صحيحة؛ الناتج آمن ما دام abs*bp < 2^53
  return sign * Math.floor((abs * bp + 5000) / 10000);
}

export interface DiscountRule {
  id: string;
  name: string;
  method: "PERCENT" | "FIXED";
  /** نقاط أساس للنسبة، أو هللات للمبلغ الثابت */
  value: number;
  /** البنود المشمولة */
  feeItemIds: string[];
}

export interface LineInput {
  feeItemId: string | null;
  description: string;
  unitMinor: number;
  quantity?: number;
  taxRateBp: number;
}

export interface ComputedLine extends LineInput {
  quantity: number;
  amountMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  discounts: Array<{ id: string; name: string; amountMinor: number }>;
}

export interface ComputedInvoice {
  lines: ComputedLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
}

/**
 * يحسب الفاتورة: المبلغ = السعر × الكمية، ثم الخصومات على البنود المشمولة
 * (النسب على المبلغ الأصلي، والمبلغ الثابت يُوزَّع على البنود المشمولة بنسبها)،
 * ثم الضريبة على الصافي. الخصم لا يتجاوز مبلغ السطر.
 */
export function computeInvoice(lines: LineInput[], discounts: DiscountRule[] = []): ComputedInvoice {
  const out: ComputedLine[] = lines.map((l) => {
    const quantity = l.quantity ?? 1;
    if (!Number.isSafeInteger(l.unitMinor) || l.unitMinor < 0) throw new Error("سعر غير صالح");
    return { ...l, quantity, amountMinor: l.unitMinor * quantity, discountMinor: 0, taxMinor: 0, totalMinor: 0, discounts: [] };
  });
  for (const d of discounts) {
    const targets = out.map((l, i) => ({ l, i })).filter(({ l }) => l.feeItemId && d.feeItemIds.includes(l.feeItemId));
    if (!targets.length) continue;
    const shares =
      d.method === "PERCENT"
        ? targets.map(({ l }) => applyBp(l.amountMinor, d.value))
        : allocateMinor(
            Math.min(d.value, targets.reduce((s, { l }) => s + l.amountMinor, 0)),
            targets.map(({ l }) => Math.max(1, l.amountMinor)),
          );
    targets.forEach(({ l }, k) => {
      const room = l.amountMinor - l.discountMinor;
      const amount = Math.max(0, Math.min(room, shares[k]!));
      if (amount > 0) {
        l.discountMinor += amount;
        l.discounts.push({ id: d.id, name: d.name, amountMinor: amount });
      }
    });
  }
  for (const l of out) {
    const net = l.amountMinor - l.discountMinor;
    l.taxMinor = applyBp(net, l.taxRateBp);
    l.totalMinor = net + l.taxMinor;
  }
  const sum = (k: "amountMinor" | "discountMinor" | "taxMinor" | "totalMinor") => out.reduce((s, l) => s + l[k], 0);
  return { lines: out, subtotalMinor: sum("amountMinor"), discountMinor: sum("discountMinor"), taxMinor: sum("taxMinor"), totalMinor: sum("totalMinor") };
}

/** نسبة خصم الأشقاء حسب ترتيب الطالب بين إخوته المنتظمين (١ = الأكبر، بلا خصم) */
export function siblingDiscountBp(order: number, tiers: Array<{ order: number; valueBp: number }>): number {
  if (order < 2) return 0;
  const sorted = [...tiers].sort((a, b) => a.order - b.order);
  let bp = 0;
  for (const t of sorted) if (order >= t.order) bp = t.valueBp;
  return bp;
}

/** تقسيم مبلغ على أقساط بأوزانها دون فقد هللات */
export function splitInstallments(totalMinor: number, parts: Array<{ label: string; weight: number; dueDate: string }>) {
  if (!parts.length) throw new Error("خطة التقسيط بلا أقساط");
  const amounts = allocateMinor(totalMinor, parts.map((p) => p.weight));
  return parts.map((p, i) => ({ seq: i + 1, label: p.label, dueDate: p.dueDate, amountMinor: amounts[i]! }));
}

/** توزيع دفعة على أقساط بترتيب الاستحقاق */
export function allocateToInstallments(amountMinor: number, installments: Array<{ id: string; amountMinor: number; paidMinor: number }>) {
  let left = amountMinor;
  const out: Array<{ id: string; amountMinor: number }> = [];
  for (const i of installments) {
    if (left <= 0) break;
    const due = i.amountMinor - i.paidMinor;
    if (due <= 0) continue;
    const take = Math.min(due, left);
    out.push({ id: i.id, amountMinor: take });
    left -= take;
  }
  return { allocations: out, remainder: left };
}

/** تفكيك مبلغ شامل للضريبة إلى صافٍ وضريبة */
export function splitTaxInclusive(totalMinor: number, rateBp: number) {
  if (rateBp <= 0) return { netMinor: totalMinor, taxMinor: 0 };
  const net = Math.floor((totalMinor * 10000 + Math.floor((10000 + rateBp) / 2)) / (10000 + rateBp));
  return { netMinor: net, taxMinor: totalMinor - net };
}

// ---------------------------------------------------------------------
// الاعتراف بالإيراد المؤجل
// ---------------------------------------------------------------------

const monthKey = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

/** أشهر الخدمة من شهر البداية إلى شهر النهاية (شاملة) */
export function serviceMonths(start: Date, end: Date): number {
  return Math.max(1, monthKey(end) - monthKey(start) + 1);
}

/** المبلغ الواجب الاعتراف به تراكمياً حتى نهاية الشهر الذي يقع فيه asOf */
export function recognizedToDate(baseMinor: number, start: Date, end: Date, asOf: Date): number {
  const n = serviceMonths(start, end);
  const elapsed = Math.min(n, Math.max(0, monthKey(asOf) - monthKey(start) + 1));
  if (elapsed === 0 || baseMinor === 0) return 0;
  if (elapsed === n) return baseMinor;
  const parts = allocateMinor(Math.abs(baseMinor), Array.from({ length: n }, () => 1));
  const sum = parts.slice(0, elapsed).reduce((s, p) => s + p, 0);
  return baseMinor < 0 ? -sum : sum;
}

/** الأشهر غير المستهلكة بعد تاريخ الانسحاب (للحساب التناسبي) */
export function unusedMonths(start: Date, end: Date, effective: Date): number {
  const n = serviceMonths(start, end);
  const used = Math.min(n, Math.max(0, monthKey(effective) - monthKey(start) + 1));
  return n - used;
}

// ---------------------------------------------------------------------
// التقادم
// ---------------------------------------------------------------------

export const AGING_BUCKETS = [
  { key: "current", label: "غير مستحقة", min: -Infinity, max: 0 },
  { key: "d30", label: "٠–٣٠ يوماً", min: 1, max: 30 },
  { key: "d60", label: "٣١–٦٠ يوماً", min: 31, max: 60 },
  { key: "d90", label: "٦١–٩٠ يوماً", min: 61, max: 90 },
  { key: "d90p", label: "أكثر من ٩٠ يوماً", min: 91, max: Infinity },
] as const;
export type AgingKey = (typeof AGING_BUCKETS)[number]["key"];

export function daysBetween(from: Date, to: Date) {
  return Math.floor((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) / 86_400_000);
}

export function agingBucket(dueDate: Date, asOf: Date): AgingKey {
  const days = daysBetween(dueDate, asOf);
  return AGING_BUCKETS.find((b) => days >= b.min && days <= b.max)!.key;
}

// ---------------------------------------------------------------------
// رمز QR للفاتورة الضريبية المبسطة (TLV بترميز Base64)
// ---------------------------------------------------------------------

/**
 * الحقول الخمسة الأساسية: اسم البائع، الرقم الضريبي، الوقت، الإجمالي شاملاً الضريبة، مبلغ الضريبة.
 * تنبيه: يغطي متطلبات المرحلة الأولى (الإصدار) فقط؛ الربط والتوقيع (المرحلة الثانية) يحتاج مراجعة نظامية.
 */
export function zatcaQrPayload(input: { seller: string; vatNumber: string; timestamp: string; total: string; vat: string }): string {
  const enc = new TextEncoder();
  const fields = [input.seller, input.vatNumber, input.timestamp, input.total, input.vat];
  const chunks: number[] = [];
  fields.forEach((v, i) => {
    const bytes = enc.encode(v);
    if (bytes.length > 255) throw new Error("قيمة أطول من المسموح في رمز QR");
    chunks.push(i + 1, bytes.length, ...bytes);
  });
  let binary = "";
  for (const b of chunks) binary += String.fromCharCode(b);
  return typeof btoa === "function" ? btoa(binary) : Buffer.from(chunks).toString("base64");
}

export function decodeTlv(base64: string): string[] {
  const bytes = typeof atob === "function" ? Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(base64, "base64"));
  const out: string[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < bytes.length; ) {
    const len = bytes[i + 1]!;
    out.push(dec.decode(bytes.slice(i + 2, i + 2 + len)));
    i += 2 + len;
  }
  return out;
}
