"use client";
/**
 * بطاقة مؤشر: القيمة (عدّ تصاعدي عند الظهور) + التغير مقابل فترة مسمّاة (سهم ونص، لا لون وحده)
 * + خط اتجاه صغير اختياري. لون التغير = الاتجاه × هل الارتفاع جيد لهذا المؤشر.
 */
import { ArrowDownLeft, ArrowUpLeft, Minus } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { changeBp, deltaTone } from "@/lib/analytics/metrics";
import { formatNumber } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { usePrefs } from "@/components/shell/app-context";
import { useMoney } from "@/components/finance/common";
import { CountUp } from "@/components/ui/count-up";
import { Sparkline } from "@/components/charts/lines";

export type KpiUnit = "count" | "money" | "bp" | "minutes";

export interface KpiData {
  key: string;
  label: string;
  value: number | null;
  previous: number | null;
  compareLabel: string | null;
  unit: KpiUnit;
  higherIsBetter: boolean;
  href?: string;
  hint?: string;
  spark?: Array<number | null>;
}

export function useUnitFormat() {
  const prefs = usePrefs();
  const money = useMoney();
  return (unit: KpiUnit, v: number, compact = false) => {
    if (unit === "money") return compact ? money.compact(v) : money.whole(v);
    if (unit === "bp") return `${formatNumber(Math.round(v / 10) / 10, prefs.digits)}٪`;
    if (unit === "minutes") return `${formatNumber(v, prefs.digits)} د`;
    return formatNumber(v, prefs.digits);
  };
}

export function KpiTile({ k }: { k: KpiData }) {
  const prefs = usePrefs();
  const fmt = useUnitFormat();
  // النسب تُقارن بالفرق بالنقاط لا بالتغير النسبي
  const delta = k.value === null || k.previous === null ? null : k.unit === "bp" ? k.value - k.previous : changeBp(k.value, k.previous);
  const tone = deltaTone(k.unit === "bp" && delta !== null ? delta * 1 : delta, k.higherIsBetter);
  const Icon = delta === null || Math.abs(delta) < 50 ? Minus : delta > 0 ? ArrowUpLeft : ArrowDownLeft;
  const sign = delta === null ? "" : delta > 0 ? "+" : delta < 0 ? "−" : "";
  // التغير الهائل عن أساس صغير جداً لا يُقرأ كنسبة: يُعرض كمضاعف
  const deltaText =
    delta === null
      ? null
      : k.unit === "bp"
        ? `${sign}${formatNumber(Math.abs(Math.round(delta / 10) / 10), prefs.digits)} نقطة`
        : delta >= 20000
          ? `${formatNumber(Math.round(delta / 10000 + 1), prefs.digits)} أضعاف`
          : `${sign}${formatNumber(Math.abs(Math.round(delta / 10) / 10), prefs.digits)}٪`;
  const body: ReactNode = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium text-fg-3">{k.label}</span>
        {k.spark ? <Sparkline values={k.spark} className="shrink-0" /> : null}
      </div>
      <div className="mt-2 text-[26px] font-bold leading-none text-fg">{k.value === null ? <span className="text-fg-4">—</span> : <CountUp value={k.value} digits={prefs.digits} format={(v) => fmt(k.unit, v, true)} />}</div>
      <div className="mt-2 flex min-h-[18px] flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px]">
        {deltaText ? (
          <span className={cn("inline-flex items-center gap-0.5 font-medium", tone === "good" && "text-success-800", tone === "bad" && "text-danger-700", tone === "neutral" && "text-fg-3")}>
            <Icon className="size-3.5" aria-hidden />
            {deltaText}
            <span className="sr-only">{tone === "good" ? "(تحسن)" : tone === "bad" ? "(تراجع)" : "(دون تغير يذكر)"}</span>
          </span>
        ) : null}
        {k.compareLabel && k.previous !== null ? <span className="text-fg-3">مقابل {fmt(k.unit, k.previous, true)} {k.compareLabel}</span> : null}
        {k.hint ? <span className="text-fg-3">{k.hint}</span> : null}
      </div>
    </>
  );
  const cls = "block rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] duration-[140ms]";
  return k.href ? (
    <Link href={k.href} className={cn(cls, "hover:-translate-y-px hover:shadow-card-hover")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function KpiGrid({ kpis, loading }: { kpis: KpiData[] | undefined; loading?: boolean }) {
  if (loading || !kpis) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[118px] animate-pulse rounded-lg bg-card shadow-card" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-tour="kpis">
      {kpis.map((k) => (
        <KpiTile key={k.key} k={k} />
      ))}
    </div>
  );
}
