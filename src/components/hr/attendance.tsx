"use client";
/**
 * دوام الموظفين: حضور اليوم (تعديل مباشر، تحضير جماعي، استيراد البصمة CSV)، السجل الشهري،
 * طلبات الإجازة (تسجيل نيابة عن موظف، إلغاء)، والورديات وأنواع الإجازات.
 */
import { CheckCheck, FileUp, Pencil, Plus, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { pickFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { SettingsCard } from "@/components/settings/settings-shell";
import { useFmtDate, useToday } from "@/components/finance/common";
import { ATT_STATUS, ATTENDANCE_TABS, hrNav, LEAVE_STATUS, useMonthLabel, WEEKDAYS } from "./common";

type Day = RouterOutputs["hr"]["time"]["day"];
type StaffStatus = "PRESENT" | "LATE" | "ABSENT" | "ON_LEAVE" | "HOLIDAY" | "EXCUSED";

export function StaffDayPage() {
  const today = useToday();
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const [date, setDate] = useState(today);
  const q = trpc.hr.time.day.useQuery({ date });
  const [edit, setEdit] = useState<Day["rows"][number] | null>(null);
  const all = trpc.hr.time.markAllPresent.useMutation({ onSuccess: (r) => (toast.success(`سُجّل ${formatNumber(r.marked, prefs.digits)} حاضراً`), void utils.hr.time.invalidate()), onError: (e) => toast.error(e.message) });
  const imp = trpc.hr.time.import.useMutation({ onSuccess: (r) => (toast.success(`استُورد ${formatNumber(r.imported, prefs.digits)} سجلاً`), r.errors.length && toast.error(r.errors.slice(0, 3).join("\n")), void utils.hr.time.invalidate()), onError: (e) => toast.error(e.message) });
  const importCsv = async () => {
    const f = await pickFile(".csv,text/csv");
    if (!f) return;
    const text = await f.text();
    const rows = text
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.split(/[,;\t]/).map((x) => x.trim()))
      .filter((c) => /^\d+$/.test(c[0] ?? ""))
      .map((c) => ({ number: Number(c[0]), date: c[1] ?? "", checkIn: /^\d{2}:\d{2}$/.test(c[2] ?? "") ? c[2]! : null, checkOut: /^\d{2}:\d{2}$/.test(c[3] ?? "") ? c[3]! : null }));
    if (!rows.length) return void toast.error("لم يُعثر على سطور صالحة: رقم الموظف، التاريخ YYYY-MM-DD، الحضور HH:MM، الانصراف HH:MM");
    imp.mutate({ rows });
  };
  const d = q.data;
  return (
    <ModuleShell
      nav={hrNav("staff-attendance")}
      wide
      tabs={ATTENDANCE_TABS}
      actions={
        <>
          <Input type="date" className="h-7 w-[150px] text-[13px]" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="التاريخ" />
          <Button size="sm" icon={<FileUp className="size-3.5" />} loading={imp.isPending} onClick={() => void importCsv()}>
            استيراد البصمة
          </Button>
          <Button size="sm" variant="primary" icon={<CheckCheck className="size-3.5" />} loading={all.isPending} disabled={!d?.summary.unrecorded} onClick={() => all.mutate({ date })}>
            تحضير الباقين حاضرين
          </Button>
        </>
      }
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الحضور" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="المطلوب حضورهم" value={d.summary.total} icon={<CheckCheck className="size-4" />} />
            <StatCard label="حاضر" value={d.summary.present} tone="success" icon={<CheckCheck className="size-4" />} />
            <StatCard label="متأخر" value={d.summary.late} tone={d.summary.late ? "warning" : undefined} icon={<CheckCheck className="size-4" />} />
            <StatCard label="غائب" value={d.summary.absent} tone={d.summary.absent ? "danger" : undefined} icon={<XCircle className="size-4" />} />
            <StatCard label="لم يُسجَّل" value={d.summary.unrecorded} icon={<Pencil className="size-4" />} hint={`في إجازة: ${formatNumber(d.summary.leave, prefs.digits)}`} />
          </section>
          <p className="mb-2 text-[12px] text-fg-3">ملف البصمة CSV: رقم الموظف، التاريخ (YYYY-MM-DD)، وقت الحضور، وقت الانصراف — يُحتسب التأخر من الوردية ومهلة السماح.</p>
          <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
            <table className="w-full min-w-[760px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>الوردية</th>
                  <th>الحالة</th>
                  <th>الحضور</th>
                  <th>الانصراف</th>
                  <th>تأخر / إضافي</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => (
                  <tr key={r.employee.id} className={cn(!r.workday && "opacity-60")}>
                    <td>
                      <Link href={`/hr/employees/${r.employee.id}`} className="font-medium hover:underline">
                        {r.employee.fullName}
                      </Link>
                      <span className="block text-[12px] text-fg-3">{r.employee.department ?? "—"}</span>
                    </td>
                    <td className="tabular text-fg-2">{r.shift ? `${r.shift.startTime}–${r.shift.endTime}` : "—"}</td>
                    <td>{r.record ? <Tag color={ATT_STATUS[r.record.status]?.color}>{ATT_STATUS[r.record.status]?.label}</Tag> : r.onLeave ? <Tag color="teal">في إجازة معتمدة</Tag> : !r.workday ? <Tag color="gray">ليس يوم دوام</Tag> : <span className="text-fg-3">لم يُسجَّل</span>}</td>
                    <td className="tabular">{r.record?.checkIn ?? "—"}</td>
                    <td className="tabular">{r.record?.checkOut ?? "—"}</td>
                    <td className="tabular text-fg-2">
                      {r.record?.lateMinutes ? <span className="text-warning-700">{formatNumber(r.record.lateMinutes, prefs.digits)} د تأخر</span> : null}
                      {r.record?.overtimeMinutes ? <span className="ms-2">{formatNumber(r.record.overtimeMinutes, prefs.digits)} د إضافي</span> : null}
                    </td>
                    <td className="text-end">
                      <Button size="icon-sm" variant="ghost" aria-label={`تعديل حضور ${r.employee.fullName}`} onClick={() => setEdit(r)}>
                        <Pencil className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {edit ? <AttendanceDialog row={edit} date={date} onClose={() => setEdit(null)} /> : null}
    </ModuleShell>
  );
}

function AttendanceDialog({ row, date, onClose }: { row: Day["rows"][number]; date: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ status: (row.record?.status ?? "PRESENT") as StaffStatus, checkIn: row.record?.checkIn ?? row.shift?.startTime ?? "", checkOut: row.record?.checkOut ?? row.shift?.endTime ?? "", note: row.record?.note ?? "" });
  const m = trpc.hr.time.set.useMutation({ onSuccess: () => (toast.success("حُفظ الحضور"), void utils.hr.time.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const present = v.status === "PRESENT" || v.status === "LATE";
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={`حضور ${row.employee.fullName}`}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الحالة" className="col-span-2">
            <Select value={v.status} onChange={(s) => setV({ ...v, status: s as StaffStatus })} options={(["PRESENT", "ABSENT", "EXCUSED", "HOLIDAY"] as const).map((s) => ({ value: s, label: ATT_STATUS[s]!.label }))} />
          </Field>
          {present ? (
            <>
              <Field label="الحضور">
                <Input type="time" value={v.checkIn} onChange={(e) => setV({ ...v, checkIn: e.target.value })} />
              </Field>
              <Field label="الانصراف">
                <Input type="time" value={v.checkOut} onChange={(e) => setV({ ...v, checkOut: e.target.value })} />
              </Field>
            </>
          ) : null}
          <Field label="ملاحظة" className="col-span-2">
            <Input value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate({ employeeId: row.employee.id, date, status: v.status, checkIn: present ? v.checkIn || null : null, checkOut: present ? v.checkOut || null : null, note: v.note || null })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StaffMonthPage() {
  const today = useToday();
  const prefs = usePrefs();
  const monthLabel = useMonthLabel();
  const [month, setMonth] = useState(today.slice(0, 7));
  const q = trpc.hr.time.month.useQuery({ month });
  const d = q.data;
  return (
    <ModuleShell nav={hrNav("staff-attendance")} wide tabs={ATTENDANCE_TABS} actions={<Input type="month" className="h-7 w-[160px] text-[13px]" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} aria-label="الشهر" />}>
      <h2 className="mb-3 text-[15px] font-semibold">{monthLabel(month)}</h2>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض السجل" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
          <table className="text-[12px] [&_td]:border-b [&_td]:border-line/60 [&_th]:border-b [&_th]:border-line [&_th]:font-medium [&_th]:text-fg-3">
            <thead>
              <tr>
                <th className="sticky start-0 z-10 min-w-[170px] bg-card px-3 py-2 text-start">الموظف</th>
                {Array.from({ length: d.days }, (_, i) => (
                  <th key={i} className="w-7 py-2 text-center tabular">
                    {formatNumber(i + 1, prefs.digits)}
                  </th>
                ))}
                <th className="px-2 text-center">غياب</th>
                <th className="px-2 text-center">تأخر (د)</th>
                <th className="px-2 text-center">إجازة</th>
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.employee.id}>
                  <td className="sticky start-0 z-10 bg-card px-3 py-1.5 font-medium">{r.employee.fullName}</td>
                  {Array.from({ length: d.days }, (_, i) => {
                    const s = r.cells[i + 1];
                    return (
                      <td key={i} className="text-center" title={s ? ATT_STATUS[s]?.label : undefined}>
                        {s ? (
                          <span className="inline-grid size-5 place-items-center rounded text-[10px] font-semibold" style={{ background: `var(--tag-${ATT_STATUS[s]?.color}-bg)`, color: `var(--tag-${ATT_STATUS[s]?.color}-fg)` }}>
                            {ATT_STATUS[s]?.short}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                  <td className={cn("px-2 text-center tabular", r.summary.absentDays && "font-semibold text-danger-700")}>{formatNumber(r.summary.absentDays, prefs.digits)}</td>
                  <td className="px-2 text-center tabular">{formatNumber(r.summary.lateMinutes, prefs.digits)}</td>
                  <td className="px-2 text-center tabular">{formatNumber(r.summary.leaveDays, prefs.digits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 flex flex-wrap gap-3 text-[12px] text-fg-3">
        {Object.values(ATT_STATUS).map((s) => (
          <span key={s.short}>
            {s.short} = {s.label}
          </span>
        ))}
      </p>
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// طلبات الإجازة
// ---------------------------------------------------------------------

export function StaffLeavesPage() {
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const utils = trpc.useUtils();
  const [status, setStatus] = useState<string>("PENDING");
  const [open, setOpen] = useState(false);
  const q = trpc.hr.time.leaves.useQuery({ status: status === "ALL" ? null : status });
  const cancel = trpc.hr.time.cancelLeave.useMutation({ onSuccess: () => (toast.success("أُلغي الطلب"), void utils.hr.time.invalidate()), onError: (e) => toast.error(e.message) });
  return (
    <ModuleShell nav={hrNav("staff-attendance")} wide tabs={ATTENDANCE_TABS} actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setOpen(true)}>إجازة لموظف</Button>}>
      <div className="mb-3">
        <Segmented value={status} onChange={setStatus} options={[{ value: "PENDING", label: "بانتظار الموافقة" }, { value: "APPROVED", label: "معتمدة" }, { value: "ALL", label: "الكل" }]} />
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الطلبات" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={8} />
      ) : !q.data.length ? (
        <EmptyState illustration="inbox" title="لا طلبات" description="تصل طلبات الموظفين من «خدماتي الوظيفية»، وتُعتمد من «الموافقات» (المدير المباشر ثم الموارد البشرية)." />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
          <table className="w-full min-w-[720px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
            <thead>
              <tr>
                <th>الموظف</th>
                <th>النوع</th>
                <th>الفترة</th>
                <th>الأيام</th>
                <th>السبب</th>
                <th>الحالة</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {q.data.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.employee.fullName}</td>
                  <td>
                    <Tag color={r.type?.color}>{r.type?.name}</Tag>
                    {r.type && !r.type.paid ? <span className="ms-1 text-[11px] text-danger-700">بدون راتب</span> : null}
                  </td>
                  <td className="tabular">
                    {fmtDate(r.startDate)} ← {fmtDate(r.endDate)}
                  </td>
                  <td className="tabular">{formatNumber(r.days, prefs.digits)}</td>
                  <td className="max-w-[220px] truncate text-fg-2">{r.reason ?? "—"}</td>
                  <td>
                    <Tag color={LEAVE_STATUS[r.status]?.color}>{LEAVE_STATUS[r.status]?.label}</Tag>
                  </td>
                  <td className="text-end">
                    {r.status === "PENDING" || r.status === "APPROVED" ? (
                      <Button size="xs" variant="ghost" loading={cancel.isPending && cancel.variables?.id === r.id} onClick={() => cancel.mutate({ id: r.id })}>
                        إلغاء
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open ? <LeaveDialog onBehalf onClose={() => setOpen(false)} /> : null}
    </ModuleShell>
  );
}

export function LeaveDialog({ onBehalf, types, onClose }: { onBehalf?: boolean; types?: Array<{ id: string; name: string; requiresAttachment: boolean }>; onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const opts = trpc.hr.employees.options.useQuery(undefined, { enabled: Boolean(onBehalf) });
  const allTypes = trpc.hr.time.leaveTypes.useQuery(undefined, { enabled: !types });
  const list = types ?? (allTypes.data ?? []).filter((t) => t.isActive);
  const [v, setV] = useState({ employeeId: "", leaveTypeId: "", startDate: today, endDate: today, reason: "" });
  const m = trpc.hr.time.requestLeave.useMutation({ onSuccess: () => (toast.success("أُرسل طلب الإجازة للموافقة"), void utils.hr.time.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const type = list.find((t) => t.id === v.leaveTypeId);
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={onBehalf ? "تسجيل إجازة لموظف" : "طلب إجازة"} description="تُحتسب أيام العمل فقط حسب الوردية، ويُخصم الرصيد بعد الاعتماد.">
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          {onBehalf ? (
            <Field label="الموظف" className="col-span-2">
              <Select value={v.employeeId || undefined} onChange={(employeeId) => setV({ ...v, employeeId })} options={(opts.data?.managers ?? []).map((e) => ({ value: e.id, label: e.fullName }))} />
            </Field>
          ) : null}
          <Field label="النوع" className="col-span-2">
            <Select value={v.leaveTypeId || undefined} onChange={(leaveTypeId) => setV({ ...v, leaveTypeId })} options={list.map((t) => ({ value: t.id, label: t.name }))} />
          </Field>
          <Field label="من">
            <Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value, endDate: e.target.value > v.endDate ? e.target.value : v.endDate })} />
          </Field>
          <Field label="إلى">
            <Input type="date" value={v.endDate} min={v.startDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
          </Field>
          <Field label="السبب" className="col-span-2">
            <Textarea rows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
          </Field>
          {type?.requiresAttachment ? <p className="col-span-2 text-[12px] text-warning-700">هذا النوع يتطلب مستنداً مؤيداً (تقرير طبي…): أرفقه عبر الموارد البشرية.</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.leaveTypeId || (onBehalf && !v.employeeId)} onClick={() => m.mutate({ employeeId: onBehalf ? v.employeeId : null, leaveTypeId: v.leaveTypeId, startDate: v.startDate, endDate: v.endDate, reason: v.reason || null })}>
            إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// الورديات وأنواع الإجازات
// ---------------------------------------------------------------------

export function StaffSettingsPage() {
  const { can } = useApp();
  const prefs = usePrefs();
  const shifts = trpc.hr.time.shifts.useQuery();
  const types = trpc.hr.time.leaveTypes.useQuery();
  const [dialog, setDialog] = useState<null | { shift: RouterOutputs["hr"]["time"]["shifts"][number] | null } | { type: RouterOutputs["hr"]["time"]["leaveTypes"][number] | null }>(null);
  const canEdit = can("hr_attendance", "update");
  return (
    <ModuleShell nav={hrNav("staff-attendance")} tabs={ATTENDANCE_TABS}>
      <SettingsCard title="الورديات" description="بداية الدوام ونهايته ومهلة السماح بالتأخر وأيام العمل." footer={canEdit ? <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDialog({ shift: null })}>وردية</Button> : undefined}>
        {!shifts.data ? (
          <SkeletonLines lines={3} />
        ) : !shifts.data.length ? (
          <p className="text-[13px] text-fg-3">لا ورديات؛ أضف الوردية الافتراضية.</p>
        ) : (
          <ul className="divide-y divide-line/60">
            {shifts.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2 text-[13px]">
                <span className="font-medium">{s.name}</span>
                {s.isDefault ? <Tag size="sm" color="navy">افتراضية</Tag> : null}
                <span className="tabular text-fg-2">
                  {s.startTime}–{s.endTime} · سماح {formatNumber(s.graceMinutes, prefs.digits)} د
                </span>
                <span className="text-fg-3">{s.workDays.map((d) => WEEKDAYS[d]).join("، ")}</span>
                <span className="ms-auto text-fg-3">{formatNumber(s.employees, prefs.digits)} موظفاً</span>
                {canEdit ? (
                  <Button size="icon-sm" variant="ghost" aria-label={`تعديل ${s.name}`} onClick={() => setDialog({ shift: s })}>
                    <Pencil className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
      <SettingsCard title="أنواع الإجازات" description="الاستحقاق السنوي والترحيل وأثر الإجازة على الراتب (غير المدفوعة تُخصم بأجر اليوم في المسير)." footer={canEdit ? <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setDialog({ type: null })}>نوع إجازة</Button> : undefined}>
        {!types.data ? (
          <SkeletonLines lines={5} />
        ) : (
          <ul className="divide-y divide-line/60">
            {types.data.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2 text-[13px]">
                <Tag color={t.color}>{t.name}</Tag>
                <span className="text-fg-2">{t.annualDays === null ? "بلا رصيد" : `${formatNumber(t.annualDays, prefs.digits)} يوماً سنوياً`}</span>
                {!t.paid ? <Tag size="sm" color="red">بدون راتب</Tag> : null}
                {t.requiresAttachment ? <Tag size="sm" color="gray">مستند مطلوب</Tag> : null}
                {t.gender ? <Tag size="sm" color="purple">{t.gender === "FEMALE" ? "للموظفات" : "للموظفين"}</Tag> : null}
                {!t.isActive ? <Tag size="sm" color="gray">موقوف</Tag> : null}
                {canEdit ? (
                  <Button size="icon-sm" variant="ghost" className="ms-auto" aria-label={`تعديل ${t.name}`} onClick={() => setDialog({ type: t })}>
                    <Pencil className="size-3.5" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
      {dialog && "shift" in dialog ? <ShiftDialog shift={dialog.shift} onClose={() => setDialog(null)} /> : null}
      {dialog && "type" in dialog ? <LeaveTypeDialog type={dialog.type} onClose={() => setDialog(null)} /> : null}
    </ModuleShell>
  );
}

function ShiftDialog({ shift, onClose }: { shift: RouterOutputs["hr"]["time"]["shifts"][number] | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ name: shift?.name ?? "", startTime: shift?.startTime ?? "07:00", endTime: shift?.endTime ?? "14:00", graceMinutes: shift?.graceMinutes ?? 10, workDays: shift?.workDays ?? [0, 1, 2, 3, 4], isDefault: shift?.isDefault ?? false });
  const m = trpc.hr.time.saveShift.useMutation({ onSuccess: () => (toast.success("حُفظت الوردية"), void utils.hr.time.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={shift ? "تعديل الوردية" : "وردية جديدة"}>
        <div className="grid grid-cols-3 gap-3 px-5 pb-4">
          <Field label="الاسم" className="col-span-3">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="البداية">
            <Input type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} />
          </Field>
          <Field label="النهاية">
            <Input type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} />
          </Field>
          <Field label="السماح (د)">
            <Input type="number" min={0} max={60} value={v.graceMinutes} onChange={(e) => setV({ ...v, graceMinutes: Math.max(0, Math.min(60, Math.trunc(Number(e.target.value) || 0))) })} />
          </Field>
          <div className="col-span-3 flex flex-wrap gap-3">
            {WEEKDAYS.map((w, i) => (
              <label key={w} className="flex items-center gap-1.5 text-[13px]">
                <Checkbox checked={v.workDays.includes(i)} onChange={(on) => setV({ ...v, workDays: on ? [...v.workDays, i] : v.workDays.filter((x) => x !== i) })} /> {w}
              </label>
            ))}
          </div>
          <label className="col-span-3 flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.isDefault} onChange={(isDefault) => setV({ ...v, isDefault })} /> الوردية الافتراضية
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={v.name.trim().length < 2 || !v.workDays.length} onClick={() => m.mutate({ id: shift?.id ?? null, ...v })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeaveTypeDialog({ type, onClose }: { type: RouterOutputs["hr"]["time"]["leaveTypes"][number] | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ code: type?.code ?? "", name: type?.name ?? "", paid: type?.paid ?? true, annualDays: type?.annualDays ?? null, requiresAttachment: type?.requiresAttachment ?? false, maxPerRequest: type?.maxPerRequest ?? null, carryOverDays: type?.carryOverDays ?? 0, gender: (type?.gender ?? null) as "MALE" | "FEMALE" | null, color: type?.color ?? "teal", isActive: type?.isActive ?? true });
  const m = trpc.hr.time.saveLeaveType.useMutation({ onSuccess: () => (toast.success("حُفظ نوع الإجازة"), void utils.hr.time.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const num = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.trunc(Number(s) || 0)));
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title={type ? `تعديل ${type.name}` : "نوع إجازة"}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الرمز">
            <Input dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="الاسم">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="الاستحقاق السنوي" hint="فارغ = بلا رصيد">
            <Input type="number" min={0} value={v.annualDays ?? ""} onChange={(e) => setV({ ...v, annualDays: num(e.target.value) })} />
          </Field>
          <Field label="الحد في الطلب">
            <Input type="number" min={1} value={v.maxPerRequest ?? ""} onChange={(e) => setV({ ...v, maxPerRequest: num(e.target.value) })} />
          </Field>
          <Field label="الترحيل للسنة التالية">
            <Input type="number" min={0} max={60} value={v.carryOverDays} onChange={(e) => setV({ ...v, carryOverDays: num(e.target.value) ?? 0 })} />
          </Field>
          <Field label="تنطبق على">
            <Select value={v.gender ?? "ALL"} onChange={(g) => setV({ ...v, gender: g === "ALL" ? null : (g as "MALE") })} options={[{ value: "ALL", label: "الجميع" }, { value: "FEMALE", label: "الموظفات" }, { value: "MALE", label: "الموظفين" }]} />
          </Field>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.paid} onChange={(paid) => setV({ ...v, paid })} /> مدفوعة الأجر
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.requiresAttachment} onChange={(requiresAttachment) => setV({ ...v, requiresAttachment })} /> تتطلب مستنداً
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} /> مفعّلة
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={v.code.length < 2 || v.name.trim().length < 2} onClick={() => m.mutate({ id: type?.id ?? null, ...v })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
