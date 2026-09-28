"use client";
/**
 * تبويبات ملف الطالب القادمة من وحدات أخرى: الحضور (تقويم الشهر والملخص) والسلوك (النقاط والسجل).
 */
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Action } from "@/lib/rbac/catalog";
import { ATTENDANCE_ORDER, ATTENDANCE_STATUS, BEHAVIOR_CATEGORIES, SEVERITY } from "@/lib/students";
import { formatDate, monthTitle, toISODate, weekdayNames } from "@/lib/dates";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { Tooltip } from "@/components/ui/tooltip";
import { useApp } from "@/components/shell/app-context";
import { StatCard } from "@/components/modules/module-shell";
import { NewBehaviorDialog } from "./more-create-dialogs";
import { StudentActivitiesTab } from "@/components/activities/student-activities-tab";

export function studentExtraTabs(can: (module: string, action: Action) => boolean): Array<{ key: string; label: string }> {
  const tabs: Array<{ key: string; label: string }> = [];
  if (can("attendance", "view")) tabs.push({ key: "attendance", label: "الحضور" });
  if (can("counseling", "view")) tabs.push({ key: "behavior", label: "السلوك" });
  if (can("activities", "view")) tabs.push({ key: "activities", label: "الأنشطة" });
  return tabs;
}

export function StudentExtraTabs({ tab, studentId }: { tab: string; studentId: string }) {
  if (tab === "attendance") return <AttendanceTab studentId={studentId} />;
  if (tab === "behavior") return <BehaviorTab studentId={studentId} />;
  if (tab === "activities") return <StudentActivitiesTab studentId={studentId} />;
  return null;
}

