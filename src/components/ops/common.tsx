"use client";
/**
 * عناصر مشتركة لوحدات العمليات: الروابط والتبويبات، وسوم الحالات، رفع الصور، ونموذج إعدادات الوحدة.
 */
import { ImagePlus, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { MODULE_NAV, type ModuleNavItem } from "@/lib/modules-nav";
import { trpc } from "@/lib/trpc/client";
import { pickFile, uploadFile } from "@/lib/upload";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonLines } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { SettingsCard } from "@/components/settings/settings-shell";

export const opsNav = (key: string): ModuleNavItem => MODULE_NAV.find((m) => m.key === key)!;

type L = Record<string, { label: string; color: string }>;

export const INVENTORY_TABS = [
  { href: "/inventory", label: "نظرة عامة", exact: true },
  { href: "/inventory/items", label: "الأصناف" },
  { href: "/inventory/purchasing", label: "المشتريات" },
  { href: "/inventory/bills", label: "فواتير الموردين" },
  { href: "/inventory/suppliers", label: "الموردون" },
  { href: "/inventory/counts", label: "الجرد" },
  { href: "/inventory/warehouses", label: "المستودعات" },
  { href: "/inventory/sales", label: "مبيعات المتجر" },
  { href: "/inventory/settings", label: "الإعدادات" },
];
export const MAINT_TABS = [
  { href: "/maintenance", label: "لوحة البلاغات", exact: true },
  { href: "/maintenance/schedules", label: "الصيانة الدورية" },
  { href: "/maintenance/bookings", label: "حجز المرافق" },
];
export const TRANSPORT_TABS = [
  { href: "/transport", label: "الخطوط", exact: true },
  { href: "/transport/buses", label: "الحافلات" },
  { href: "/transport/trips", label: "رحلات اليوم" },
  { href: "/transport/settings", label: "الإعدادات" },
];
export const LIBRARY_TABS = [
  { href: "/library", label: "الفهرس", exact: true },
  { href: "/library/desk", label: "الإعارة والإرجاع" },
  { href: "/library/loans", label: "سجل الإعارات" },
  { href: "/library/reservations", label: "الحجوزات" },
  { href: "/library/stocktake", label: "الجرد" },
  { href: "/library/settings", label: "الإعدادات" },
];
export const CANTEEN_TABS = [
  { href: "/canteen", label: "نقطة البيع", exact: true },
  { href: "/canteen/wallets", label: "المحافظ" },
  { href: "/canteen/sales", label: "المبيعات" },
  { href: "/canteen/items", label: "الأصناف" },
  { href: "/canteen/settings", label: "الإعدادات" },
];
export const SAFETY_TABS = [
  { href: "/safety", label: "الزوار", exact: true },
  { href: "/safety/pickups", label: "استلام الطلاب" },
  { href: "/safety/incidents", label: "الحوادث" },
  { href: "/safety/drills", label: "الإخلاء والفحوص" },
];
export const ASSET_TABS = [
  { href: "/finance/assets", label: "سجل الأصول", exact: true },
  { href: "/finance/assets/depreciation", label: "الإهلاك الشهري" },
  { href: "/finance/assets/categories", label: "الفئات" },
];

