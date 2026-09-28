"use client";
/**
 * الخط الزمني (Gantt): الزمن يتقدم من اليمين إلى اليسار (RTL)، أعمدة أيام/أسابيع/أشهر،
 * سحب الشريط يزيحه، وسحب طرفيه يغير البداية/النهاية، وخط عمودي لليوم الحالي.
 */
import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { asDateValue, rawValue } from "@/lib/database/engine";
import type { PropertyDef, ViewConfig } from "@/lib/database/types";
import { toISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { Segmented } from "@/components/ui/segmented";
import { usePrefs } from "@/components/shell/app-context";
import type { DatabaseApi, Row } from "../use-database";

const DAY_WIDTH = { day: 44, week: 18, month: 6 } as const;
const ROW_H = 38;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diff(a: string, b: string): number {
  return Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86400000);
}

interface Span {
  row: Row;
  start: string;
  end: string;
}

export function TimelineView({ api, rows, config, onConfig, onOpen }: { api: DatabaseApi; rows: Row[]; config: ViewConfig; visibleProps: PropertyDef[]; onConfig: (p: Partial<ViewConfig>) => void; onOpen: (id: string) => void }) {
  const prefs = usePrefs();
  const scale = config.timelineScale ?? "week";
  const dayW = DAY_WIDTH[scale];
  const startProp = api.properties.find((p) => p.id === config.dateProperty) ?? api.properties.find((p) => p.type === "DATE");
  const endProp = config.endDateProperty ? api.properties.find((p) => p.id === config.endDateProperty) : undefined;
  const today = toISODate(new Date());
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; mode: "move" | "start" | "end"; x0: number; delta: number } | null>(null);

  const spans: Span[] = useMemo(() => {
    if (!startProp) return [];
    return rows
      .map((row) => {
        const s = asDateValue(rawValue(row, startProp));
        if (!s) return null;
        const e = endProp ? asDateValue(rawValue(row, endProp)) : null;
        const start = s.start.slice(0, 10);
        const end = (endProp ? e?.start : s.end)?.slice(0, 10) ?? start;
        return { row, start, end: end < start ? start : end };
      })
      .filter((x): x is Span => Boolean(x));
  }, [rows, startProp, endProp]);
  const undated = rows.filter((r) => !spans.some((s) => s.row.id === r.id));

  const range = useMemo(() => {
    const starts = spans.map((s) => s.start).concat(today);
    const ends = spans.map((s) => s.end).concat(today);
    const min = starts.sort()[0]!;
    const max = ends.sort()[ends.length - 1]!;
    const pad = scale === "day" ? 7 : scale === "week" ? 14 : 45;
    return { from: addDays(min, -pad), to: addDays(max, pad) };
  }, [spans, today, scale]);
  const totalDays = diff(range.to, range.from) + 1;

  // تمرير تلقائي إلى اليوم الحالي
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const x = diff(today, range.from) * dayW;
    el.scrollLeft = -(x - el.clientWidth / 3);
  }, [range.from, dayW, today]);

  if (!startProp) {
    return <EmptyState illustration="calendar" title="لا توجد خاصية تاريخ" description="أضف خاصية تاريخ (ويُفضّل خاصيتين للبداية والنهاية) لاستخدام الخط الزمني." />;
  }

  const headerUnits = (() => {
    const units: Array<{ key: string; label: string; days: number }> = [];
    let cursor = range.from;
    while (cursor <= range.to) {
      const d = new Date(`${cursor}T12:00:00Z`);
      if (scale === "month") {
        const endOfMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
        const end = endOfMonth > range.to ? range.to : endOfMonth;
        units.push({ key: cursor, label: new Intl.DateTimeFormat(`ar-SA-u-ca-gregory-nu-${prefs.digits}`, { month: "long", year: "numeric", timeZone: "UTC" }).format(d), days: diff(end, cursor) + 1 });
        cursor = addDays(end, 1);
      } else if (scale === "week") {
        const end = addDays(cursor, 6 - d.getUTCDay());
        const e2 = end > range.to ? range.to : end;
        units.push({ key: cursor, label: new Intl.DateTimeFormat(`ar-SA-u-nu-${prefs.digits}`, { day: "numeric", month: "short", timeZone: "UTC" }).format(d), days: diff(e2, cursor) + 1 });
        cursor = addDays(e2, 1);
      } else {
        units.push({ key: cursor, label: new Intl.DateTimeFormat(`ar-SA-u-nu-${prefs.digits}`, { day: "numeric", weekday: "narrow", timeZone: "UTC" }).format(d), days: 1 });
        cursor = addDays(cursor, 1);
      }
    }
    return units;
  })();

  const startDrag = (e: React.PointerEvent, span: Span, mode: "move" | "start" | "end") => {
    if (!api.canEdit || startProp.type !== "DATE") return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: span.row.id, mode, x0: e.clientX, delta: 0 });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    // في RTL السحب يساراً = أيام لاحقة
    setDrag({ ...drag, delta: Math.round((drag.x0 - e.clientX) / dayW) });
  };
  const endDrag = (span: Span) => {
    if (!drag) return;
    const { delta, mode } = drag;
    setDrag(null);
    if (delta === 0) return onOpen(span.row.id);
    let start = span.start;
    let end = span.end;
    if (mode === "move") {
      start = addDays(start, delta);
      end = addDays(end, delta);
    } else if (mode === "start") start = addDays(start, delta) > end ? end : addDays(start, delta);
    else end = addDays(end, delta) < start ? start : addDays(end, delta);
    if (endProp && endProp.type === "DATE") {
      void api.updateRow(span.row.id, { values: { [startProp.id]: { start }, [endProp.id]: { start: end } } });
    } else {
      void api.updateRow(span.row.id, { values: { [startProp.id]: end !== start ? { start, end } : { start } } });
    }
  };

  const width = totalDays * dayW;
  const todayX = diff(today, range.from) * dayW;

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <Segmented
          value={scale}
          onChange={(s) => onConfig({ timelineScale: s })}
          options={[
            { value: "day", label: "أيام" },
            { value: "week", label: "أسابيع" },
            { value: "month", label: "أشهر" },
          ]}
        />
        <span className="text-[12px] text-fg-3">اسحب الشريط لتحريكه، أو طرفيه لتغيير المدة</span>
      </div>
      <div className="flex overflow-hidden rounded-lg border border-line">
        {/* عمود العناوين */}
        <div className="w-[240px] shrink-0 border-e border-line bg-app">
          <div className="flex h-9 items-center border-b border-line bg-sidebar px-3 text-[12px] font-medium text-fg-3">{api.bundle?.database.titleLabel ?? "الاسم"}</div>
          {spans.map((s) => (
            <button key={s.row.id} onClick={() => onOpen(s.row.id)} className="flex w-full items-center gap-1.5 border-b border-line/60 px-3 text-start text-[13px] hover:bg-hover" style={{ height: ROW_H }}>
              {s.row.icon ? <PageIcon icon={s.row.icon} size={14} /> : null}
              <span className="truncate">{s.row.title || "بدون عنوان"}</span>
            </button>
          ))}
        </div>
        {/* الشبكة الزمنية */}
        <div ref={scrollRef} className="thin-scroll min-w-0 flex-1 overflow-x-auto">
          <div style={{ width }} className="relative">
            <div className="flex h-9 border-b border-line bg-sidebar">
              {headerUnits.map((u) => (
                <div key={u.key} className="shrink-0 truncate border-e border-line/60 px-1.5 pt-2 text-[11px] text-fg-3" style={{ width: u.days * dayW }}>
                  {u.label}
                </div>
              ))}
            </div>
            <div className="pointer-events-none absolute bottom-0 top-9 z-[1] w-px bg-danger-700" style={{ insetInlineStart: todayX + dayW / 2 }}>
              <span className="absolute -top-1 -start-[3px] size-[7px] rounded-full bg-danger-700" />
            </div>
            {spans.map((s) => {
              const isDragging = drag?.id === s.row.id;
              let start = s.start;
              let end = s.end;
              if (isDragging) {
                if (drag.mode === "move") {
                  start = addDays(start, drag.delta);
                  end = addDays(end, drag.delta);
                } else if (drag.mode === "start") start = addDays(start, drag.delta) > end ? end : addDays(start, drag.delta);
                else end = addDays(end, drag.delta) < start ? start : addDays(end, drag.delta);
              }
              const x = diff(start, range.from) * dayW;
              const w = Math.max(dayW, (diff(end, start) + 1) * dayW);
              return (
                <div key={s.row.id} className="relative border-b border-line/60" style={{ height: ROW_H }}>
                  <div
                    onPointerDown={(e) => startDrag(e, s, "move")}
                    onPointerMove={onMove}
                    onPointerUp={() => (drag ? endDrag(s) : onOpen(s.row.id))}
                    className={cn(
                      "group/bar absolute top-[7px] flex h-6 cursor-grab items-center overflow-hidden rounded-md bg-navy-100 px-2 text-[12px] font-medium text-navy-700 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--navy-600)_25%,transparent)] transition-shadow active:cursor-grabbing",
                      isDragging && "shadow-drag",
                    )}
                    style={{ insetInlineStart: x, width: w }}
                  >
                    <span
                      onPointerDown={(e) => startDrag(e, s, "start")}
                      className="absolute inset-y-0 start-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:bg-navy-600/20 group-hover/bar:opacity-100"
                    />
                    <span className="truncate">{s.row.title || "بدون عنوان"}</span>
                    <span onPointerDown={(e) => startDrag(e, s, "end")} className="absolute inset-y-0 end-0 w-2 cursor-ew-resize opacity-0 group-hover/bar:bg-navy-600/20 group-hover/bar:opacity-100" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {undated.length ? (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px] font-medium text-fg-3">بلا تاريخ ({new Intl.NumberFormat("ar-SA").format(undated.length)})</p>
          <div className="flex flex-wrap gap-1.5">
            {undated.map((r) => (
              <button key={r.id} onClick={() => onOpen(r.id)} className="flex h-7 items-center gap-1 rounded-md bg-card px-2 text-[13px] shadow-card hover:shadow-card-hover">
                {r.title || "بدون عنوان"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {api.canEdit ? (
        <button onClick={() => void api.createRow({ values: { [startProp.id]: { start: today } } })} className="mt-2 flex h-8 items-center gap-1.5 px-1 text-[13px] text-fg-3 hover:text-fg-2">
          <Plus className="size-4" /> جديد
        </button>
      ) : null}
    </div>
  );
}
