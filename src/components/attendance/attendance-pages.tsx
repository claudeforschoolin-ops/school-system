"use client";
/**
 * صفحات وحدة الحضور: الرئيسية (فصول اليوم وحالة تحضيرها)، غياب اليوم، السجل الشهري، التقارير، الإعدادات.
 */
import { CheckCircle2, ChevronLeft, ChevronRight, CircleDashed, Clock, HeartPulse, Percent, Phone, UserX } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { MODULE_NAV } from "@/lib/modules-nav";
import { ATTENDANCE_ORDER, ATTENDANCE_STATUS, type AttendanceStatusKey } from "@/lib/students";
import { formatDate, toISODate } from "@/lib/dates";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ChartCard, HBars } from "@/components/charts/bars";
import { Columns } from "@/components/charts/columns";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { TemplatesEditor } from "@/components/modules/templates-editor";
import { SettingsCard } from "@/components/settings/settings-shell";
import { shiftDay } from "./roll-call";

export const ATTENDANCE_TABS = [
  { href: "/attendance", label: "التحضير", exact: true },
  { href: "/attendance/today", label: "غياب اليوم" },
  { href: "/attendance/monthly", label: "السجل الشهري" },
  { href: "/attendance/reports", label: "التقارير" },
  { href: "/attendance/settings", label: "الإعدادات" },
];
const nav = () => MODULE_NAV.find((m) => m.key === "attendance")!;

function useDateParam() {
  const { tenant } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const today = toISODate(new Date(), tenant.timezone);
  const date = params.get("date") ?? today;
  return { date, today, setDate: (d: string) => router.replace(`${pathname}?date=${d}`, { scroll: false }) };
}

function DateBar({ date, today, setDate }: ReturnType<typeof useDateParam>) {
  const prefs = usePrefs();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <Button size="icon" variant="ghost" onClick={() => setDate(shiftDay(date, -1))} aria-label="اليوم السابق">
        <ChevronRight className="size-4" />
      </Button>
      <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-8 rounded-md bg-card px-2 text-[13px] shadow-[0_0_0_1px_var(--border)]" aria-label="التاريخ" />
      <Button size="icon" variant="ghost" onClick={() => setDate(shiftDay(date, 1))} disabled={date >= today} aria-label="اليوم التالي">
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-[14px] text-fg-2">{formatDate(date, { digits: prefs.digits, calendar: "both", style: "full" })}</span>
      {date !== today ? (
        <Button size="sm" variant="ghost" onClick={() => setDate(today)}>
          اليوم
        </Button>
      ) : null}
    </div>
  );
}

