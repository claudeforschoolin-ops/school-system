"use client";
/**
 * رسم خطي لسلسلة زمنية أو أكثر (محور واحد دائماً): خطوط ٢px بوصلات مدوّرة، شبكة أفقية رفيعة صلبة،
 * خط تتبّع رأسي يلتقط أقرب شهر مع تلميح واحد يعرض كل السلاسل (القيمة أولاً ثم الاسم)،
 * وتسمية مباشرة عند آخر نقطة فقط. الزمن يسير من اليمين إلى اليسار (اتجاه القراءة العربية).
 * السلسلة المتوقعة تُرسم منقطة لأنها إسقاط لا بيانات فعلية.
 */
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface LineSeries {
  key: string;
  label: string;
  color: "chart-1" | "chart-2" | "muted";
  values: Array<number | null>;
  /** إسقاط/توقع: خط منقط */
  dashed?: boolean;
}

const STROKE: Record<LineSeries["color"], string> = { "chart-1": "var(--chart-1)", "chart-2": "var(--chart-2)", muted: "var(--text-disabled)" };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * exp;
}

export function Lines({ labels, series, format, height = 220, yMin }: { labels: string[]; series: LineSeries[]; format: (n: number) => string; height?: number; yMin?: number }) {
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 640;
  const H = height;
  const padTop = 12;
  const padBottom = 26;
  const padStart = 100; // مساحة تسميات المحور (يمين في العرض العربي)
  const padEnd = 100; // مساحة التسمية المباشرة عند آخر نقطة (يسار)
  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const lo = yMin ?? Math.min(0, ...all);
  const hi = niceMax(Math.max(lo + 1, ...all));
  const n = Math.max(labels.length, 1);
  const step = n > 1 ? (W - padStart - padEnd) / (n - 1) : 0;
  // RTL: النقطة الأولى عند اليمين
  const x = (i: number) => W - padStart - i * step;
  const y = (v: number) => padTop + (1 - (v - lo) / (hi - lo)) * (H - padTop - padBottom);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => lo + t * (hi - lo));
  const every = Math.max(1, Math.ceil(n / 8));

  const path = (values: Array<number | null>) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const onMove = (e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round((W - padStart - px) / (step || 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  const lastIndex = (vals: Array<number | null>) => {
    for (let i = vals.length - 1; i >= 0; i--) if (vals[i] !== null) return i;
    return -1;
  };

  return (
    <div ref={box} className="relative select-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full overflow-visible" role="img" aria-labelledby={`${uid}-t`}>
        <title id={`${uid}-t`}>{series.map((s) => s.label).join("، ")}</title>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padEnd - 8} x2={W - padStart + 6} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            {/* في السياق العربي: «end» = الحافة اليسرى، فيمتد النص يميناً خارج منطقة الرسم */}
            <text x={W - padStart + 12} y={y(t) + 4} fontSize={11} textAnchor="end" fill="var(--text-muted)">
              {format(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % every === 0 || i === n - 1 ? (
            <text key={i} x={x(i)} y={H - 6} fontSize={11} textAnchor="middle" fill="var(--text-muted)">
              {l}
            </text>
          ) : null,
        )}
        {hover !== null ? <line x1={x(hover)} x2={x(hover)} y1={padTop} y2={H - padBottom} stroke="var(--border-strong)" strokeWidth={1} /> : null}
        {series.map((s) => (
          <path key={s.key} d={path(s.values)} fill="none" stroke={STROKE[s.color]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "5 5" : undefined} />
        ))}
        {series.map((s) => {
          const li = lastIndex(s.values);
          if (li < 0) return null;
          const v = s.values[li]!;
          return (
            <g key={s.key}>
              <circle cx={x(li)} cy={y(v)} r={4} fill={STROKE[s.color]} stroke="var(--bg-card)" strokeWidth={2} />
              <text x={x(li) - 8} y={y(v) + 4} fontSize={11} textAnchor="start" fill="var(--text-secondary)">
                {format(v)}
              </text>
            </g>
          );
        })}
        {hover !== null
          ? series.map((s) => {
              const v = s.values[hover];
              return v === null || v === undefined ? null : <circle key={s.key} cx={x(hover)} cy={y(v)} r={4} fill={STROKE[s.color]} stroke="var(--bg-card)" strokeWidth={2} />;
            })
          : null}
      </svg>
      {hover !== null ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[150px] rounded-md bg-card px-3 py-2 text-[12px] shadow-popover"
          style={{ [x(hover) > W / 2 ? "right" : "left"]: `${Math.min(70, Math.max(0, ((x(hover) > W / 2 ? W - x(hover) : x(hover)) / W) * 100 + 2))}%` }}
        >
          <p className="mb-1 text-fg-3">{labels[hover]}</p>
          {series.map((s) => (
            <p key={s.key} className="flex items-center gap-2">
              <span className={cn("inline-block h-0.5 w-3 rounded")} style={{ background: STROKE[s.color] }} />
              <b className="tabular text-fg">{s.values[hover] === null || s.values[hover] === undefined ? "—" : format(s.values[hover]!)}</b>
              <span className="text-fg-3">{s.label}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** مفتاح الرسم الخطي (مفتاح خطي لا مربع) */
export function LineLegend({ series }: { series: Array<Pick<LineSeries, "key" | "label" | "color" | "dashed">> }) {
  return (
    <ul className="mb-2 flex flex-wrap gap-4 text-[12px] text-fg-2" aria-label="مفتاح الرسم">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <svg width="16" height="4" aria-hidden>
            <line x1="0" x2="16" y1="2" y2="2" stroke={STROKE[s.color]} strokeWidth={2} strokeDasharray={s.dashed ? "4 3" : undefined} />
          </svg>
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** خط اتجاه صغير لبطاقة المؤشر: ١٢ نقطة بلون محايد والنقطة الأخيرة بلون التمييز */
export function Sparkline({ values, className }: { values: Array<number | null>; className?: string }) {
  const known = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (known.length < 3) return null;
  const W = 96;
  const H = 24;
  const lo = Math.min(...known.map((p) => p[1]));
  const hi = Math.max(...known.map((p) => p[1]));
  const n = values.length;
  const x = (i: number) => W - 2 - (i / Math.max(1, n - 1)) * (W - 4);
  const y = (v: number) => 2 + (1 - (hi === lo ? 0.5 : (v - lo) / (hi - lo))) * (H - 4);
  const d = known.map(([i, v], k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const [li, lv] = known[known.length - 1]!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={className} aria-hidden>
      <path d={d} fill="none" stroke="var(--text-disabled)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(li)} cy={y(lv)} r={2.5} fill="var(--chart-1)" />
    </svg>
  );
}
