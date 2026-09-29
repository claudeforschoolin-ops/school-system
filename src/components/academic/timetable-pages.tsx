"use client";
/**
 * جداول الحصص: العرض حسب الفصل/المعلم/القاعة/الطالب، التوليد الآلي، النقل بالسحب مع تلوين الخانات المتاحة،
 * صينية الحصص غير المسكّنة، التثبيت، حصص الانتظار (البديل)، وتوقيت الحصص والقيود.
 */
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { CalendarClock, ChevronLeft, ChevronRight, Lock, LockOpen, Plus, Printer, Sparkles, Trash2, UserCheck, UserX, Wand2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SUBSTITUTION_STATUS, WEEK_DAYS } from "@/lib/students";
import { formatDate, toISODate } from "@/lib/dates";
import { applyDigits, formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { shiftDay } from "@/components/attendance/roll-call";
import { shortName } from "./assignments-page";
import { TIMETABLE_TABS, academicNav, tagStyle } from "./common";

type Kind = "section" | "teacher" | "room" | "student";
const KIND_LABELS: Record<Kind, string> = { section: "فصل", teacher: "معلم", room: "قاعة", student: "طالب" };

function useGridParams(meta: RouterOutputs["timetable"]["meta"] | undefined) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const fallbackKind: Kind = meta?.me ? "teacher" : meta?.children.length && !meta.sections.length ? "student" : "section";
  const kind = (params.get("view") as Kind | null) ?? fallbackKind;
  const fallbackId = kind === "teacher" ? (meta?.me ?? meta?.teachers[0]?.id) : kind === "room" ? meta?.rooms[0]?.id : kind === "student" ? meta?.children[0]?.id : meta?.sections[0]?.id;
  const id = params.get("id") ?? fallbackId ?? null;
  return { kind, id, go: (k: Kind, i?: string | null) => router.replace(`${pathname}?view=${k}${i ? `&id=${i}` : ""}`, { scroll: false }) };
}

export function TimetableHome() {
  const prefs = usePrefs();
  const meta = trpc.timetable.meta.useQuery();
  const m = meta.data;
  const { kind, id, go } = useGridParams(m);
  const grid = trpc.timetable.grid.useQuery({ kind, id: id! }, { enabled: Boolean(id) });
  const [generating, setGenerating] = useState<string | null>(null);
  const today = toISODate(new Date(), "Asia/Riyadh");
  const myDay = trpc.timetable.myDay.useQuery({ date: today }, { enabled: Boolean(m?.me) });
  const kinds: Kind[] = [
    ...(m?.sections.length ? (["section"] as Kind[]) : []),
    ...(m?.teachers.length || m?.me ? (["teacher"] as Kind[]) : []),
    ...(m?.rooms.length ? (["room"] as Kind[]) : []),
    ...(m?.children.length ? (["student"] as Kind[]) : []),
  ];
  const entities =
    kind === "section"
      ? (m?.sections ?? []).map((s) => ({ value: s.id, label: s.label }))
      : kind === "teacher"
        ? (m?.teachers.length ? m.teachers : m?.me ? [{ id: m.me, name: "جدولي" }] : []).map((t) => ({ value: t.id, label: t.name }))
        : kind === "room"
          ? (m?.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))
          : (m?.children ?? []).map((c) => ({ value: c.id, label: c.fullName }))
  ;
  const editableBranches = m?.branches.filter((b) => b.canEdit) ?? [];
  return (
    <ModuleShell
      nav={academicNav("timetable")}
      tabs={editableBranches.length ? TIMETABLE_TABS : TIMETABLE_TABS.slice(0, 2)}
      wide
      actions={
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
            طباعة
          </Button>
          {editableBranches.length ? (
            <Button size="sm" variant="primary" icon={<Wand2 className="size-3.5" />} onClick={() => setGenerating(grid.data?.branchId && editableBranches.some((b) => b.id === grid.data!.branchId) ? grid.data.branchId : editableBranches[0]!.id)}>
              توليد الجدول
            </Button>
          ) : null}
        </div>
      }
    >
      {meta.error ? <EmptyState illustration="lock" title="لا يمكن عرض الجداول" description={meta.error.message} /> : null}
      {myDay.data?.covering.length ? (
        <p className="no-print mb-4 rounded-md bg-navy-50 px-3.5 py-2.5 text-[13px] text-navy-700 dark:bg-hover dark:text-fg-2">
          لديك اليوم {formatNumber(myDay.data.covering.length, prefs.digits)} حصة انتظار:{" "}
          {myDay.data.covering.map((c) => `الحصة ${formatNumber(c.period, prefs.digits)} — ${c.sectionLabel} (${c.subject})`).join("، ")}
        </p>
      ) : null}
      {m ? (
        <div className="no-print mb-4 flex flex-wrap items-center gap-2">
          {kinds.length > 1 ? <Segmented value={kind} onChange={(k) => go(k)} options={kinds.map((k) => ({ value: k, label: KIND_LABELS[k] }))} /> : null}
          {entities.length ? (
            <div className="w-64">
              <Select value={id ?? undefined} onChange={(v) => go(kind, v)} options={entities} />
            </div>
          ) : null}
        </div>
      ) : null}
      {!m || grid.isLoading ? <SkeletonLines lines={10} /> : null}
      {grid.error ? <EmptyState illustration="lock" title="لا يمكن عرض هذا الجدول" description={grid.error.message} /> : null}
      {m && !id ? <EmptyState title="لا توجد جداول ضمن صلاحيتك" description="تظهر هنا جداول فصولك أو جدولك الشخصي عند إسناد المواد." /> : null}
      {grid.data ? <TimetableGrid data={grid.data} kind={kind} /> : null}
      {generating && m ? <GenerateDialog branches={editableBranches} initial={generating} onClose={() => setGenerating(null)} /> : null}
    </ModuleShell>
  );
}

