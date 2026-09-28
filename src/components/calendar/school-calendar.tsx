"use client";
/**
 * التقويم المدرسي الموحد (أكاديمي/إداري/اختبارات/اجتماعات/عطل/أنشطة) بالميلادي والهجري.
 */
import { ChevronLeft, ChevronRight, MapPin, Plus, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatTimeRange, hijriDayNumber, monthTitle, toISODate, weekdayNames, zonedTimeToUtc } from "@/lib/dates";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { useApp } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { EVENT_COLORS } from "@/components/shell/sidebar/upcoming";
import { useTabMeta } from "@/components/shell/tabs-bar";

type EventItem = RouterOutputs["calendar"]["list"][number];
type Category = EventItem["category"];

export const CATEGORY_LABELS: Record<Category, string> = {
  ACADEMIC: "أكاديمي",
  ADMINISTRATIVE: "إداري",
  EXAM: "اختبارات",
  MEETING: "اجتماع",
  HOLIDAY: "إجازة رسمية",
  ACTIVITY: "نشاط",
};

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function SchoolCalendar() {
  useTabMeta("التقويم", "lucide:calendar-days");
  const { prefs, can, tenant } = useApp();
  const params = useSearchParams();
  const initial = params.get("date") ?? toISODate(new Date(), tenant.timezone);
  const [cursor, setCursor] = useState({ y: Number(initial.slice(0, 4)), m: Number(initial.slice(5, 7)) - 1 });
  const [editing, setEditing] = useState<EventItem | { date: string } | null>(null);
  const [hiddenCats, setHiddenCats] = useState<Set<Category>>(new Set());

  const first = new Date(Date.UTC(cursor.y, cursor.m, 1, 12));
  const start = addDays(first.toISOString().slice(0, 10), -first.getUTCDay());
  const weeks = Math.ceil((first.getUTCDay() + new Date(Date.UTC(cursor.y, cursor.m + 1, 0)).getUTCDate()) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  const range = { from: new Date(`${days[0]}T00:00:00Z`), to: new Date(`${addDays(days[days.length - 1]!, 1)}T00:00:00Z`) };
  const events = trpc.calendar.list.useQuery(range);
  const today = toISODate(new Date(), tenant.timezone);
  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`;

  const byDay = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const e of events.data ?? []) {
      if (hiddenCats.has(e.category)) continue;
      const s = toISODate(e.startAt, tenant.timezone);
      const en = toISODate(e.endAt, tenant.timezone);
      for (let d = s, i = 0; d <= en && i < 40; d = addDays(d, 1), i++) map.set(d, [...(map.get(d) ?? []), e]);
    }
    return map;
  }, [events.data, hiddenCats, tenant.timezone]);

  const shift = (d: number) => setCursor((c) => ({ y: c.m + d < 0 ? c.y - 1 : c.m + d > 11 ? c.y + 1 : c.y, m: (c.m + d + 12) % 12 }));
  const canCreate = can("events", "create");

  return (
    <>
      <PageTopbar crumbs={[{ title: "التقويم", icon: "lucide:calendar-days" }]} />
      <div className="px-4 pb-20 pt-6 md:px-12">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-[26px] font-bold leading-tight">{monthTitle(cursor.y, cursor.m, "gregory", prefs.digits)}</h1>
            <p className="text-[13px] text-fg-3">{monthTitle(cursor.y, cursor.m, "hijri", prefs.digits)}</p>
          </div>
          <div className="ms-auto flex items-center gap-1">
            <button onClick={() => shift(-1)} className="grid size-8 place-items-center rounded-md text-fg-2 hover:bg-hover" aria-label="الشهر السابق">
              <ChevronRight className="size-4" />
            </button>
            <button onClick={() => setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 })} className="h-8 rounded-md px-3 text-[13px] text-fg-2 hover:bg-hover">
              اليوم
            </button>
            <button onClick={() => shift(1)} className="grid size-8 place-items-center rounded-md text-fg-2 hover:bg-hover" aria-label="الشهر التالي">
              <ChevronLeft className="size-4" />
            </button>
            {canCreate ? (
              <Button variant="primary" size="sm" icon={<Plus className="size-4" />} className="ms-2" onClick={() => setEditing({ date: today })}>
                حدث جديد
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
            <button key={c} onClick={() => setHiddenCats((h) => { const n = new Set(h); if (n.has(c)) n.delete(c); else n.add(c); return n; })} className={cn("rounded-full transition-opacity", hiddenCats.has(c) && "opacity-40")}>
              <Tag color={EVENT_COLORS[c]}>{CATEGORY_LABELS[c]}</Tag>
            </button>
          ))}
        </div>
        <div className="mt-4 overflow-hidden rounded-lg border border-line">
          <div className="grid grid-cols-7 border-b border-line bg-sidebar">
            {weekdayNames("long").map((d) => (
              <div key={d} className="px-2 py-2 text-[12px] font-medium text-fg-3">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, i) => {
              const list = byDay.get(day) ?? [];
              return (
                <div key={day} className={cn("group/day min-h-[120px] border-b border-line p-1.5", (i + 1) % 7 !== 0 && "border-e", !day.startsWith(monthPrefix) && "bg-sidebar/60")}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cn("grid h-6 min-w-6 place-items-center rounded-full px-1 text-[12px] tabular", day === today ? "bg-danger-700 font-bold text-white" : day.startsWith(monthPrefix) ? "text-fg-2" : "text-fg-4")}>
                      {new Intl.NumberFormat(`ar-SA-u-nu-${prefs.digits}`).format(Number(day.slice(8)))}
                    </span>
                    <span className="flex items-center gap-1">
                      {canCreate ? (
                        <button onClick={() => setEditing({ date: day })} className="grid size-5 place-items-center rounded text-fg-3 opacity-0 hover:bg-hover group-hover/day:opacity-100" aria-label="إضافة حدث">
                          <Plus className="size-3.5" />
                        </button>
                      ) : null}
                      <span className="text-[10px] text-fg-4 tabular">{hijriDayNumber(day, prefs.digits)}</span>
                    </span>
                  </div>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setEditing(e)}
                        className="flex w-full items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-start text-[12px] font-medium transition-colors"
                        style={{ background: `var(--tag-${EVENT_COLORS[e.category]}-bg)`, color: `var(--tag-${EVENT_COLORS[e.category]}-fg)` }}
                      >
                        <span className="truncate">{e.title}</span>
                        {!e.allDay && toISODate(e.startAt, tenant.timezone) === day ? <span className="ms-auto shrink-0 opacity-70 tabular">{formatTimeRange(new Date(e.startAt), new Date(e.endAt), prefs.digits)}</span> : null}
                      </button>
                    ))}
                    {list.length > 3 ? <p className="px-1 text-[11px] text-fg-3">+{new Intl.NumberFormat("ar-SA").format(list.length - 3)} أخرى</p> : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <EventDialog value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function localInput(date: Date | string, tz: string): string {
  const d = new Date(date);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
}

function EventDialog({ value, onClose }: { value: EventItem | { date: string } | null; onClose: () => void }) {
  const { can, tenant, prefs } = useApp();
  const utils = trpc.useUtils();
  const existing = value && "id" in value ? value : null;
  const [form, setForm] = useState<{ title: string; category: Category; start: string; end: string; allDay: boolean; location: string; description: string } | null>(null);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = value ? ("id" in value ? value.id : value.date) : null;
  if (key !== lastKey) {
    setLastKey(key);
    if (value) {
      setForm(
        existing
          ? { title: existing.title, category: existing.category, start: localInput(existing.startAt, tenant.timezone), end: localInput(existing.endAt, tenant.timezone), allDay: existing.allDay, location: existing.location ?? "", description: existing.description ?? "" }
          : { title: "", category: "MEETING", start: `${(value as { date: string }).date}T09:00`, end: `${(value as { date: string }).date}T10:00`, allDay: false, location: "", description: "" },
      );
    }
  }
  const done = async () => {
    await Promise.all([utils.calendar.invalidate(), utils.workspace.upcoming.invalidate()]);
    onClose();
  };
  const create = trpc.calendar.create.useMutation({ onSuccess: done });
  const update = trpc.calendar.update.useMutation({ onSuccess: done });
  const remove = trpc.calendar.delete.useMutation({ onSuccess: done });
  const editable = existing ? can("events", "update") : can("events", "create");
  const toDate = (v: string) => zonedTimeToUtc(v, tenant.timezone);

  if (!form) return null;
  const payload = { title: form.title, category: form.category, startAt: toDate(form.start), endAt: toDate(form.end), allDay: form.allDay, location: form.location || null, description: form.description || null };
  return (
    <Dialog open={Boolean(value)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={existing ? (editable ? "تعديل الحدث" : existing.title) : "حدث جديد"} width={520}>
        {editable ? (
          <div className="grid gap-3 px-5 pb-4 sm:grid-cols-2">
            <Field label="العنوان" className="sm:col-span-2">
              <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
            </Field>
            <Field label="التصنيف">
              <Select value={form.category} onChange={(v) => setForm({ ...form, category: v as Category })} options={(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
            </Field>
            <label className="flex items-end justify-between gap-2 pb-1.5 text-[13px]">
              <span className="text-fg-2">طوال اليوم</span>
              <Switch checked={form.allDay} onChange={(v) => setForm({ ...form, allDay: v })} />
            </label>
            <Field label="البداية">
              <Input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </Field>
            <Field label="النهاية">
              <Input type="datetime-local" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
            </Field>
            <Field label="المكان" className="sm:col-span-2">
              <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label="الوصف" className="sm:col-span-2">
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
          </div>
        ) : existing ? (
          <div className="space-y-2 px-5 pb-5 text-[14px]">
            <Tag color={EVENT_COLORS[existing.category]}>{CATEGORY_LABELS[existing.category]}</Tag>
            <p className="text-fg-2">{formatDate(existing.startAt, { digits: prefs.digits, calendar: "both", withTime: !existing.allDay })}</p>
            {existing.location ? (
              <p className="flex items-center gap-1.5 text-fg-2">
                <MapPin className="size-4" /> {existing.location}
              </p>
            ) : null}
            {existing.description ? <p className="text-fg-2">{existing.description}</p> : null}
          </div>
        ) : null}
        {editable ? (
          <DialogFooter>
            {existing && can("events", "delete") ? (
              <Button variant="ghost" className="me-auto text-danger-700" icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={() => remove.mutate({ id: existing.id })}>
                حذف
              </Button>
            ) : null}
            <Button variant="ghost" onClick={onClose}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              disabled={!form.title.trim()}
              loading={create.isPending || update.isPending}
              onClick={() => (existing ? update.mutate({ id: existing.id, ...payload }) : create.mutate(payload))}
            >
              حفظ
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
