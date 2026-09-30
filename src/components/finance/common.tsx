"use client";
/**
 * عناصر مشتركة للمالية: تنسيق المبالغ حسب تفضيل الأرقام وعملة المدرسة، حقل المبلغ (بلا float)،
 * جدول مالي بسيط، اختيار الفترة، وتبويبات الوحدات المالية.
 */
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { toISODate } from "@/lib/dates";
import { formatDate } from "@/lib/dates";
import { MODULE_NAV, type ModuleNavItem } from "@/lib/modules-nav";
import { currencySymbol, formatMoney, minorToDecimalString, parseMoney } from "@/lib/money";
import { formatNumber } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useApp, usePrefs } from "@/components/shell/app-context";

export const financeNav = (key: string): ModuleNavItem => MODULE_NAV.find((m) => m.key === key)!;

export const INVOICE_TABS = [
  { href: "/finance/invoices", label: "الفواتير", exact: true },
  { href: "/finance/invoices/bulk", label: "الفوترة الجماعية" },
  { href: "/finance/families", label: "كشوف حساب الأسر" },
];
/** تبويبات الفواتير حسب الصلاحية (ولي الأمر يرى فواتير أبنائه فقط) */
export function useInvoiceTabs() {
  const { can } = useApp();
  return INVOICE_TABS.filter((t) =>
    t.href.endsWith("/bulk")
      ? can("invoices", "create")
      : t.href.endsWith("/families")
        ? can("collections", "create") || can("invoices", "update")
        : true,
  );
}

export const COLLECT_TABS = [
  { href: "/finance/collect", label: "سند قبض سريع", exact: true },
  { href: "/finance/collect/receipts", label: "سجل السندات" },
  { href: "/finance/collect/cheques", label: "الشيكات" },
  { href: "/finance/collect/session", label: "وردية الصندوق" },
];
export const ACCOUNTING_TABS = [
  { href: "/finance/accounting", label: "دفتر اليومية", exact: true },
  { href: "/finance/accounting/chart", label: "دليل الحسابات" },
  { href: "/finance/accounting/periods", label: "الفترات والإقفال" },
  { href: "/finance/accounting/cost-centers", label: "مراكز التكلفة" },
];
export const SETUP_TABS = [
  { href: "/finance/setup", label: "بنود الرسوم", exact: true },
  { href: "/finance/setup/schedules", label: "جداول الرسوم" },
  { href: "/finance/setup/plans", label: "خطط الأقساط" },
  { href: "/finance/setup/discounts", label: "الخصومات والمنح" },
  { href: "/finance/setup/taxes", label: "الضرائب" },
  { href: "/finance/setup/settings", label: "إعدادات المالية" },
];

/** رقم مستند بلا فواصل آلاف وبتفضيل الأرقام */
export const docNo = (n: number | null | undefined, digits: "arab" | "latn") =>
  n === null || n === undefined ? "—" : formatNumber(n, digits, { useGrouping: false });

/** منسّق المبالغ بعملة المدرسة وتفضيل الأرقام */
export function useMoney() {
  const { tenant } = useApp();
  const prefs = usePrefs();
  const currency = tenant.currency;
  return {
    currency,
    fmt: (minor: number, symbol = true) => formatMoney(minor, { currency, digits: prefs.digits, symbol }),
    /** مبلغ بلا رمز مع إخفاء الصفر (للجداول المحاسبية) */
    cell: (minor: number) =>
      minor ? formatMoney(minor, { currency, digits: prefs.digits, symbol: false }) : "",
    /** مبلغ بالريال الصحيح (للمؤشرات الكبيرة)؛ يُقتطع النص العشري دون عمليات عشرية */
    whole: (minor: number) => {
      const [int] = minorToDecimalString(minor, currency).split(".");
      return `${formatNumber(Number(int), prefs.digits)} ${currencySymbol(currency)}`;
    },
    /** نص عشري دقيق للتصدير */
    dec: (minor: number) => minorToDecimalString(minor, currency),
    /** مختصر للمؤشرات (١٫٢ مليون) — عرض فقط، من الجزء الصحيح دون حسابات عشرية على المبلغ */
    compact: (minor: number) => {
      const [int] = minorToDecimalString(minor, currency).split(".");
      const major = Number(int);
      if (Math.abs(major) < 100_000) return `${formatNumber(major, prefs.digits)} ${currencySymbol(currency)}`;
      return `${new Intl.NumberFormat(prefs.digits === "arab" ? "ar-SA-u-nu-arab" : "ar-SA-u-nu-latn", { notation: "compact", maximumFractionDigits: 1 }).format(major)} ${currencySymbol(currency)}`;
    },
  };
}

export function useToday() {
  const { tenant } = useApp();
  return toISODate(new Date(), tenant.timezone);
}

export function useFmtDate() {
  const prefs = usePrefs();
  return (d: Date | string | null | undefined, style: "short" | "long" = "short") =>
    d ? formatDate(d, { digits: prefs.digits, calendar: prefs.calendar, style }) : "—";
}