export function AttendanceHome() {
  const prefs = usePrefs();
  const d = useDateParam();
  const sections = trpc.attendance.sections.useQuery({ date: d.date });
  const list = sections.data ?? [];
  const totals = useMemo(() => {
    const t = { students: 0, recorded: 0, absent: 0, late: 0, taken: 0 };
    for (const s of list) {
      t.students += s.students;
      t.recorded += s.recorded;
      t.absent += s.counts.ABSENT ?? 0;
      t.late += s.counts.LATE ?? 0;
      if (s.recorded > 0) t.taken += 1;
    }
    return t;
  }, [list]);
  const byBranch = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const s of list) m.set(s.branchName, [...(m.get(s.branchName) ?? []), s]);
    return [...m.entries()];
  }, [list]);
  return (
    <ModuleShell nav={nav()} tabs={ATTENDANCE_TABS} wide>
      <DateBar {...d} />
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="فصول حُضّرت" value={sections.data ? totals.taken : undefined} icon={<CheckCircle2 className="size-4" />} hint={sections.data ? `من ${formatNumber(list.length, prefs.digits)} فصلاً` : undefined} tone={sections.data && totals.taken < list.length ? "warning" : "success"} />
        <StatCard label="نسبة الحضور" value={sections.data ? (totals.recorded ? (totals.recorded - totals.absent) / totals.recorded : null) : undefined} format={(n) => formatPercent(n, prefs.digits)} icon={<Percent className="size-4" />} />
        <StatCard label="غائبون" value={sections.data ? totals.absent : undefined} icon={<UserX className="size-4" />} tone={totals.absent ? "danger" : undefined} href={`/attendance/today?date=${d.date}`} />
        <StatCard label="متأخرون" value={sections.data ? totals.late : undefined} icon={<Clock className="size-4" />} href={`/attendance/today?date=${d.date}`} />
      </section>
      {sections.isLoading ? <SkeletonLines lines={8} /> : null}
      {sections.data && !list.length ? <EmptyState illustration="blank" title="لا توجد فصول ضمن صلاحيتك" description="تُسند الفصول للمعلم من «تعيين المعلمين» أو بتعيينه رائداً للفصل." /> : null}
      {byBranch.map(([branch, items]) => (
        <section key={branch} className="mb-6">
          <h2 className="mb-2 text-[13px] font-semibold text-fg-3">{branch}</h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {items.map((s) => {
              const taken = s.recorded > 0;
              return (
                <li key={s.id}>
                  <Link href={`/attendance/${s.id}?date=${d.date}`} className="block rounded-lg bg-card p-3 shadow-card transition-[transform,box-shadow] duration-[140ms] hover:-translate-y-px hover:shadow-card-hover">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14px] font-medium">{s.label}</span>
                      {taken ? <CheckCircle2 className="size-4 shrink-0 text-success-800" aria-label="حُضّر" /> : <CircleDashed className="size-4 shrink-0 text-fg-4" aria-label="لم يُحضّر" />}
                    </div>
                    <p className="mt-1 text-[12px] text-fg-3">
                      {formatNumber(s.students, prefs.digits)} طالباً
                      {taken ? ` · غائب ${formatNumber(s.counts.ABSENT ?? 0, prefs.digits)} · متأخر ${formatNumber(s.counts.LATE ?? 0, prefs.digits)}` : s.canTake ? " · لم يُحضّر بعد" : " · عرض فقط"}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </ModuleShell>
  );
}

export function TodayBoard() {
  const prefs = usePrefs();
  const d = useDateParam();
  const q = trpc.attendance.day.useQuery({ date: d.date });
  const columns = ATTENDANCE_ORDER.filter((k) => k !== "PRESENT");
  return (
    <ModuleShell nav={nav()} tabs={ATTENDANCE_TABS} wide>
      <DateBar {...d} />
      {q.isLoading ? <SkeletonLines lines={8} /> : null}
      {q.data ? (
        <div className="thin-scroll flex gap-3 overflow-x-auto pb-4">
          {columns.map((k) => {
            const items = q.data.filter((r) => r.status === k);
            const meta = ATTENDANCE_STATUS[k];
            return (
              <section key={k} className="w-[272px] shrink-0 rounded-xl p-2" style={{ background: `color-mix(in oklab, var(--tag-${meta.color}-bg) 45%, transparent)` }}>
                <header className="mb-2 flex items-center gap-2 px-1.5 pt-1">
                  <Tag color={meta.color}>{meta.label}</Tag>
                  <span className="text-[12px] text-fg-3 tabular">{formatNumber(items.length, prefs.digits)}</span>
                </header>
                <ul className="space-y-2">
                  {items.map((r) => (
                    <li key={r.id} className="rounded-lg bg-card p-3 shadow-card">
                      <Link href={`/students/${r.student.id}?tab=attendance`} className="flex items-center gap-2">
                        <Avatar name={r.student.fullName} src={r.student.photoUrl} size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1 truncate text-[13px] font-medium">
                            {r.student.fullName}
                            {r.student.criticalHealth ? <HeartPulse className="size-3.5 shrink-0 text-danger-700" /> : null}
                          </span>
                          <span className="block truncate text-[11px] text-fg-3">{r.student.section}</span>
                        </span>
                      </Link>
                      {r.reason || r.minutesLate ? (
                        <p className="mt-2 text-[12px] text-fg-2">
                          {r.minutesLate ? `تأخر ${formatNumber(r.minutesLate, prefs.digits)} دقيقة. ` : ""}
                          {r.reason}
                        </p>
                      ) : null}
                      {r.guardian ? (
                        <a href={`tel:${r.guardian.phone}`} className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-3 hover:text-fg-2">
                          <Phone className="size-3" />
                          {r.guardian.name}
                        </a>
                      ) : null}
                    </li>
                  ))}
                  {!items.length ? <li className="px-1.5 py-3 text-[12px] text-fg-3">لا أحد</li> : null}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
    </ModuleShell>
  );
}

export function MonthlyGrid() {
  const { tenant, prefs } = useApp();
  const sections = trpc.academic.sectionOptions.useQuery();
  const [sectionId, setSectionId] = useState<string>("");
  const [month, setMonth] = useState(() => toISODate(new Date(), tenant.timezone).slice(0, 7));
  const active = sectionId || sections.data?.[0]?.id || "";
  const q = trpc.attendance.sectionMonth.useQuery({ sectionId: active, month }, { enabled: Boolean(active) });
  return (
    <ModuleShell nav={nav()} tabs={ATTENDANCE_TABS} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select size="sm" className="w-[240px]" value={active || undefined} onChange={setSectionId} options={(sections.data ?? []).map((s) => ({ value: s.id, label: `${s.label} — ${s.branchName.split("—")[0]!.trim()}` }))} placeholder="اختر الفصل" />
        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-7 rounded-md bg-card px-2 text-[13px] shadow-[0_0_0_1px_var(--border)]" aria-label="الشهر" />
        <ul className="ms-auto flex flex-wrap gap-3 text-[12px] text-fg-2">
          {ATTENDANCE_ORDER.map((k) => (
            <li key={k} className="flex items-center gap-1">
              <span className="grid size-5 place-items-center rounded text-[11px] font-semibold" style={{ background: `var(--tag-${ATTENDANCE_STATUS[k].color}-bg)`, color: `var(--tag-${ATTENDANCE_STATUS[k].color}-fg)` }}>
                {ATTENDANCE_STATUS[k].short}
              </span>
              {ATTENDANCE_STATUS[k].label}
            </li>
          ))}
        </ul>
      </div>
      {q.isLoading ? <SkeletonLines lines={10} /> : null}
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض السجل" description={q.error.message} compact /> : null}
      {q.data ? (
        <div className="thin-scroll overflow-x-auto rounded-lg shadow-card">
          <table className="w-full border-collapse bg-card text-[12px]">
            <thead className="bg-sidebar">
              <tr>
                <th className="sticky start-0 z-[1] min-w-[180px] bg-sidebar px-3 py-2 text-start font-medium text-fg-3">الطالب</th>
                {q.data.days.map((day) => (
                  <th key={day} className="min-w-[30px] px-0.5 py-2 text-center font-medium text-fg-3 tabular">
                    {formatNumber(Number(day.slice(8)), prefs.digits)}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-medium text-fg-3">غياب</th>
              </tr>
            </thead>
            <tbody>
              {q.data.students.map((s) => (
                <tr key={s.id} className="border-t border-line/60">
                  <td className="sticky start-0 bg-card px-3 py-1.5">
                    <Link href={`/students/${s.id}?tab=attendance`} className="truncate hover:underline">
                      {s.fullName}
                    </Link>
                  </td>
                  {q.data.days.map((day) => {
                    const st = s.days[day] as AttendanceStatusKey | undefined;
                    return (
                      <td key={day} className="px-0.5 py-1 text-center">
                        {st ? (
                          <Tooltip content={`${formatDate(day, { digits: prefs.digits })}: ${ATTENDANCE_STATUS[st].label}`}>
                            <span className="mx-auto grid size-6 place-items-center rounded text-[11px] font-semibold" style={{ background: `var(--tag-${ATTENDANCE_STATUS[st].color}-bg)`, color: `var(--tag-${ATTENDANCE_STATUS[st].color}-fg)` }}>
                              {ATTENDANCE_STATUS[st].short}
                            </span>
                          </Tooltip>
                        ) : (
                          <span className="text-fg-4">·</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center font-semibold tabular">{formatNumber(Object.values(s.days).filter((v) => v === "ABSENT").length, prefs.digits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </ModuleShell>
  );
}

export function AttendanceReports() {
  const { tenant, prefs } = useApp();
  const today = toISODate(new Date(), tenant.timezone);
  const [range, setRange] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const r = trpc.attendance.report.useQuery(range).data;
  const pct = (n: number) => formatPercent(n, prefs.digits, 1);
  return (
    <ModuleShell nav={nav()} tabs={ATTENDANCE_TABS} wide>
      <div className="mb-5 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-fg-3">الفترة من</span>
        <input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} className="h-7 rounded-md bg-card px-2 shadow-[0_0_0_1px_var(--border)]" />
        <span className="text-fg-3">إلى</span>
        <input type="date" value={range.to} min={range.from} max={today} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} className="h-7 rounded-md bg-card px-2 shadow-[0_0_0_1px_var(--border)]" />
      </div>
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="أيام دراسة مسجلة" value={r?.totals.days} icon={<CheckCircle2 className="size-4" />} />
        <StatCard label="نسبة الغياب" value={r ? r.totals.absenceRate : undefined} format={pct} icon={<Percent className="size-4" />} />
        <StatCard label="حالات غياب" value={r?.totals.absent} icon={<UserX className="size-4" />} />
        <StatCard label="حالات تأخر" value={r?.totals.late} icon={<Clock className="size-4" />} />
      </section>
      {!r ? (
        <SkeletonLines lines={10} />
      ) : !r.daily.length ? (
        <EmptyState illustration="calendar" title="لا يوجد تحضير في هذه الفترة" compact />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard className="lg:col-span-2" title="نسبة الغياب اليومية" subtitle="الغائبون من إجمالي من حُضّروا في كل يوم" table={{ columns: ["اليوم", "الغائبون", "المُحضَّرون", "النسبة"], rows: r.daily.map((d) => [formatDate(d.date, { digits: prefs.digits }), d.absent, d.total, pct(d.rate)]) }}>
            <Columns data={r.daily.map((d) => ({ key: d.date, label: formatDate(d.date, { digits: prefs.digits, style: "short" }), value: d.rate, hint: `${formatNumber(d.absent, prefs.digits)} من ${formatNumber(d.total, prefs.digits)}` }))} format={pct} />
          </ChartCard>
          <ChartCard title="نسبة الغياب حسب الفصل" table={{ columns: ["الفصل", "الغياب", "السجلات", "النسبة"], rows: r.bySection.map((s) => [s.label, s.absent, s.total, pct(s.rate)]) }}>
            <HBars labelWidth={170} data={r.bySection.slice(0, 12).map((s) => ({ key: s.id, label: s.label, value: s.rate, hint: `${formatNumber(s.absent, prefs.digits)} غياب` }))} format={pct} />
          </ChartCard>
          <ChartCard title="أكثر الطلاب غياباً" table={{ columns: ["الطالب", "الفصل", "أيام الغياب"], rows: r.topAbsent.map((s) => [s.name, s.section, s.absent]) }}>
            <HBars labelWidth={190} data={r.topAbsent.map((s) => ({ key: s.id, label: s.name, value: s.absent, hint: s.section }))} format={(n) => `${formatNumber(n, prefs.digits)} يوم`} />
          </ChartCard>
        </div>
      )}
    </ModuleShell>
  );
}

interface AttendanceSettingsValues {
  mode: "DAILY" | "PERIOD";
  lockHours: number;
  absenceThreshold: number;
  notifyAbsence: boolean;
  notifyLate: boolean;
}

export function AttendanceSettings() {
  const q = trpc.moduleSettings.get.useQuery({ key: "attendance" });
  return (
    <ModuleShell nav={nav()} tabs={ATTENDANCE_TABS}>
      {q.data ? <SettingsForm initial={q.data.values as AttendanceSettingsValues} canEdit={q.data.canEdit} /> : <SkeletonLines lines={8} />}
      <SettingsCard title="رسائل أولياء الأمور" description="تُرسل عند الغياب والتأخر وعند تجاوز الحد.">
        <TemplatesEditor keys={["absence", "late", "absence_threshold"]} />
      </SettingsCard>
    </ModuleShell>
  );
}

function SettingsForm({ initial, canEdit }: { initial: AttendanceSettingsValues; canEdit: boolean }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState(initial);
  const save = trpc.moduleSettings.update.useMutation({
    onSuccess: async () => {
      await utils.moduleSettings.get.invalidate({ key: "attendance" });
      toast.success("حُفظت إعدادات الحضور");
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="mb-4">
      <SettingsCard title="قواعد التحضير">
        <div className="space-y-4">
          <Field label="طريقة التحضير">
            <Segmented value={v.mode} onChange={(m) => canEdit && setV({ ...v, mode: m })} options={[{ value: "DAILY", label: "يومي" }, { value: "PERIOD", label: "حسب الحصة" }]} />
          </Field>
          <div className="grid max-w-lg grid-cols-2 gap-3">
            <Field label="قفل التعديل بعد (ساعات من نهاية اليوم)">
              <Input type="number" min={1} max={720} value={v.lockHours} disabled={!canEdit} onChange={(e) => setV({ ...v, lockHours: Math.max(1, Number(e.target.value) || 1) })} />
            </Field>
            <Field label="حد الغياب في الفصل الدراسي (أيام)">
              <Input type="number" min={1} max={60} value={v.absenceThreshold} disabled={!canEdit} onChange={(e) => setV({ ...v, absenceThreshold: Math.max(1, Number(e.target.value) || 1) })} />
            </Field>
          </div>
          <label className="flex items-center gap-2.5 text-[14px]">
            <Switch checked={v.notifyAbsence} disabled={!canEdit} onChange={(on) => setV({ ...v, notifyAbsence: on })} />
            إشعار ولي الأمر فور تسجيل الغياب
          </label>
          <label className="flex items-center gap-2.5 text-[14px]">
            <Switch checked={v.notifyLate} disabled={!canEdit} onChange={(on) => setV({ ...v, notifyLate: on })} />
            إشعار ولي الأمر عند التأخر
          </label>
        </div>
        {canEdit ? (
          <div className="mt-4 flex justify-end">
            <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ key: "attendance", patch: { ...v } })}>
              حفظ
            </Button>
          </div>
        ) : (
          <p className="mt-3 text-[12px] text-fg-3">عرض فقط: التعديل يتطلب صلاحية الوحدة على مستوى المدرسة.</p>
        )}
      </SettingsCard>
    </div>
  );
}