type GridData = RouterOutputs["timetable"]["grid"];
type Slot = GridData["slots"][number];

function TimetableGrid({ data, kind }: { data: GridData; kind: Kind }) {
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const editable = data.canEdit && kind === "section";
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const [active, setActive] = useState<{ slot?: Slot; tray?: GridData["tray"][number] } | null>(null);
  const feasible = trpc.timetable.feasible.useQuery({ slotId: active?.slot?.id ?? "" }, { enabled: Boolean(active?.slot) });
  const refresh = () => {
    void utils.timetable.grid.invalidate();
  };
  const onError = (e: { message: string }) => toast.error(e.message);
  const move = trpc.timetable.move.useMutation({ onSuccess: (r) => (refresh(), r.warnings.length && toast.error(r.warnings[0]!)), onError });
  const place = trpc.timetable.place.useMutation({ onSuccess: (r) => (refresh(), r.warnings.length && toast.error(r.warnings[0]!)), onError });
  const lock = trpc.timetable.lock.useMutation({ onSuccess: refresh, onError });
  const remove = trpc.timetable.remove.useMutation({ onSuccess: refresh, onError });
  const at = (day: number, period: number) => data.slots.filter((s) => s.day === day && s.period === period);
  const cellState = (day: number, period: number) => {
    if (!active) return null;
    if (active.slot) {
      const c = feasible.data?.find((x) => x.day === day && x.period === period);
      if (!c) return null;
      return c.ok ? (c.soft ? "soft" : "ok") : "bad";
    }
    return at(day, period).length ? "bad" : "ok";
  };
  const onDragStart = (e: DragStartEvent) => {
    const [type, key] = String(e.active.id).split(":");
    if (type === "slot") setActive({ slot: data.slots.find((s) => s.id === key) });
    else setActive({ tray: data.tray.find((t) => t.subjectId === key) });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const drag = active;
    setActive(null);
    if (!e.over || !drag) return;
    const [day, period] = String(e.over.id).split("|").map(Number) as [number, number];
    if (drag.slot) {
      if (drag.slot.day === day && drag.slot.period === period) return;
      move.mutate({ slotId: drag.slot.id, day, period });
    } else if (drag.tray && data.sectionId) {
      place.mutate({ sectionId: data.sectionId, subjectId: drag.tray.subjectId, day, period });
    }
  };
  const perDay = data.periods.length;
  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[18px] font-semibold">{data.title}</h2>
        <p className="text-[13px] text-fg-3">
          {formatNumber(data.weeklyPeriods, prefs.digits)} حصة أسبوعياً
          {editable ? " · اسحب الحصة لنقلها أو لتبديلها، والخانات الملونة هي المتاحة دون تعارض" : ""}
        </p>
      </div>
      {editable && data.tray.length ? (
        <section className="no-print mb-3 rounded-lg bg-warning-50 p-3">
          <p className="mb-2 text-[13px] font-medium text-warning-700">حصص لم تُسكّن بعد — اسحبها إلى خانة فارغة:</p>
          <div className="flex flex-wrap gap-2">
            {data.tray.map((t) => (
              <TrayChip key={t.subjectId} item={t} />
            ))}
          </div>
        </section>
      ) : null}
      <div className="overflow-x-auto rounded-lg bg-card shadow-card print:shadow-none">
        <table className="w-full min-w-[880px] table-fixed border-separate border-spacing-0 text-[12px]">
          <thead>
            <tr>
              <th className="w-24 px-2 py-2 text-start text-[12px] font-medium text-fg-3 shadow-[inset_0_-1px_0_var(--border)]">اليوم</th>
              {data.periods.map((p) => (
                <th key={p.index} className="px-2 py-2 text-center font-medium shadow-[inset_0_-1px_0_var(--border)]">
                  <span className="block text-[13px] text-fg">الحصة {formatNumber(p.index, prefs.digits)}</span>
                  <span className="block text-[11px] font-normal text-fg-3 tabular" dir="ltr">
                    {applyDigits(p.start, prefs.digits)} – {applyDigits(p.end, prefs.digits)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.days.map((day) => (
              <tr key={day}>
                <th className="px-2 py-1.5 text-start text-[13px] font-medium shadow-[inset_0_-1px_0_var(--border)]">{WEEK_DAYS[day]}</th>
                {Array.from({ length: perDay }, (_, i) => i + 1).map((period) => (
                  <Cell key={period} day={day} period={period} state={cellState(day, period)} droppable={editable}>
                    {at(day, period).map((s) => (
                      <SlotCard
                        key={s.id}
                        slot={s}
                        kind={kind}
                        draggable={editable && !s.locked}
                        editable={data.canEdit}
                        onLock={() => lock.mutate({ slotId: s.id })}
                        onRemove={() => remove.mutate({ slotId: s.id })}
                        conflict={at(day, period).length > 1}
                      />
                    ))}
                  </Cell>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <DragOverlay dropAnimation={null}>
        {active?.slot ? <div className="rounded-md px-2 py-1.5 text-[12px] font-medium shadow-lg" style={tagStyle(active.slot.color)}>{active.slot.subject}</div> : null}
        {active?.tray ? <div className="rounded-md px-2 py-1.5 text-[12px] font-medium shadow-lg" style={tagStyle(active.tray.color)}>{active.tray.subject}</div> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Cell({ day, period, state, droppable, children }: { day: number; period: number; state: "ok" | "soft" | "bad" | null; droppable: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `${day}|${period}`, disabled: !droppable });
  return (
    <td
      ref={setNodeRef}
      className={cn(
        "h-16 p-1 align-top shadow-[inset_0_-1px_0_var(--border),inset_-1px_0_0_var(--border)] transition-colors",
        state === "ok" && "bg-teal-50",
        state === "soft" && "bg-gold-50",
        state === "bad" && "bg-danger-50/60",
        isOver && state !== "bad" && "bg-teal-100",
      )}
    >
      {children}
    </td>
  );
}

function SlotCard({ slot, kind, draggable, editable, onLock, onRemove, conflict }: { slot: Slot; kind: Kind; draggable: boolean; editable: boolean; onLock: () => void; onRemove: () => void; conflict: boolean }) {
  const prefs = usePrefs();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `slot:${slot.id}`, disabled: !draggable });
  const secondary = kind === "section" || kind === "student" ? shortName(slot.teacher) : slot.sectionLabel;
  const body = (
    <div
      ref={setNodeRef}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      className={cn("relative h-full rounded-md px-1.5 py-1 leading-tight", draggable && "cursor-grab active:cursor-grabbing", isDragging && "opacity-40", conflict && "ring-2 ring-danger-700")}
      style={tagStyle(slot.color)}
    >
      <span className="block truncate text-[12px] font-semibold">{slot.subject}</span>
      <span className="block truncate text-[11px] opacity-80">{secondary}</span>
      {slot.room ? <span className="block truncate text-[10px] opacity-70">{applyDigits(slot.room, prefs.digits)}</span> : null}
      {slot.locked ? <Lock className="absolute end-1 top-1 size-3 opacity-70" aria-label="مثبّتة" /> : null}
    </div>
  );
  if (!editable) return body;
  return (
    <Menu>
      <MenuTrigger asChild>{body}</MenuTrigger>
      <MenuContent className="w-52">
        <MenuLabel>
          {slot.subject} — {slot.sectionLabel}
        </MenuLabel>
        <MenuItem icon={slot.locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />} onSelect={onLock}>
          {slot.locked ? "إلغاء التثبيت" : "تثبيت (لا يغيّرها المولّد)"}
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger icon={<Trash2 className="size-3.5" />} onSelect={onRemove}>
          إزالة من الجدول
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function TrayChip({ item }: { item: GridData["tray"][number] }) {
  const prefs = usePrefs();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `tray:${item.subjectId}` });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} className={cn("cursor-grab rounded-md px-2 py-1 text-[12px] font-medium", isDragging && "opacity-40")} style={tagStyle(item.color)}>
      {item.subject} · {shortName(item.teacher)} <span className="opacity-70">×{formatNumber(item.missing, prefs.digits)}</span>
    </div>
  );
}

function GenerateDialog({ branches, initial, onClose }: { branches: Array<{ id: string; name: string }>; initial: string; onClose: () => void }) {
  const prefs = usePrefs();
  const [branchId, setBranchId] = useState(initial);
  const utils = trpc.useUtils();
  const gen = trpc.timetable.generate.useMutation({ onSuccess: () => void utils.timetable.invalidate(), onError: (e) => toast.error(e.message) });
  const r = gen.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="توليد الجدول آلياً" description="يُعاد توزيع كل الحصص غير المثبّتة في الفرع وفق الإسناد والقيود." width={600}>
        {!r ? (
          <>
            {branches.length > 1 ? (
              <Field label="الفرع">
                <Select value={branchId} onChange={setBranchId} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
              </Field>
            ) : null}
            <ul className="mt-3 space-y-1.5 text-[13px] text-fg-2">
              <li>• لا تعارض للمعلم أو الفصل أو القاعات الخاصة (مختبر، حاسب، صالة) في الخانة نفسها.</li>
              <li>• المواد الثقيلة في الحصص الأولى، وتوزيع حصص المادة على أيام مختلفة.</li>
              <li>• احترام يوم الراحة المفضل للمعلم، والحد الأقصى للحصص المتتالية.</li>
              <li>• الحصص المثبّتة يدوياً تبقى في أماكنها.</li>
            </ul>
          </>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-md bg-hover p-3 text-center">
                <b className="block text-[22px] tabular">{formatNumber(r.placed, prefs.digits)}</b>
                <span className="text-[12px] text-fg-3">حصة سُكّنت من {formatNumber(r.total, prefs.digits)}</span>
              </div>
              <div className="rounded-md bg-hover p-3 text-center">
                <b className="block text-[22px] tabular">{formatNumber(r.freeDayViolations, prefs.digits)}</b>
                <span className="text-[12px] text-fg-3">مخالفة ليوم الراحة</span>
              </div>
              <div className="rounded-md bg-hover p-3 text-center">
                <b className="block text-[22px] tabular">{formatNumber(r.ms / 1000, prefs.digits, { maximumFractionDigits: 1 })}</b>
                <span className="text-[12px] text-fg-3">ثانية</span>
              </div>
            </div>
            {r.unplaced.length ? (
              <div className="rounded-md bg-warning-50 p-3 text-[13px] text-warning-700">
                <p className="mb-1 font-medium">حصص تعذّر تسكينها (تظهر في صينية الفصل للتسكين اليدوي):</p>
                <ul className="space-y-0.5">
                  {r.unplaced.map((u, i) => (
                    <li key={i}>
                      {u.section} — {u.subject} ({u.teacher}): {formatNumber(u.missing, prefs.digits)} — {u.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-md bg-success-50 px-3 py-2 text-[13px] text-success-800">سُكّنت كل الحصص دون أي تعارض.</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>{r ? "إغلاق" : "إلغاء"}</Button>
          {!r ? (
            <Button variant="primary" icon={<Sparkles className="size-3.5" />} loading={gen.isPending} onClick={() => gen.mutate({ branchId })}>
              توليد
            </Button>
          ) : (
            <Button icon={<Sparkles className="size-3.5" />} loading={gen.isPending} onClick={() => gen.mutate({ branchId })}>
              توليد بديل
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// حصص الانتظار
// ---------------------------------------------------------------------

export function SubstitutionsPage() {
  const prefs = usePrefs();
  const { tenant } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = toISODate(new Date(), tenant.timezone);
  const date = params.get("date") ?? today;
  const setDate = (d: string) => router.replace(`${pathname}?date=${d}`, { scroll: false });
  const q = trpc.timetable.substitutions.useQuery({ date });
  const meta = trpc.timetable.meta.useQuery();
  const [recording, setRecording] = useState(false);
  const data = q.data;
  const canEdit = data?.branches.some((b) => b.canEdit) ?? false;
  const groups = useMemo(() => {
    const m = new Map<string, RouterOutputs["timetable"]["substitutions"]["rows"]>();
    for (const r of data?.rows ?? []) m.set(r.absentTeacherId, [...(m.get(r.absentTeacherId) ?? []), r]);
    return [...m.entries()];
  }, [data]);
  const assigned = data?.rows.filter((r) => r.status === "ASSIGNED").length ?? 0;
  const periodTime = (branchId: string, period: number) => data?.bells.find((b) => b.branchId === branchId)?.bell.periods.find((p) => p.index === period);
  return (
    <ModuleShell nav={academicNav("timetable")} tabs={canEdit ? TIMETABLE_TABS : TIMETABLE_TABS.slice(0, 2)} wide actions={canEdit ? <Button size="sm" variant="primary" icon={<UserX className="size-3.5" />} onClick={() => setRecording(true)}>تسجيل غياب معلم</Button> : undefined}>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Button size="icon" variant="ghost" onClick={() => setDate(shiftDay(date, -1))} aria-label="اليوم السابق">
          <ChevronRight className="size-4" />
        </Button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 rounded-md bg-card px-2 text-[13px] shadow-[0_0_0_1px_var(--border)]" aria-label="التاريخ" />
        <Button size="icon" variant="ghost" onClick={() => setDate(shiftDay(date, 1))} aria-label="اليوم التالي">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-[14px] text-fg-2">{formatDate(date, { digits: prefs.digits, calendar: "both", style: "full" })}</span>
      </div>
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="معلمون غائبون" value={data ? groups.length : undefined} icon={<UserX className="size-4" />} />
        <StatCard label="حصص انتظار" value={data ? data.rows.length : undefined} icon={<CalendarClock className="size-4" />} />
        <StatCard label="أُسند لها بديل" value={data ? assigned : undefined} icon={<UserCheck className="size-4" />} tone="success" />
        <StatCard label="بلا بديل" value={data ? data.rows.length - assigned : undefined} icon={<UserX className="size-4" />} tone={data && data.rows.length - assigned ? "danger" : undefined} />
      </section>
      {q.isLoading ? <SkeletonLines lines={8} /> : null}
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض حصص الانتظار" description={q.error.message} /> : null}
      {data && !data.rows.length ? (
        <EmptyState illustration="calendar" title="لا توجد حصص انتظار في هذا اليوم" description="عند غياب معلم سجّل غيابه لتظهر حصصه هنا مع اقتراح البدلاء المتفرغين." action={canEdit ? <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setRecording(true)}>تسجيل غياب معلم</Button> : undefined} />
      ) : null}
      <div className="space-y-4">
        {groups.map(([teacherId, rows]) => (
          <section key={teacherId} className="rounded-lg bg-card shadow-card">
            <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h2 className="text-[15px] font-semibold">{rows[0]!.absentTeacher}</h2>
              {rows[0]!.note ? <span className="text-[12px] text-fg-3">— {rows[0]!.note}</span> : null}
              <span className="flex-1" />
              <Link href={`/academic/timetable?view=teacher&id=${teacherId}`} className="text-[12px] text-fg-3 hover:text-fg">
                جدوله
              </Link>
            </header>
            <ul className="divide-y divide-line">
              {rows.map((r) => {
                const t = periodTime(r.branchId, r.slot.period);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="w-24 shrink-0">
                      <b className="block">الحصة {formatNumber(r.slot.period, prefs.digits)}</b>
                      {t ? <span className="text-[11px] text-fg-3 tabular" dir="ltr">{applyDigits(t.start, prefs.digits)} – {applyDigits(t.end, prefs.digits)}</span> : null}
                    </span>
                    <span className="rounded px-1.5 py-0.5 text-[12px] font-medium" style={tagStyle(r.slot.color)}>
                      {r.slot.subject}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{r.slot.sectionLabel}</span>
                    <Tag color={SUBSTITUTION_STATUS[r.status as keyof typeof SUBSTITUTION_STATUS]?.color ?? "gray"} size="sm">
                      {r.substituteTeacher ? `البديل: ${shortName(r.substituteTeacher)}` : SUBSTITUTION_STATUS[r.status as keyof typeof SUBSTITUTION_STATUS]?.label}
                    </Tag>
                    {r.canEdit ? <SubstituteMenu id={r.id} hasSubstitute={Boolean(r.substituteTeacherId)} /> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {recording && meta.data ? <AbsenceDialog date={date} teachers={meta.data.teachers} onClose={() => setRecording(false)} /> : null}
    </ModuleShell>
  );
}

function SubstituteMenu({ id, hasSubstitute }: { id: string; hasSubstitute: boolean }) {
  const prefs = usePrefs();
  const [open, setOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const utils = trpc.useUtils();
  const suggestions = trpc.timetable.suggestions.useQuery({ id }, { enabled: open });
  const assign = trpc.timetable.assignSubstitute.useMutation({ onSuccess: () => (toast.success("أُسند البديل وأُشعر"), void utils.timetable.substitutions.invalidate()), onError: (e) => toast.error(e.message) });
  const cancel = trpc.timetable.cancelSubstitution.useMutation({ onSuccess: () => (setCancelling(false), void utils.timetable.substitutions.invalidate()), onError: (e) => toast.error(e.message) });
  return (
    <>
      <Menu open={open} onOpenChange={setOpen}>
        <MenuTrigger asChild>
          <Button size="sm" variant={hasSubstitute ? "ghost" : "secondary"}>
            {hasSubstitute ? "تغيير" : "إسناد بديل"}
          </Button>
        </MenuTrigger>
        <MenuContent className="max-h-80 w-72 overflow-y-auto">
          <MenuLabel>المتفرغون في هذه الحصة (الأنسب أولاً)</MenuLabel>
          {suggestions.isLoading ? <p className="px-2 py-1.5 text-[12px] text-fg-3">جارٍ البحث…</p> : null}
          {suggestions.data && !suggestions.data.length ? <p className="px-2 py-1.5 text-[12px] text-fg-3">لا يوجد معلم متفرغ في هذه الحصة.</p> : null}
          {suggestions.data?.map((s) => (
            <MenuItem key={s.id} onSelect={() => assign.mutate({ id, teacherId: s.id })}>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{shortName(s.name)}</span>
                <span className="block text-[11px] text-fg-3">
                  {[s.qualified ? "مؤهل للمادة" : null, s.knowsSection ? "يدرّس الفصل" : null, `${formatNumber(s.monthCount, prefs.digits)} انتظار هذا الشهر`, `${formatNumber(s.dayLoad, prefs.digits)} حصص اليوم`].filter(Boolean).join(" · ")}
                </span>
              </span>
            </MenuItem>
          ))}
          <MenuSeparator />
          {hasSubstitute ? (
            <MenuItem icon={<UserX className="size-3.5" />} onSelect={() => assign.mutate({ id, teacherId: null })}>
              إلغاء البديل
            </MenuItem>
          ) : null}
          <MenuItem danger icon={<Trash2 className="size-3.5" />} onSelect={() => setCancelling(true)}>
            حذف حصة الانتظار
          </MenuItem>
        </MenuContent>
      </Menu>
      <ConfirmDialog open={cancelling} onOpenChange={setCancelling} title="حذف حصة الانتظار؟" description="استخدمه إن حضر المعلم أو أُلغيت الحصة." danger confirmLabel="حذف" loading={cancel.isPending} onConfirm={() => cancel.mutate({ id })} />
    </>
  );
}

function AbsenceDialog({ date, teachers, onClose }: { date: string; teachers: Array<{ id: string; name: string }>; onClose: () => void }) {
  const prefs = usePrefs();
  const [teacherId, setTeacherId] = useState("");
  const [note, setNote] = useState("");
  const utils = trpc.useUtils();
  const record = trpc.timetable.recordAbsence.useMutation({
    onSuccess: (r) => {
      toast.success(`أُنشئت ${formatNumber(r.created, prefs.digits)} حصة انتظار`);
      void utils.timetable.substitutions.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تسجيل غياب معلم" description={`تُنشأ حصص انتظار لكل حصصه يوم ${formatDate(date, { digits: prefs.digits, style: "full" })}. (حضور الموظفين وإجازاتهم الرسمية ضمن وحدة الموارد البشرية — المرحلة ٤)`} width={480}>
        <div className="space-y-3">
          <Field label="المعلم">
            <Select value={teacherId || undefined} onChange={setTeacherId} options={teachers.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
          <Field label="السبب">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="إجازة مرضية / مهمة رسمية / دورة تدريبية" />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={record.isPending} disabled={!teacherId} onClick={() => record.mutate({ date, teacherId, note: note || null })}>
            تسجيل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// التوقيت والقيود
// ---------------------------------------------------------------------

export function TimetableSettingsPage() {
  const meta = trpc.timetable.meta.useQuery();
  const branches = meta.data?.branches.filter((b) => b.canEdit) ?? [];
  const [branchId, setBranchId] = useState<string | null>(null);
  const branch = branches.find((b) => b.id === branchId) ?? branches[0];
  return (
    <ModuleShell nav={academicNav("timetable")} tabs={TIMETABLE_TABS}>
      {meta.isLoading ? <SkeletonLines lines={8} /> : null}
      {meta.data && !branches.length ? <EmptyState illustration="lock" title="تعديل التوقيت من صلاحية الشؤون الأكاديمية" /> : null}
      {branches.length > 1 ? (
        <div className="mb-4">
          <Segmented value={branch!.id} onChange={setBranchId} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        </div>
      ) : null}
      {branch ? <BellEditor key={branch.id} branchId={branch.id} bell={branch.bell} /> : null}
    </ModuleShell>
  );
}

function BellEditor({ branchId, bell }: { branchId: string; bell: { name: string; days: number[]; periods: Array<{ index: number; start: string; end: string }>; maxConsecutive: number } }) {
  const prefs = usePrefs();
  const [name, setName] = useState(bell.name);
  const [days, setDays] = useState(new Set(bell.days));
  const [periods, setPeriods] = useState(bell.periods.map((p) => ({ start: p.start, end: p.end })));
  const [maxConsecutive, setMax] = useState(bell.maxConsecutive);
  const utils = trpc.useUtils();
  const save = trpc.timetable.saveBell.useMutation({
    onSuccess: (r) => {
      toast.success(r.removedSlots ? `حُفظ التوقيت، وأُزيلت ${formatNumber(r.removedSlots, prefs.digits)} حصة خارج الأيام/الحصص الجديدة` : "حُفظ التوقيت");
      void utils.timetable.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const addPeriod = () => {
    const last = periods[periods.length - 1];
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    const start = last ? toMin(last.end) : 7 * 60;
    setPeriods([...periods, { start: fmt(start), end: fmt(start + 45) }]);
  };
  return (
    <div className="space-y-5">
      <section className="rounded-lg bg-card p-4 shadow-card">
        <h2 className="mb-3 text-[15px] font-semibold">أيام الدراسة</h2>
        <div className="flex flex-wrap gap-3">
          {WEEK_DAYS.map((d, i) => (
            <label key={d} className="flex items-center gap-2 text-[14px]">
              <Checkbox
                checked={days.has(i)}
                onChange={(v) =>
                  setDays((old) => {
                    const next = new Set(old);
                    if (v) next.add(i);
                    else next.delete(i);
                    return next;
                  })
                }
              />
              {d}
            </label>
          ))}
        </div>
      </section>
      <section className="rounded-lg bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">توقيت الحصص</h2>
          <Field label="" className="w-64">
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="اسم الجدول" />
          </Field>
        </div>
        <ul className="space-y-2">
          {periods.map((p, i) => (
            <li key={i} className="flex items-center gap-2 text-[14px]">
              <span className="w-20">الحصة {formatNumber(i + 1, prefs.digits)}</span>
              <Input type="time" className="w-32" value={p.start} onChange={(e) => setPeriods(periods.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} aria-label="البداية" />
              <span className="text-fg-3">—</span>
              <Input type="time" className="w-32" value={p.end} onChange={(e) => setPeriods(periods.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} aria-label="النهاية" />
              {i > 0 && periods[i - 1]!.end < p.start ? <span className="text-[12px] text-fg-3">فسحة قبلها</span> : null}
              <span className="flex-1" />
              {periods.length > 1 ? (
                <Button size="icon-sm" variant="ghost" aria-label="حذف الحصة" onClick={() => setPeriods(periods.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {periods.length < 12 ? (
          <Button className="mt-3" size="sm" icon={<Plus className="size-3.5" />} onClick={addPeriod}>
            حصة
          </Button>
        ) : null}
      </section>
      <section className="rounded-lg bg-card p-4 shadow-card">
        <h2 className="mb-3 text-[15px] font-semibold">قيود المولّد</h2>
        <Field label="أقصى عدد حصص متتالية للمعلم" className="max-w-xs">
          <Input type="number" min={1} max={8} value={maxConsecutive} onChange={(e) => setMax(Number(e.target.value))} />
        </Field>
        <p className="mt-2 text-[13px] text-fg-3">قيود ثابتة: لا تعارض للمعلم أو الفصل أو القاعة الخاصة، والمواد الثقيلة في الحصص الأولى ولا تتكرر يومياً، وتوزيع حصص المادة على الأسبوع، ويوم راحة المعلم (من «تعيين المعلمين»).</p>
      </section>
      <div className="flex justify-end">
        <Button variant="primary" loading={save.isPending} disabled={!days.size} onClick={() => save.mutate({ branchId, name, days: [...days], periods, maxConsecutive })}>
          حفظ التوقيت
        </Button>
      </div>
    </div>
  );
}
