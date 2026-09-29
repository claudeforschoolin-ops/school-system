/**
 * وسوم المالية (مشتركة بين الخادم والواجهة) — ألوان من لوحة الوسوم الهادئة فقط.
 */
import type { OptionColor } from "@/lib/database/types";

type Labeled<K extends string> = Record<K, { label: string; color: OptionColor }>;

export const INVOICE_STATUS = {
  DRAFT: { label: "مسودة", color: "gray" },
  ISSUED: { label: "صادرة", color: "navy" },
  PARTIAL: { label: "مدفوعة جزئياً", color: "gold" },
  PAID: { label: "مدفوعة", color: "green" },
  OVERDUE: { label: "متأخرة", color: "red" },
  CANCELLED: { label: "ملغاة", color: "slate" },
} as const satisfies Labeled<string>;
export type InvoiceDisplayStatus = keyof typeof INVOICE_STATUS;
export const INVOICE_FLOW: InvoiceDisplayStatus[] = ["DRAFT", "ISSUED", "PARTIAL", "OVERDUE", "PAID", "CANCELLED"];

export const PAYMENT_METHOD = {
  CASH: { label: "نقد", color: "green" },
  BANK_TRANSFER: { label: "تحويل بنكي", color: "navy" },
  CHEQUE: { label: "شيك", color: "gold" },
  CARD: { label: "بطاقة (مدى/ائتمانية)", color: "teal" },
  SADAD: { label: "سداد", color: "purple" },
} as const satisfies Labeled<string>;
export type PaymentMethodKey = keyof typeof PAYMENT_METHOD;

export const CHEQUE_STATUS = {
  PENDING: { label: "تحت التحصيل", color: "gold" },
  CLEARED: { label: "محصّل", color: "green" },
  BOUNCED: { label: "مرتد", color: "red" },
} as const satisfies Labeled<string>;

export const FEE_KIND = {
  TUITION: { label: "رسوم دراسية", color: "navy" },
  REGISTRATION: { label: "تسجيل وقبول", color: "teal" },
  TRANSPORT: { label: "نقل مدرسي", color: "gold" },
  ACTIVITY: { label: "أنشطة ورحلات", color: "purple" },
  BOOKS: { label: "كتب", color: "brown" },
  UNIFORM: { label: "زي مدرسي", color: "slate" },
  MEALS: { label: "وجبات", color: "orange" },
  LATE_FEE: { label: "غرامة تأخير", color: "red" },
  OTHER: { label: "أخرى", color: "gray" },
} as const satisfies Labeled<string>;
export type FeeKindKey = keyof typeof FEE_KIND;

export const DISCOUNT_KIND = {
  SIBLING: { label: "خصم الأشقاء", color: "teal" },
  STAFF: { label: "خصم الموظفين", color: "navy" },
  MERIT: { label: "خصم التفوق", color: "gold" },
  SCHOLARSHIP: { label: "منحة دراسية", color: "green" },
  EARLY_PAYMENT: { label: "خصم الدفع المبكر", color: "purple" },
  MANUAL: { label: "خصم يدوي", color: "orange" },
} as const satisfies Labeled<string>;
export type DiscountKindKey = keyof typeof DISCOUNT_KIND;

export const ACCOUNT_TYPE = {
  ASSET: { label: "أصول", color: "navy" },
  LIABILITY: { label: "خصوم", color: "orange" },
  EQUITY: { label: "حقوق ملكية", color: "purple" },
  REVENUE: { label: "إيرادات", color: "green" },
  EXPENSE: { label: "مصروفات", color: "red" },
} as const satisfies Labeled<string>;
export type AccountTypeKey = keyof typeof ACCOUNT_TYPE;

export const JOURNAL_SOURCE = {
  MANUAL: { label: "قيد يدوي", color: "gray" },
  OPENING: { label: "أرصدة افتتاحية", color: "slate" },
  INVOICE: { label: "فاتورة", color: "navy" },
  CREDIT_NOTE: { label: "إشعار دائن", color: "orange" },
  RECEIPT: { label: "سند قبض", color: "green" },
  RECEIPT_VOID: { label: "إلغاء سند", color: "red" },
  CREDIT_APPLICATION: { label: "استخدام رصيد دائن", color: "teal" },
  REFUND: { label: "استرداد", color: "orange" },
  PAYMENT_VOUCHER: { label: "سند صرف", color: "brown" },
  REVENUE_RECOGNITION: { label: "اعتراف بالإيراد", color: "purple" },
  CHEQUE: { label: "شيك", color: "gold" },
  CASH_SESSION: { label: "فرق صندوق", color: "gold" },
  BANK_TRANSFER: { label: "تحويل بين حسابات", color: "teal" },
  WRITE_OFF: { label: "شطب دين", color: "red" },
  CLOSING: { label: "إقفال", color: "slate" },
  REVERSAL: { label: "قيد عكسي", color: "red" },
} as const satisfies Labeled<string>;
export type JournalSourceKey = keyof typeof JOURNAL_SOURCE;

export const VOUCHER_STATUS = {
  PENDING: { label: "بانتظار الاعتماد", color: "gold" },
  APPROVED: { label: "معتمد للصرف", color: "teal" },
  PAID: { label: "مصروف", color: "green" },
  REJECTED: { label: "مرفوض", color: "red" },
  CANCELLED: { label: "ملغى", color: "slate" },
} as const satisfies Labeled<string>;

export const REFUND_STATUS = {
  PENDING: { label: "بانتظار الموافقة", color: "gold" },
  APPROVED: { label: "معتمد", color: "teal" },
  PAID: { label: "مصروف", color: "green" },
  REJECTED: { label: "مرفوض", color: "red" },
} as const satisfies Labeled<string>;

export const CREDIT_NOTE_KIND = {
  ADJUSTMENT: { label: "تعديل", color: "gray" },
  CANCELLATION: { label: "إلغاء فاتورة", color: "red" },
  PRORATION: { label: "تسوية تناسبية", color: "purple" },
  DISCOUNT: { label: "خصم لاحق", color: "teal" },
} as const satisfies Labeled<string>;

/** مفاتيح الحسابات النظامية المستخدمة في القيود الآلية */
export const SYSTEM_ACCOUNTS = {
  CASH: "الصندوق الرئيسي",
  BANK_DEFAULT: "البنك الرئيسي",
  CHEQUES_UNDER_COLLECTION: "شيكات تحت التحصيل",
  AR_TUITION: "ذمم أولياء الأمور — رسوم دراسية",
  AR_OTHER: "ذمم أولياء الأمور — رسوم أخرى",
  DEFERRED_REVENUE: "إيرادات مؤجلة",
  GUARDIAN_CREDIT: "أرصدة دائنة لأولياء الأمور",
  VAT_OUTPUT: "ضريبة القيمة المضافة — مخرجات",
  VAT_INPUT: "ضريبة القيمة المضافة — مدخلات",
  DISCOUNTS: "خصومات وإعفاءات ومنح",
  LATE_FEES: "غرامات تأخير",
  CASH_OVER_SHORT: "فروقات الصندوق",
  BAD_DEBT: "ديون معدومة",
  RETAINED_EARNINGS: "الأرباح المبقاة",
  OPENING_EQUITY: "أرصدة افتتاحية",
} as const;
export type SystemAccountKey = keyof typeof SYSTEM_ACCOUNTS;
