"use client";
/**
 * عرض التقويم: شبكة شهرية (الأسبوع يبدأ الأحد) مع رقم اليوم الهجري الصغير،
 * سحب السجل بين الأيام يغيّر تاريخه (مع الحفاظ على المدة)، و«+» لإضافة سجل في يوم.
 */
import { DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { asDateValue, rawValue } from "@/lib/database/engine";
import type { PropertyDef, ViewConfig } from "@/lib/database/types";
import { hijriDayNumber, monthTitle, toISODate, weekdayNames } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { usePrefs } from "@/components/shell/app-context";
import { ValueDisplay } from "../property-display";
import type { DatabaseApi, Row } from "../use-database";

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDays(a: string, b: string): number {
  return Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86400000);
}

export function CalendarView({ api, rows, config, visibleProps, onConfig, onOpen }: { api: DatabaseApi; rows: Row[]; config: ViewConfig; visibleProps: PropertyDef[]; onConfig: (p: Partial<ViewConfig>) => void; onOpen: (id: string) => void }) {
  const prefs = usePrefs();
  const dateProp = api.properties.find((p) => p.id === config.dateProperty) ?? api.properties.find((p) => p.type === "DATE");
  const today = toISODate(new Date());
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    if (!dateProp) return map;
    for (const row of rows) {
      const raw = rawValue(row, dateProp);
      const d = dateProp.type === "DATE" ? asDateValue(raw) : raw ? { start: toISODate(raw as string) } : null;
      if (!d) continue;
      const start = d.start.slice(0, 10);
      const end = d.end ? d.end.slice(0, 10) : start;
      for (let day = start, i = 0; day <= end && i < 62; day = addDays(day, 1), i++) {
        const list = map.get(day) ?? [];
        list.push(row);
        map.set(day, list);
      }
    }
    return map;
  }, [rows, dateProp]);

  if (!dateProp) {
    return (
      <EmptyState
        illustration="calendar"
        title="لا توجد خاصية تاريخ"
        description="أضف خاصية من نوع تاريخ لعرض السجلات على التقويم."
        action={
          api.properties.some((p) => p.type === "CREATED_TIME") ? (
            <Select className="w-[200px]" value={undefined} onChange={(v) => onConfig({ dateProperty: v })} options={api.properties.filter((p) => p.type === "CREATED_TIME" || p.type === "UPDATED_TIME").map((p) => ({ value: p.id, label: p.name }))} placeholder="العرض حسب…" />
          ) : undefined
        }
      />
    );
  }

  const first = new Date(Date.UTC(cursor.y, cursor.m, 1, 12));
  const offset = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate();
  const start = addDays(first.toISOString().slice(0, 10), -offset);
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`;
  const shift = (d: number) => setCursor((c) => ({ y: c.m + d < 0 ? c.y - 1 : c.m + d > 11 ? c.y + 1 : c.y, m: (c.m + d + 12) % 12 }));
  const editableDate = dateProp.type === "DATE" && api.canEdit;
  const chipProps = visibleProps.filter((p) => p.id !== dateProp.id).slice(0, 2);

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || !editableDate) return;
    const [rowId, fromDay] = String(e.active.id).split("|");
    const toDay = String(e.over.id);
    const row = rows.find((r) => r.id === rowId);
    if (!row || !fromDay || fromDay === toDay) return;
    const current = asDateValue(rawValue(row, dateProp));
    if (!current) return;
    const delta = diffDays(toDay, fromDay);
    const time = current.start.length > 10 ? current.start.slice(10) : "";
    const next = { start: addDays(current.start.slice(0, 10), delta) + time, ...(current.end ? { end: addDays(current.end.slice(0, 10), delta) } : {}) };
    void api.updateRow(row.id, { values: { [dateProp.id]: next } });
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-[16px] font-medium">{monthTitle(cursor.y, cursor.m, "gregory", prefs.digits)}</h3>
        <span className="text-[13px] text-fg-3">{monthTitle(cursor.y, cursor.m, "hijri", prefs.digits)}</span>
        <div className="ms-auto flex items-center gap-0.5">
          <button onClick={() => shift(-1)} className="grid size-7 place-items-center rounded-md text-fg-2 hover:bg-hover" aria-label="الشهر السابق">
            <ChevronRight className="size-4" />
          </button>
          <button onClick={() => setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })} className="h-7 rounded-md px-2 text-[13px] text-fg-2 hover:bg-hover">
            اليوم
          </button>
          <button onClick={() => shift(1)} className="grid size-7 place-items-center rounded-md text-fg-2 hover:bg-hover" aria-label="الشهر التالي">
            <ChevronLeft className="size-4" />
          </button>
        </div>
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="overflow-hidden rounded-lg border border-line">
          <div className="grid grid-cols-7 border-b border-line bg-sidebar">
            {weekdayNames("short").map((d) => (
              <div key={d} className="px-2 py-1.5 text-[12px] font-medium text-fg-3">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => (
              <DayCell
                key={day}
                day={day}
                inMonth={day.startsWith(monthPrefix)}
                isToday={day === today}
                rows={byDay.get(day) ?? []}
                api={api}
                chipProps={chipProps}
                onOpen={onOpen}
                lastInRow={(i + 1) % 7 === 0}
                onAdd={editableDate ? () => void api.createRow({ values: { [dateProp.id]: { start: day } } }) : undefined}
                draggable={editableDate}
              />
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  );
}

function DayCell({
  day,
  inMonth,
  isToday,
  rows,
  api,
  chipProps,
  onOpen,
  onAdd,
  lastInRow,
  draggable,
}: {
  day: string;
  inMonth: boolean;
  isToday: boolean;
  rows: Row[];
  api: DatabaseApi;
  chipProps: PropertyDef[];
  onOpen: (id: string) => void;
  onAdd?: () => void;
  lastInRow: boolean;
  draggable: boolean;
}) {
  const prefs = usePrefs();
  const { setNodeRef, isOver } = useDroppable({ id: day });
  return (
    <div
      ref={setNodeRef}
      className={cn("group/day relative min-h-[118px] border-b border-line p-1.5 transition-colors duration-[120ms]", !lastInRow && "border-e", !inMonth && "bg-sidebar/60", isOver && "bg-teal-50")}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12px] tabular", isToday ? "bg-danger-700 font-bold text-white" : inMonth ? "text-fg-2" : "text-fg-4")}>
          {new Intl.NumberFormat(`ar-SA-u-nu-${prefs.digits}`).format(Number(day.slice(8)))}
        </span>
        <span className="flex items-center gap-1">
          {onAdd ? (
            <button onClick={onAdd} className="grid size-5 place-items-center rounded text-fg-3 opacity-0 hover:bg-hover group-hover/day:opacity-100" aria-label="إضافة">
              <Plus className="size-3.5" />
            </button>
          ) : null}
          <span className="text-[10px] text-fg-4 tabular">{hijriDayNumber(day, prefs.digits)}</span>
        </span>
      </div>
      <div className="space-y-1">
        {rows.slice(0, 4).map((row) => (
          <EventChip key={row.id} row={row} day={day} api={api} chipProps={chipProps} onOpen={onOpen} draggable={draggable} />
        ))}
        {rows.length > 4 ? <p className="px-1 text-[11px] text-fg-3">+{new Intl.NumberFormat("ar-SA").format(rows.length - 4)} أخرى</p> : null}
      </div>
    </div>
  );
}

function EventChip({ row, day, api, chipProps, onOpen, draggable }: { row: Row; day: string; api: DatabaseApi; chipProps: PropertyDef[]; onOpen: (id: string) => void; draggable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `${row.id}|${day}`, disabled: !draggable });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(row.id)}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0) rotate(2deg) scale(1.02)` : undefined }}
      className={cn(
        "cursor-pointer rounded-md bg-card px-1.5 py-1 text-[12px] shadow-card transition-shadow duration-[140ms] hover:shadow-card-hover",
        isDragging && "z-20 opacity-90 shadow-drag",
      )}
    >
      <p className="flex items-center gap-1 truncate font-medium text-fg">
        {row.icon ? <PageIcon icon={row.icon} size={12} /> : null}
        <span className="truncate">{row.title || "بدون عنوان"}</span>
      </p>
      {chipProps.map((p) => (
        <div key={p.id} className="mt-0.5 truncate text-[11px] text-fg-3 empty:hidden">
          <ValueDisplay row={row} prop={p} ctx={api.ctx} users={api.users} compact />
        </div>
      ))}
    </div>
  );
}
