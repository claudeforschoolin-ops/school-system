"use client";
/**
 * أعمدة رأسية مع علامة مستهدف لكل عمود (التحصيل مقابل المستهدف):
 * عمود رفيع ≤١٦px بطرف علوي مدوّر ٤px وقاعدة مربعة، علامة المستهدف خط أفقي بلون النص الثانوي،
 * خطوط شبكة خافتة، تلميح عند المرور، والقيم في العرض الجدولي البديل (ChartCard).
 */
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

export interface TargetDatum {
  key: string;
  label: string;
  value: number;
  target: number;
  /** عمود مستقبلي (لم يحن بعد) يُعرض باهتاً */
  future?: boolean;
}

export function TargetColumns({ data, format, height = 180, valueLabel = "المحصّل", targetLabel = "المستهدف" }: { data: TargetDatum[]; format: (n: number) => string; height?: number; valueLabel?: string; targetLabel?: string }) {
  const top = Math.max(1, ...data.map((d) => Math.max(d.value, d.target)));
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-4 text-[12px] text-fg-2" aria-label="مفتاح الرسم">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-chart-1" />
          {valueLabel}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-fg-2" />
          {targetLabel}
        </li>
      </ul>
      <div className="relative" style={{ height }}>
        {[0.25, 0.5, 0.75, 1].map((g) => (
          <span key={g} className="absolute inset-x-0 border-t border-chart-grid" style={{ bottom: `${g * 100}%` }} aria-hidden />
        ))}
        <span className="absolute inset-x-0 bottom-0 border-t border-line" aria-hidden />
        <div className="absolute inset-0 flex items-end justify-around gap-1">
          {data.map((d) => (
            <Tooltip key={d.key} content={`${d.label}: ${valueLabel} ${format(d.value)} · ${targetLabel} ${format(d.target)}`}>
              <div className="group relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center rounded-sm hover:bg-hover/70">
                <span className={cn("w-3 rounded-t-[4px] bg-chart-1 transition-[height] duration-300 sm:w-4", d.future && "opacity-40")} style={{ height: `${(d.value / top) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }} />
                {d.target > 0 ? <span className="absolute h-0.5 w-6 rounded bg-fg-2" style={{ bottom: `calc(${(d.target / top) * 100}% - 1px)` }} aria-hidden /> : null}
              </div>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-around gap-1">
        {data.map((d) => (
          <span key={d.key} className="min-w-0 flex-1 truncate text-center text-[11px] text-fg-3">
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