/** حقل مبلغ: يُحوَّل النص إلى أصغر وحدة بلا عمليات عشرية، ويعرض الخطأ فوراً */
export function MoneyInput({
  value,
  onChange,
  placeholder = "٠٫٠٠",
  className,
  autoFocus,
  disabled,
  id,
  onEnter,
  "aria-label": ariaLabel,
}: {
  value: number | null;
  onChange: (minor: number | null) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  onEnter?: () => void;
  "aria-label"?: string;
}) {
  const { currency } = useMoney();
  const [text, setText] = useState(value === null ? "" : minorToDecimalString(value, currency));
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState(value);
  // مزامنة القيمة الخارجية (مثل «سداد الكل») دون كسر ما يكتبه المستخدم
  if (value !== last) {
    setLast(value);
    let current: number | null = null;
    try {
      current = text.trim() ? parseMoney(text, currency) : null;
    } catch {
      current = null;
    }
    if (current !== value) setText(value === null ? "" : minorToDecimalString(value, currency));
  }
  return (
    <span className={cn("block", className)}>
      <Input
        id={id}
        dir="ltr"
        inputMode="decimal"
        autoFocus={autoFocus}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={Boolean(error)}
        className={cn("text-end tabular", error && "shadow-[0_0_0_1px_var(--danger-700)]")}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (!t.trim()) {
            setError(null);
            setLast(null);
            onChange(null);
            return;
          }
          try {
            const v = parseMoney(t, currency);
            if (v < 0) throw new Error("المبلغ لا يكون سالباً");
            setError(null);
            setLast(v);
            onChange(v);
          } catch (err) {
            setError((err as Error).message);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      {error ? <span className="mt-1 block text-[12px] text-danger-700">{error}</span> : null}
    </span>
  );
}

/** نسبة بنقاط الأساس ↔ نص مئوي (١٥٪ = 1500) دون float في التخزين */
export function PercentInput({
  bp,
  onChange,
  disabled,
}: {
  bp: number;
  onChange: (bp: number) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(bp ? String(bp / 100) : "");
  return (
    <Input
      dir="ltr"
      inputMode="decimal"
      className="text-end tabular"
      disabled={disabled}
      value={text}
      placeholder="0"
      onChange={(e) => {
        setText(e.target.value);
        const m = /^(\d{1,3})(?:[.٫](\d{0,2}))?$/.exec(e.target.value.trim());
        if (m) onChange(Math.min(10000, Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"))));
      }}
    />
  );
}

/** جدول مالي مضغوط: رأس ثابت، أرقام محاذاة للطرف، وصف الإجمالي */
export function FinTable({
  head,
  children,
  foot,
  className,
  dense,
}: {
  head: ReactNode;
  children: ReactNode;
  foot?: ReactNode;
  className?: string;
  dense?: boolean;
}) {
  return (
    <div className={cn("overflow-x-auto rounded-lg bg-card shadow-card thin-scroll", className)}>
      <table
        className={cn(
          "w-full border-collapse text-[13px]",
          dense ? "[&_td]:py-1.5 [&_th]:py-1.5" : "[&_td]:py-2 [&_th]:py-2",
        )}
      >
        <thead className="text-fg-3 [&_th]:whitespace-nowrap [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:font-medium [&_th:not(.text-end)]:text-start">
          {head}
        </thead>
        <tbody className="[&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_tr:hover]:bg-hover/60">
          {children}
        </tbody>
        {foot ? (
          <tfoot className="font-semibold [&_td]:border-t-2 [&_td]:border-line [&_td]:px-3">{foot}</tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** وسم من خريطة وسوم بمفتاح نصي (الحقول النصية في قاعدة البيانات) */
export function labelOf<M extends Record<string, { label: string; color: string }>>(
  map: M,
  key: string | null | undefined,
): { label: string; color: string } {
  return (
    (key && (map as Record<string, { label: string; color: string }>)[key]) || {
      label: key ?? "—",
      color: "gray",
    }
  );
}

export const num = "text-end tabular whitespace-nowrap";

/** رابط رقم المستند (يفتح المستند المصدر) */
export function DocLink({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  if (!href) return <span className="tabular">{children}</span>;
  return (
    <Link
      href={href}
      className="tabular text-fg underline decoration-line underline-offset-4 hover:decoration-fg-3"
    >
      {children}
    </Link>
  );
}

/** نطاق تاريخين بسيط */
export function RangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (r: { from: string; to: string }) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
      <span>من</span>
      <Input
        type="date"
        className="h-7 w-[150px] text-[13px]"
        value={from}
        max={to}
        onChange={(e) => e.target.value && onChange({ from: e.target.value, to })}
      />
      <span>إلى</span>
      <Input
        type="date"
        className="h-7 w-[150px] text-[13px]"
        value={to}
        min={from}
        onChange={(e) => e.target.value && onChange({ from, to: e.target.value })}
      />
    </div>
  );
}

/** بداية الشهر والسنة من تاريخ ISO */
export const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
export const yearStart = (iso: string) => `${iso.slice(0, 4)}-01-01`;

/** صندوق ملخص رقمي صغير */
export function Figure({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "danger" | "success" | "warning";
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-card px-4 py-3 shadow-card">
      <p className="text-[12px] font-medium text-fg-3">{label}</p>
      <p
        className={cn(
          "mt-1 text-[20px] font-bold tabular",
          tone === "danger" && "text-danger-700",
          tone === "success" && "text-success-800",
          tone === "warning" && "text-warning-700",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[12px] text-fg-3">{hint}</p> : null}
    </div>
  );
}

/** أداة طباعة: زر يطبع الصفحة الحالية (العناصر no-print تختفي) */
export function printPage() {
  window.print();
}

/** تنزيل جدول كملف CSV (بترميز UTF-8 مع BOM ليفتحه Excel بالعربية) */
export function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
  const esc = (v: string | number) => {
    const t = String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