export const ITEM_CATEGORY: L = {
  UNIFORM: { label: "زي مدرسي", color: "navy" },
  BOOK: { label: "كتب", color: "brown" },
  SUPPLY: { label: "مستلزمات", color: "slate" },
  CANTEEN: { label: "مقصف", color: "orange" },
  SPARE_PART: { label: "قطع غيار", color: "gray" },
  MEDICAL: { label: "طبية", color: "red" },
  OTHER: { label: "أخرى", color: "gray" },
};
export const WAREHOUSE_KIND: L = {
  STORE: { label: "متجر الزي والكتب", color: "navy" },
  SUPPLIES: { label: "مستلزمات", color: "slate" },
  CANTEEN: { label: "مقصف", color: "orange" },
  MAINTENANCE: { label: "صيانة", color: "gray" },
  CLINIC: { label: "عيادة", color: "red" },
};
export const MOVE_KIND: L = {
  OPENING: { label: "رصيد افتتاحي", color: "slate" },
  RECEIPT: { label: "استلام", color: "green" },
  ISSUE: { label: "صرف", color: "orange" },
  SALE: { label: "بيع", color: "navy" },
  SALE_RETURN: { label: "مرتجع بيع", color: "teal" },
  ADJUSTMENT: { label: "تسوية جرد", color: "purple" },
  TRANSFER_IN: { label: "تحويل وارد", color: "teal" },
  TRANSFER_OUT: { label: "تحويل صادر", color: "gold" },
};
export const PR_STATUS: L = {
  DRAFT: { label: "مسودة", color: "gray" },
  PENDING: { label: "بانتظار الاعتماد", color: "gold" },
  APPROVED: { label: "معتمد", color: "green" },
  REJECTED: { label: "مرفوض", color: "red" },
  ORDERED: { label: "صدر له أمر شراء", color: "navy" },
  CANCELLED: { label: "ملغى", color: "gray" },
};
export const PO_STATUS: L = {
  DRAFT: { label: "مسودة", color: "gray" },
  ISSUED: { label: "صادر للمورد", color: "navy" },
  PARTIAL: { label: "مستلم جزئياً", color: "gold" },
  RECEIVED: { label: "مستلم بالكامل", color: "teal" },
  CLOSED: { label: "مغلق (مفوتر)", color: "green" },
  CANCELLED: { label: "ملغى", color: "red" },
};
export const BILL_STATUS: L = {
  OPEN: { label: "مستحقة", color: "gold" },
  PARTIAL: { label: "مسددة جزئياً", color: "teal" },
  PAID: { label: "مسددة", color: "green" },
  CANCELLED: { label: "ملغاة", color: "gray" },
};
export const MATCH_STATUS: L = {
  MATCHED: { label: "مطابقة ثلاثية", color: "green" },
  PRICE_VARIANCE: { label: "فرق سعر", color: "orange" },
  DIRECT: { label: "مباشرة", color: "slate" },
};
export const MAINT_STATUS: L = {
  NEW: { label: "جديد", color: "gray" },
  IN_PROGRESS: { label: "قيد التنفيذ", color: "navy" },
  WAITING_PARTS: { label: "بانتظار قطع", color: "gold" },
  DONE: { label: "مكتمل", color: "green" },
  CANCELLED: { label: "ملغى", color: "red" },
};
export const MAINT_CATEGORY: L = {
  ELECTRICAL: { label: "كهرباء", color: "gold" },
  PLUMBING: { label: "سباكة", color: "teal" },
  HVAC: { label: "تكييف", color: "navy" },
  CARPENTRY: { label: "نجارة", color: "brown" },
  IT: { label: "تقنية", color: "purple" },
  CLEANING: { label: "نظافة", color: "green" },
  SAFETY: { label: "سلامة", color: "red" },
  VEHICLE: { label: "مركبات", color: "slate" },
  OTHER: { label: "أخرى", color: "gray" },
};
export const PRIORITY: L = {
  LOW: { label: "منخفضة", color: "gray" },
  MEDIUM: { label: "متوسطة", color: "teal" },
  HIGH: { label: "عالية", color: "orange" },
  URGENT: { label: "عاجلة", color: "red" },
};
export const PAY_METHOD: L = {
  CASH: { label: "نقداً", color: "green" },
  CARD: { label: "بطاقة", color: "navy" },
  STUDENT_ACCOUNT: { label: "على حساب الطالب", color: "gold" },
  WALLET: { label: "المحفظة", color: "teal" },
};
export const WALLET_TX: L = {
  TOPUP: { label: "شحن", color: "green" },
  FROM_CREDIT: { label: "شحن من الرصيد الدائن", color: "teal" },
  PURCHASE: { label: "شراء", color: "navy" },
  REFUND: { label: "استرداد", color: "purple" },
  ADJUSTMENT: { label: "تسوية", color: "gray" },
  WITHDRAWAL: { label: "سحب نقدي", color: "orange" },
};
export const ASSET_STATUS: L = {
  ACTIVE: { label: "قيد الاستخدام", color: "green" },
  FULLY_DEPRECIATED: { label: "مكتمل الإهلاك", color: "slate" },
  DISPOSED: { label: "مستبعد", color: "gray" },
};
export const DEP_METHOD: L = {
  STRAIGHT_LINE: { label: "قسط ثابت", color: "navy" },
  DECLINING: { label: "قسط متناقص", color: "purple" },
  NONE: { label: "لا يُهلك", color: "gray" },
};
export const BUDGET_STATUS: L = {
  DRAFT: { label: "مسودة", color: "gray" },
  PENDING: { label: "بانتظار الاعتماد", color: "gold" },
  APPROVED: { label: "معتمدة", color: "green" },
  REJECTED: { label: "مرفوضة", color: "red" },
  SUPERSEDED: { label: "مستبدلة", color: "slate" },
};
export const BUS_STATUS: L = {
  ACTIVE: { label: "في الخدمة", color: "green" },
  MAINTENANCE: { label: "في الصيانة", color: "gold" },
  RETIRED: { label: "خارج الخدمة", color: "gray" },
};
export const BUS_LOG: L = {
  MAINTENANCE: { label: "صيانة", color: "gold" },
  FUEL: { label: "وقود", color: "orange" },
  INSPECTION: { label: "فحص", color: "teal" },
  INSURANCE: { label: "تأمين", color: "navy" },
  ACCIDENT: { label: "حادث", color: "red" },
};
export const DIRECTION: L = {
  BOTH: { label: "ذهاب وعودة", color: "navy" },
  MORNING: { label: "ذهاب فقط", color: "teal" },
  AFTERNOON: { label: "عودة فقط", color: "gold" },
};
export const COPY_STATUS: L = {
  AVAILABLE: { label: "متاحة", color: "green" },
  ON_LOAN: { label: "معارة", color: "navy" },
  ON_HOLD: { label: "محجوزة", color: "gold" },
  LOST: { label: "مفقودة", color: "red" },
  DAMAGED: { label: "تالفة", color: "orange" },
  WITHDRAWN: { label: "مسحوبة", color: "gray" },
};
export const INCIDENT_KIND: L = {
  INJURY: { label: "إصابة", color: "red" },
  FIGHT: { label: "مشاجرة", color: "orange" },
  FIRE: { label: "حريق", color: "red" },
  PROPERTY: { label: "إتلاف ممتلكات", color: "brown" },
  SECURITY: { label: "أمني", color: "navy" },
  HEALTH: { label: "صحي", color: "teal" },
  BUS: { label: "الحافلات", color: "gold" },
  OTHER: { label: "أخرى", color: "gray" },
};
export const SEVERITY: L = {
  LOW: { label: "منخفضة", color: "gray" },
  MEDIUM: { label: "متوسطة", color: "gold" },
  HIGH: { label: "خطيرة", color: "orange" },
  CRITICAL: { label: "حرجة", color: "red" },
};
export const INCIDENT_STATUS: L = {
  OPEN: { label: "مفتوح", color: "gold" },
  INVESTIGATING: { label: "قيد التحقيق", color: "navy" },
  CLOSED: { label: "مغلق", color: "green" },
};
export const DRILL_KIND: L = {
  FIRE: { label: "إخلاء حريق", color: "red" },
  EVACUATION: { label: "إخلاء عام", color: "orange" },
  EARTHQUAKE: { label: "زلازل", color: "brown" },
  LOCKDOWN: { label: "إغلاق وقائي", color: "navy" },
  EQUIPMENT_CHECK: { label: "فحص معدات الإطفاء", color: "teal" },
};
export const CLINIC_OUTCOME: L = {
  RETURNED_TO_CLASS: { label: "عاد إلى الفصل", color: "green" },
  RESTED: { label: "استراح في العيادة", color: "teal" },
  SENT_HOME: { label: "استُلم للمنزل", color: "gold" },
  REFERRED: { label: "أحيل لجهة صحية", color: "orange" },
  AMBULANCE: { label: "نُقل بالإسعاف", color: "red" },
};

