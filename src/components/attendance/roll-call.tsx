"use client";
/**
 * شاشة التحضير: قائمة طلاب الفصل مع خمسة أزرار للحالة (حاضر/غائب/متأخر/مستأذن/بعذر) تتلوّن
 * بانتقال ناعم، وزر «تحضير الكل حاضر» ثم تعديل الاستثناءات، وشريط حفظ ثابت بعدد التغييرات.
 */
import { AnimatePresence, motion } from "motion/react";
import { CalendarOff, CheckCheck, ChevronLeft, ChevronRight, HeartPulse, Lock, Save } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { ATTENDANCE_ORDER, ATTENDANCE_STATUS, LEAVE_KIND, type AttendanceStatusKey } from "@/lib/students";
import { formatDate, toISODate } from "@/lib/dates";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { NumberTicker } from "@/components/ui/number-ticker";
import { PageSkeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { useApp } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";

type Roll = RouterOutputs["attendance"]["rollCall"];
type Entry = { status: AttendanceStatusKey | null; reason: string; minutesLate: string };

export function shiftDay(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function RollCallScreen({ sectionId }: { sectionId: string }) {
  const { tenant, prefs } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = toISODate(new Date(), tenant.timezone);
  const date = params.get("date") ?? today;
  const period = Number(params.get("period") ?? 0);
  const q = trpc.attendance.rollCall.useQuery({ sectionId, date, period });
  useTabMeta(q.data ? `تحضير ${q.data.section.label}` : "التحضير", "lucide:user-check");
  const go = (d: string, p = period) => router.replace(`${pathname}?date=${d}${p ? `&period=${p}` : ""}`, { scroll: false });

  return (
    <>
      <PageTopbar crumbs={[{ title: "شؤون الطلاب", icon: "lucide:users" }, { title: "الحضور والغياب", icon: "lucide:user-check", href: `/attendance?date=${date}` }, { title: q.data?.section.label ?? "…" }]} />
      <div className="mx-auto w-full max-w-[920px] px-6 pb-32 pt-8 md:px-12">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[13px] text-fg-3">{q.data?.section.branchName}</p>
            <h1 className="mt-1 text-[30px] font-bold leading-tight">{q.data?.section.label ?? "التحضير"}</h1>
            <p className="mt-1 text-[14px] text-fg-2">{formatDate(date, { digits: prefs.digits, calendar: "both", style: "full" })}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => go(shiftDay(date, -1))} aria-label="اليوم السابق">
              <ChevronRight className="size-4" />
            </Button>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && go(e.target.value)} className="h-8 rounded-md bg-card px-2 text-[13px] shadow-[0_0_0_1px_var(--border)]" aria-label="التاريخ" />
            <Button size="icon" variant="ghost" onClick={() => go(shiftDay(date, 1))} disabled={date >= today} aria-label="اليوم التالي">
              <ChevronLeft className="size-4" />
            </Button>
            {date !== today ? (
              <Button size="sm" variant="ghost" onClick={() => go(today)}>
                اليوم
              </Button>
            ) : null}
          </div>
        </header>
        {q.data?.mode === "PERIOD" ? (
          <div className="mt-4 flex flex-wrap gap-1">
            {Array.from({ length: q.data.day.periods }, (_, i) => i + 1).map((p) => (
              <button key={p} onClick={() => go(date, p)} className={cn("h-7 rounded-md px-2.5 text-[13px]", (period || 1) === p ? "bg-navy-700 text-on-primary" : "bg-hover text-fg-2 hover:bg-active")}>
                الحصة {formatNumber(p, prefs.digits)}
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-6">
          {q.error ? (
            <EmptyState illustration="lock" title="لا يمكن فتح التحضير" description={q.error.message} />
          ) : !q.data ? (
            <PageSkeleton />
          ) : !q.data.day.isSchoolDay ? (
            <EmptyState illustration="calendar" title={q.data.day.holiday ? `إجازة: ${q.data.day.holiday}` : "ليس يوم دراسة"} description="لا يُحضَّر في هذا اليوم." />
          ) : q.data.students.length === 0 ? (
            <EmptyState illustration="blank" title="لا يوجد طلاب في هذا الفصل" />
          ) : (
            <RollCallForm key={`${date}:${period}`} data={q.data} />
          )}
        </div>
      </div>
    </>
  );
}

function RollCallForm({ data }: { data: Roll }) {
  const { prefs } = useApp();
  const utils = trpc.useUtils();
  const initial = useMemo(() => {
    const m: Record<string, Entry> = {};
    for (const s of data.students) {
      // الإجازة المعتمدة تقترح الحالة مسبقاً
      const suggested: AttendanceStatusKey | null = s.status ?? (s.leave ? (s.leave.kind === "EARLY_DISMISSAL" ? "PERMISSION" : "EXCUSED") : null);
      m[s.id] = { status: suggested, reason: s.reason ?? (s.leave && !s.status ? s.leave.reason : ""), minutesLate: s.minutesLate ? String(s.minutesLate) : "" };
    }
    return m;
  }, [data]);
  const [entries, setEntries] = useState(initial);
  const save = trpc.attendance.save.useMutation({
    onSuccess: async (r) => {
      await Promise.all([utils.attendance.rollCall.invalidate(), utils.attendance.sections.invalidate(), utils.attendance.day.invalidate()]);
      toast.success(`حُفظ التحضير${r.notified ? ` — أُبلغ ${formatNumber(r.notified, prefs.digits)} من أولياء الأمور بالغياب` : ""}${r.thresholdAlerts ? ` — ${formatNumber(r.thresholdAlerts, prefs.digits)} تنبيه تجاوز حد الغياب` : ""}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const editable = data.canEdit;
  const counts = useMemo(() => {
    const c: Record<AttendanceStatusKey, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, PERMISSION: 0, EXCUSED: 0 };
    for (const e of Object.values(entries)) if (e.status) c[e.status] += 1;
    return c;
  }, [entries]);
  const unmarked = data.students.filter((s) => !entries[s.id]?.status).length;
  const changed = data.students.filter((s) => {
    const a = entries[s.id]!;
    return a.status !== s.status || (a.reason || null) !== (s.reason ?? null) || (a.minutesLate ? Number(a.minutesLate) : null) !== (s.minutesLate ?? null);
  }).length;
  const set = (id: string, patch: Partial<Entry>) => setEntries((e) => ({ ...e, [id]: { ...e[id]!, ...patch } }));
  const markAllPresent = () =>
    setEntries((e) => {
      const next = { ...e };
      for (const s of data.students) if (!next[s.id]!.status) next[s.id] = { ...next[s.id]!, status: "PRESENT" };
      return next;
    });
  const submit = () => {
    if (unmarked) return toast.error(`بقي ${formatNumber(unmarked, prefs.digits)} طالباً دون حالة`);
    save.mutate({
      sectionId: data.section.id,
      date: data.date,
      period: data.period || undefined,
      entries: data.students.map((s) => {
        const e = entries[s.id]!;
        return { studentId: s.id, status: e.status!, reason: e.reason || null, minutesLate: e.minutesLate ? Number(e.minutesLate) : null };
      }),
    });
  };

  return (
    <>
      {data.locked ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-hover px-3.5 py-2.5 text-[13px] text-fg-2">
          <Lock className="size-4 shrink-0" />
          انتهت مدة تعديل التحضير لهذا اليوم. التعديل يحتاج اعتماد الوكيل.
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {editable ? (
          <Button size="sm" icon={<CheckCheck className="size-4" />} onClick={markAllPresent} disabled={!unmarked}>
            تحضير الكل حاضر
          </Button>
        ) : null}
        <div className="ms-auto flex flex-wrap items-center gap-1.5">
          {ATTENDANCE_ORDER.map((k) => (
            <span key={k} className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12px]" style={{ background: `var(--tag-${ATTENDANCE_STATUS[k].color}-bg)`, color: `var(--tag-${ATTENDANCE_STATUS[k].color}-fg)` }}>
              {ATTENDANCE_STATUS[k].label}
              <NumberTicker value={counts[k]} digits={prefs.digits} className="font-semibold" />
            </span>
          ))}
        </div>
      </div>
      <ul className="overflow-hidden rounded-lg bg-card shadow-card">
        {data.students.map((s, i) => {
          const e = entries[s.id]!;
          return (
            <li key={s.id} className={cn("px-3 py-2.5 sm:px-4", i > 0 && "border-t border-line")}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="w-6 shrink-0 text-center text-[12px] tabular text-fg-3">{formatNumber(i + 1, prefs.digits)}</span>
                <Avatar name={s.fullName} src={s.photoUrl} size={30} />
                <div className="min-w-[8rem] flex-1">
                  <Link href={`/students/${s.id}`} className="flex items-center gap-1.5 truncate text-[14px] font-medium hover:underline">
                    {s.fullName}
                    {s.criticalHealth ? (
                      <Tooltip content={s.healthNote || "حالة صحية حرجة"}>
                        <HeartPulse className="size-4 shrink-0 text-danger-700" aria-label="حالة صحية حرجة" />
                      </Tooltip>
                    ) : null}
                  </Link>
                  {s.leave ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-fg-3">
                      <CalendarOff className="size-3" />
                      {LEAVE_KIND[s.leave.kind as keyof typeof LEAVE_KIND].label} معتمد
                    </span>
                  ) : null}
                </div>
                <StatusPicker value={e.status} onChange={(v) => set(s.id, { status: v })} disabled={!editable} />
              </div>
              <AnimatePresence initial={false}>
                {e.status && e.status !== "PRESENT" ? (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.16 }} className="overflow-hidden">
                    <div className="mt-2 flex flex-wrap gap-2 ps-[72px]">
                      {e.status === "LATE" ? (
                        <input
                          type="number"
                          min={1}
                          max={240}
                          value={e.minutesLate}
                          disabled={!editable}
                          onChange={(ev) => set(s.id, { minutesLate: ev.target.value })}
                          placeholder="دقائق التأخر"
                          className="h-7 w-[120px] rounded-md bg-hover px-2 text-[13px] outline-none"
                        />
                      ) : null}
                      <input value={e.reason} disabled={!editable} onChange={(ev) => set(s.id, { reason: ev.target.value })} placeholder="السبب (اختياري)" className="h-7 min-w-[200px] flex-1 rounded-md bg-hover px-2 text-[13px] outline-none" />
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
      {editable ? (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-4">
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-3 rounded-xl bg-elevated px-4 py-2.5 shadow-popover">
            <span className="text-[13px] text-fg-2">
              {unmarked ? `بقي ${formatNumber(unmarked, prefs.digits)} دون حالة` : changed ? `${formatNumber(changed, prefs.digits)} تغيير غير محفوظ` : data.taken ? "التحضير محفوظ" : "جاهز للحفظ"}
            </span>
            <Button variant="primary" size="sm" icon={<Save className="size-3.5" />} loading={save.isPending} disabled={!changed && data.taken} onClick={submit}>
              حفظ التحضير
            </Button>
          </motion.div>
        </div>
      ) : null}
    </>
  );
}

/** خمسة أزرار للحالة مع مؤشر ينزلق بين الاختيارات */
function StatusPicker({ value, onChange, disabled }: { value: AttendanceStatusKey | null; onChange: (v: AttendanceStatusKey) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label="حالة الحضور" className="flex shrink-0 gap-0.5 rounded-lg bg-hover p-0.5 max-sm:w-full max-sm:justify-between">
      {ATTENDANCE_ORDER.map((k) => {
        const selected = value === k;
        const meta = ATTENDANCE_STATUS[k];
        return (
          <button
            key={k}
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(k)}
            className={cn("relative h-7 rounded-md px-2 text-[12px] font-medium transition-colors duration-150 disabled:cursor-default", selected ? "" : "text-fg-3 hover:text-fg-2")}
            style={selected ? { color: `var(--tag-${meta.color}-fg)` } : undefined}
          >
            {selected ? <motion.span layoutId={`pill-${id}`} transition={{ type: "spring", stiffness: 500, damping: 38 }} className="absolute inset-0 rounded-md" style={{ background: `var(--tag-${meta.color}-bg)` }} /> : null}
            <span className="relative">{meta.label}</span>
          </button>
        );
      })}
    </div>
  );
}