function shiftMonth(m: string, delta: number) {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function AttendanceTab({ studentId }: { studentId: string }) {
  const { prefs, tenant } = useApp();
  const current = toISODate(new Date(), tenant.timezone).slice(0, 7);
  const [month, setMonth] = useState(current);
  const q = trpc.attendance.student.useQuery({ studentId, month });
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض الحضور" description={q.error.message} compact />;
  if (!q.data) return <SkeletonLines lines={8} />;
  const a = q.data;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const byDay = new Map(a.days.map((d) => [d.date, d.status]));
  const cells: Array<string | null> = [...Array.from({ length: first.getUTCDay() }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="نسبة الحضور (العام)" value={a.presentRate} format={(n) => formatPercent(n, prefs.digits, 1)} icon={<span className="text-[12px]">٪</span>} />
        <StatCard label="أيام الغياب" value={a.byStatus.ABSENT ?? 0} icon={<span className="size-2 rounded-full bg-danger-700" />} tone={(a.byStatus.ABSENT ?? 0) > 0 ? "danger" : undefined} />
        <StatCard label="مرات التأخر" value={a.byStatus.LATE ?? 0} icon={<span className="size-2 rounded-full bg-gold-700" />} />
        <StatCard label="غياب بعذر/استئذان" value={(a.byStatus.EXCUSED ?? 0) + (a.byStatus.PERMISSION ?? 0)} icon={<span className="size-2 rounded-full bg-slate-blue" />} />
      </section>
      <section className="rounded-lg bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">{monthTitle(y, m - 1, prefs.calendar === "hijri" ? "hijri" : "gregory", prefs.digits)}</h3>
          <div className="flex gap-1">
            <Button size="icon-sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="الشهر السابق">
              <ChevronRight className="size-4" />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= current} aria-label="الشهر التالي">
              <ChevronLeft className="size-4" />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-fg-3">
          {weekdayNames("short").map((d) => (
            <span key={d} className="py-1">
              {d}
            </span>
          ))}
          {cells.map((day, i) => {
            if (!day) return <span key={`e${i}`} />;
            const st = byDay.get(day);
            const meta = st ? ATTENDANCE_STATUS[st] : null;
            return (
              <Tooltip key={day} content={`${formatDate(day, { digits: prefs.digits, calendar: "both" })}${meta ? ` — ${meta.label}` : ""}`}>
                <span className={cn("grid h-9 place-items-center rounded-md text-[12px] tabular", !meta && "text-fg-3")} style={meta ? { background: `var(--tag-${meta.color}-bg)`, color: `var(--tag-${meta.color}-fg)` } : undefined}>
                  {formatNumber(Number(day.slice(8)), prefs.digits)}
                </span>
              </Tooltip>
            );
          })}
        </div>
        <ul className="mt-3 flex flex-wrap gap-3 text-[12px] text-fg-2">
          {ATTENDANCE_ORDER.map((k) => (
            <li key={k} className="flex items-center gap-1">
              <span className="size-2.5 rounded-sm" style={{ background: `var(--tag-${ATTENDANCE_STATUS[k].color}-dot)` }} />
              {ATTENDANCE_STATUS[k].label}
            </li>
          ))}
        </ul>
      </section>
      {a.recent.length ? (
        <section className="rounded-lg bg-card p-4 shadow-card">
          <h3 className="mb-2 text-[14px] font-semibold">آخر الغيابات والتأخرات</h3>
          <ul className="divide-y divide-line">
            {a.recent.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 text-[13px]">
                <Tag color={ATTENDANCE_STATUS[r.status].color} size="sm">
                  {ATTENDANCE_STATUS[r.status].label}
                </Tag>
                <span>{formatDate(r.date, { digits: prefs.digits, calendar: prefs.calendar })}</span>
                <span className="min-w-0 flex-1 truncate text-fg-3">{r.reason}</span>
                {r.source === "LEAVE" ? <span className="text-[11px] text-fg-3">من إجازة معتمدة</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function BehaviorTab({ studentId }: { studentId: string }) {
  const { prefs, can } = useApp();
  const utils = trpc.useUtils();
  const q = trpc.behavior.student.useQuery({ studentId });
  const profile = trpc.students.get.useQuery({ id: studentId });
  const [adding, setAdding] = useState(false);
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض السلوك" description={q.error.message} compact />;
  if (!q.data) return <SkeletonLines lines={8} />;
  const b = q.data;
  return (
    <div className="space-y-4">
      <section className="grid grid-cols-3 gap-3">
        <StatCard label="صافي النقاط" value={b.points} format={(n) => `${n > 0 ? "+" : ""}${formatNumber(n, prefs.digits)}`} icon={<span className="text-[12px]">±</span>} tone={b.points < 0 ? "danger" : "success"} />
        <StatCard label="إيجابي" value={b.positive} icon={<span className="size-2 rounded-full bg-success-800" />} />
        <StatCard label="سلبي" value={b.negative} icon={<span className="size-2 rounded-full bg-danger-700" />} />
      </section>
      <section className="rounded-lg bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">سجل السلوك</h3>
          {can("counseling", "create") ? (
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>
              ملاحظة سلوكية
            </Button>
          ) : null}
        </div>
        {b.records.length ? (
          <ul className="divide-y divide-line">
            {b.records.map((r) => {
              const cat = BEHAVIOR_CATEGORIES.find((c) => c.id === r.category);
              return (
                <li key={r.id}>
                  <Link href={`/behavior/${r.id}`} className="flex items-center gap-3 py-2.5 text-[13px] hover:bg-hover">
                    <span className={cn("w-10 shrink-0 text-center font-semibold tabular", r.points >= 0 ? "text-success-800" : "text-danger-700")}>
                      {r.points > 0 ? "+" : ""}
                      {formatNumber(r.points, prefs.digits)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{cat?.label ?? r.category}</span>
                      <span className="block truncate text-[12px] text-fg-3">{r.description}</span>
                    </span>
                    {r.severity !== "LOW" ? (
                      <Tag color={SEVERITY[r.severity as keyof typeof SEVERITY].color} size="sm">
                        {SEVERITY[r.severity as keyof typeof SEVERITY].label}
                      </Tag>
                    ) : null}
                    <span className="shrink-0 text-[12px] text-fg-3">{formatDate(r.occurredAt, { digits: prefs.digits })}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-fg-3">لا توجد ملاحظات سلوكية.</p>
        )}
      </section>
      {adding && profile.data ? (
        <NewBehaviorDialog
          prefill={{}}
          student={{ id: profile.data.id, fullName: profile.data.fullName, academicNumber: profile.data.academicNumber, grade: profile.data.grade, section: profile.data.section }}
          onClose={() => setAdding(false)}
          onCreated={() => {
            setAdding(false);
            void utils.behavior.student.invalidate({ studentId });
          }}
        />
      ) : null}
    </div>
  );
}
