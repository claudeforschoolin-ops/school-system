"use client";
/**
 * أعمدة رأسية لسلسلة زمنية واحدة: عرض ≤١٨px، طرف علوي مدوّر ٤px وقاعدة مربعة على خط أساس رفيع،
 * قيمة واحدة ظاهرة (الأعلى) والبقية في التلميح، وتسميات محور متباعدة لتفادي التزاحم.
 */
import { formatNumber } from "@/lib/numbers";
import { Tooltip } from "@/components/ui/tooltip";
import { usePrefs } from "@/components/shell/app-context";
import type { BarDatum } from "./bars";

export function Columns({ data, format, height = 160 }: { data: BarDatum[]; format?: (n: number) => string; height?: number }) {
  const prefs = usePrefs();
  const fmt = format ?? ((n: number) => formatNumber(n, prefs.digits));
  const top = Math.max(0.0001, ...data.map((d) => d.value));
  const maxIndex = data.findIndex((d) => d.value === top);
  const every = Math.max(1, Math.ceil(data.length / 10));
  return (
    <div>
      <div className="flex items-end gap-[2px] border-b border-chart-grid" style={{ height }}>
        {data.map((d, i) => (
          <Tooltip key={d.key} content={`${d.label}: ${fmt(d.value)}${d.hint ? ` — ${d.hint}` : ""}`}>
            <div className="group relative flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end hover:bg-hover/60">
              {i === maxIndex && d.value > 0 ? <span className="mb-1 text-[11px] tabular text-fg-2">{fmt(d.value)}</span> : null}
              <span className="w-full max-w-[18px] rounded-t-[4px] bg-chart-1" style={{ height: `${(d.value / top) * (height - 22)}px`, minHeight: d.value > 0 ? 2 : 0 }} />
            </div>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px]">
        {data.map((d, i) => (
          <span key={d.key} className="min-w-0 flex-1 truncate text-center text-[10px] text-fg-3">
            {i % every === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