export const options = (m: L) => Object.entries(m).map(([value, v]) => ({ value, label: v.label }));

/** صور قبل/بعد وأي مرفقات صور: رفع ومعاينة وحذف */
export function PhotoList({ value, onChange, disabled, label }: { value: Array<{ url: string; name?: string }>; onChange: (v: Array<{ url: string; name?: string }>) => void; disabled?: boolean; label?: string }) {
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const file = await pickFile("image/*");
    if (!file) return;
    setBusy(true);
    try {
      const u = await uploadFile(file);
      onChange([...value, { url: u.url, name: u.name }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الصورة");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      {label ? <span className="mb-1.5 block text-[13px] font-medium text-fg-2">{label}</span> : null}
      <div className="flex flex-wrap gap-2">
        {value.map((p, i) => (
          <div key={p.url} className="group relative size-20 overflow-hidden rounded-md bg-hover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.name ?? "صورة"} className="size-full object-cover" />
            {!disabled ? (
              <button type="button" aria-label="حذف الصورة" className="absolute end-1 top-1 grid size-5 place-items-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        ))}
        {!disabled ? (
          <Button variant="ghost" className="size-20 flex-col gap-1 border border-dashed border-line text-[11px]" loading={busy} onClick={add} aria-label="إضافة صورة">
            <ImagePlus className="size-5" />
            إضافة
          </Button>
        ) : !value.length ? (
          <span className="text-[13px] text-fg-3">لا صور</span>
        ) : null}
      </div>
    </div>
  );
}

/** نموذج إعدادات وحدة عام: يحمّل القيم ويحفظها عبر إعدادات الوحدات */
export function ModuleSettingsForm<T extends Record<string, unknown>>({ settingsKey, title, description, children }: { settingsKey: "library" | "canteen" | "transport" | "procurement" | "finance"; title: string; description?: string; children: (v: T, set: (patch: Partial<T>) => void, canEdit: boolean) => ReactNode }) {
  const q = trpc.moduleSettings.get.useQuery({ key: settingsKey });
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض الإعدادات" description={q.error.message} />;
  if (!q.data) return <SkeletonLines lines={8} />;
  return <SettingsInner key={JSON.stringify(q.data.values)} settingsKey={settingsKey} title={title} description={description} initial={q.data.values as unknown as T} canEdit={q.data.canEdit}>{children}</SettingsInner>;
}

function SettingsInner<T extends Record<string, unknown>>({ settingsKey, title, description, initial, canEdit, children }: { settingsKey: "library" | "canteen" | "transport" | "procurement" | "finance"; title: string; description?: string; initial: T; canEdit: boolean; children: (v: T, set: (patch: Partial<T>) => void, canEdit: boolean) => ReactNode }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState(initial);
  const save = trpc.moduleSettings.update.useMutation({ onSuccess: async () => (await Promise.all([utils.moduleSettings.get.invalidate({ key: settingsKey }), utils.account.context.invalidate()]), toast.success("حُفظت الإعدادات")), onError: (e) => toast.error(e.message) });
  return (
    <>
      {!canEdit ? <p className="mb-4 rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">عرض فقط: التعديل لمن يملك صلاحية الوحدة على مستوى المدرسة.</p> : null}
      <SettingsCard title={title} description={description} footer={canEdit ? <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ key: settingsKey, patch: { ...v } })}>حفظ</Button> : undefined}>
        {children(v, (patch) => setV({ ...v, ...patch }), canEdit)}
      </SettingsCard>
    </>
  );
}

/** بداية الأسبوع (الأحد) لتاريخ ISO */
export function weekStartOf(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(d.getTime() - d.getUTCDay() * 86_400_000).toISOString().slice(0, 10);
}
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** شريط تقدم استهلاك (أخضر ← برتقالي ← أحمر) */
export function UsageBar({ usedBp, state }: { usedBp: number; state: string }) {
  const pct = Math.min(100, usedBp / 100);
  const color = state === "OVER" ? "var(--tag-red-dot)" : state === "WARNING" ? "var(--tag-orange-dot)" : "var(--tag-green-dot)";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** مسار الموافقات (للقراءة؛ القرار من صندوق الوارد) */
export function ApprovalTimeline({ approval }: { approval: { status: string; currentStep: number; steps: Array<{ order: number; name: string; status: string; decidedAt: Date | string | null; comment: string | null }> } | null | undefined }) {
  if (!approval) return <p className="text-[13px] text-fg-3">لم يُرفع للاعتماد بعد.</p>;
  return (
    <div>
      <ol className="space-y-3">
        {approval.steps.map((s) => {
          const current = approval.currentStep === s.order && approval.status === "PENDING";
          return (
            <li key={s.order} className="flex items-start gap-2.5">
              <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] ${s.status === "APPROVED" ? "bg-success-50 text-success-800" : s.status === "REJECTED" ? "bg-danger-50 text-danger-700" : current ? "bg-warning-50 text-warning-700" : "bg-hover text-fg-3"}`}>
                {s.status === "APPROVED" ? "✓" : s.status === "REJECTED" ? "✕" : "•"}
              </span>
              <span className="min-w-0 text-[13px]">
                <span className="block font-medium">{s.name}</span>
                <span className="block text-[12px] text-fg-3">{s.status === "APPROVED" ? "معتمدة" : s.status === "REJECTED" ? "مرفوضة" : current ? "بانتظار القرار" : "لاحقاً"}</span>
                {s.comment ? <span className="mt-0.5 block text-[12px] text-fg-2">«{s.comment}»</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <Link href="/inbox?tab=approvals" className="mt-3 block text-[12px] text-fg-3 underline">القرارات تُتخذ من «صندوق الوارد ← الموافقات»</Link>
    </div>
  );
}
