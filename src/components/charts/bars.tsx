"use client";
/**
 * رسوم الأعمدة الأفقية (من اليمين في RTL): أعمدة رفيعة ≤١٦px بطرف بيانات مدوّر ٤px وقاعدة مربعة،
 * فجوة ٢px بين المقاطع المكدّسة، القيمة عند طرف العمود بلون النص، تلميح عند المرور،
 * وعرض جدولي بديل لكل رسم (إمكانية الوصول).
 */
import { useState, type ReactNode } from "react";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { cn } from "@/lib/utils";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { usePrefs } from "@/components/shell/app-context";

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  hint?: string;
}

export interface Series {
  key: string;
  label: string;
  /** رمز لون من رموز الرسوم */
  color: "chart-1" | "chart-2";
}

const COLOR_CLASS = { "chart-1": "bg-chart-1", "chart-2": "bg-chart-2" } as const;

export function ChartCard({ title, subtitle, legend, table, children, className }: { title: string; subtitle?: string; legend?: Series[]; table: { columns: string[]; rows: Array<Array<string | number>> }; children: ReactNode; className?: string }) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const prefs = usePrefs();
  return (
    <section className={cn("rounded-lg bg-card p-4 shadow-card", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[12px] text-fg-3">{subtitle}</p> : null}
        </div>
        <Segmented value={mode} onChange={setMode} options={[{ value: "chart", label: "رسم" }, { value: "table", label: "جدول" }]} />
      </div>
      {legend && legend.length > 1 && mode === "chart" ? (
        <ul className="mb-3 flex flex-wrap gap-4 text-[12px] text-fg-2" aria-label="مفتاح الرسم">
          {legend.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-[3px]", COLOR_CLASS[s.color])} />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      {mode === "chart" ? (
        children
      ) : (
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-fg-3">
              {table.columns.map((c) => (
                <th key={c} className="border-b border-line py-1.5 text-start font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="border-b border-line/60">
                {r.map((cell, j) => (
                  <td key={j} className={cn("py-1.5", typeof cell === "number" && "tabular")}>
                    {typeof cell === "number" ? formatNumber(cell, prefs.digits) : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** أعمدة أفقية لسلسلة واحدة */
export function HBars({ data, format, color = "chart-1", labelWidth = 140, max }: { data: BarDatum[]; format?: (n: number) => string; color?: Series["color"]; labelWidth?: number; max?: number }) {
  const prefs = usePrefs();
  const top = max ?? Math.max(1, ...data.map((d) => d.value));
  const fmt = format ?? ((n: number) => formatNumber(n, prefs.digits));
  return (
    <ul className="space-y-1.5">
      {data.map((d) => (
        <li key={d.key}>
          <Tooltip content={d.hint ? `${d.label}: ${fmt(d.value)} — ${d.hint}` : `${d.label}: ${fmt(d.value)}`}>
            <div className="group flex items-center gap-3 rounded-md px-1 py-1 hover:bg-hover">
              <span className="shrink-0 truncate text-[13px] text-fg-2" style={{ width: labelWidth }}>
                {d.label}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className={cn("h-4 rounded-e-[4px] transition-[width] duration-300 ease-out", COLOR_CLASS[color])} style={{ width: `${(d.value / top) * 100}%`, minWidth: d.value > 0 ? 3 : 0 }} />
                <span className="shrink-0 text-[12px] tabular text-fg-2">{fmt(d.value)}</span>
              </span>
            </div>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

/** أعمدة أفقية مكدّسة لسلسلتين أو أكثر (فجوة ٢px بين المقاطع) */
export function StackedHBars({ rows, series, labelWidth = 140 }: { rows: Array<{ key: string; label: string; values: Record<string, number> }>; series: Series[]; labelWidth?: number }) {
  const prefs = usePrefs();
  const total = (r: (typeof rows)[number]) => series.reduce((a, s) => a + (r.values[s.key] ?? 0), 0);
  const top = Math.max(1, ...rows.map(total));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const t = total(r);
        const parts = series.filter((s) => (r.values[s.key] ?? 0) > 0);
        return (
          <li key={r.key} className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-hover">
            <span className="shrink-0 truncate text-[13px] text-fg-2" style={{ width: labelWidth }}>
              {r.label}
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="flex h-4 gap-[2px]" style={{ width: `${(t / top) * 100}%` }}>
                {parts.map((s, i) => {
                  const v = r.values[s.key] ?? 0;
                  return (
                    <Tooltip key={s.key} content={`${r.label} — ${s.label}: ${formatNumber(v, prefs.digits)} (${formatPercent(v / (t || 1), prefs.digits)})`}>
                      <span className={cn("h-full", COLOR_CLASS[s.color], i === parts.length - 1 && "rounded-e-[4px]")} style={{ flexGrow: v, flexBasis: 0, minWidth: 3 }} />
                    </Tooltip>
                  );
                })}
              </span>
              <span className="shrink-0 text-[12px] tabular text-fg-2">{formatNumber(t, prefs.digits)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
