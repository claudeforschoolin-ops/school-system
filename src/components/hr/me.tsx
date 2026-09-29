"use client";
/**
 * خدماتي الوظيفية: تسجيل الحضور والانصراف، أرصدة الإجازات وطلبها، حالة طلباتي، ملخص الشهر،
 * قسائم الراتب، وطلب سلفة.
 */
import { HandCoins, LogIn, LogOut, Plus, Printer } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { MoneyInput, useFmtDate, useMoney, useToday } from "@/components/finance/common";
import { LeaveDialog } from "./attendance";
import { ATT_STATUS, hrNav, LEAVE_STATUS, RUN_STATUS, useMonthLabel } from "./common";

export function SelfServicePage() {
  const q = trpc.hr.time.me.useQuery();
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const monthLabel = useMonthLabel();
  const [dialog, setDialog] = useState<null | "leave" | "loan">(null);
  const check = trpc.hr.time.check.useMutation({ onSuccess: (_r, v) => (toast.success(v.kind === "IN" ? "سُجّل حضورك" : "سُجّل انصرافك"), void utils.hr.time.me.invalidate()), onError: (e) => toast.error(e.message) });
  const cancel = trpc.hr.time.cancelLeave.useMutation({ onSuccess: () => (toast.success("أُلغي الطلب"), void utils.hr.time.me.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  return (
    <ModuleShell nav={hrNav("self-service")}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض خدماتك" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : !d.employee ? (
        <EmptyState illustration="inbox" title="حسابك غير مرتبط بملف موظف" description="تطلب الموارد البشرية ربط حسابك بملفك الوظيفي لتظهر هنا خدماتك." />
      ) : (
        <div className="space-y-5">
          <section className="flex flex-wrap items-center gap-4 rounded-lg bg-card p-5 shadow-card">
            <div className="flex-1">
              <p className="text-[13px] text-fg-3">{fmtDate(d.today, "long")}</p>
              <p className="mt-1 text-[18px] font-semibold">
                {d.record ? (
                  <>
                    <Tag color={ATT_STATUS[d.record.status]?.color}>{ATT_STATUS[d.record.status]?.label}</Tag> <span className="tabular">{d.record.checkIn ?? "—"}</span> ← <span className="tabular">{d.record.checkOut ?? "…"}</span>
                    {d.record.lateMinutes ? <span className="ms-2 text-[13px] text-warning-700">تأخر {formatNumber(d.record.lateMinutes, prefs.digits)} دقيقة</span> : null}
                  </>
                ) : (
                  "لم تسجل حضورك اليوم"
                )}
              </p>
              {d.shift ? <p className="mt-1 text-[12px] text-fg-3 tabular">دوامك {d.shift.startTime}–{d.shift.endTime} · سماح {formatNumber(d.shift.graceMinutes, prefs.digits)} دقائق</p> : null}
            </div>
            <Button variant="primary" size="lg" icon={<LogIn className="size-4" />} disabled={Boolean(d.record?.checkIn)} loading={check.isPending && check.variables?.kind === "IN"} onClick={() => check.mutate({ kind: "IN" })}>
              تسجيل الحضور
            </Button>
            <Button size="lg" icon={<LogOut className="size-4" />} disabled={!d.record?.checkIn || Boolean(d.record?.checkOut)} loading={check.isPending && check.variables?.kind === "OUT"} onClick={() => check.mutate({ kind: "OUT" })}>
              تسجيل الانصراف
            </Button>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold">أرصدة إجازاتي</h2>
              <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDialog("leave")}>
                طلب إجازة
              </Button>
            </div>
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {d.balances.map((b) => (
                <li key={b.type.id} className="rounded-lg bg-card p-4 shadow-card">
                  <p className="text-[13px] text-fg-3">{b.type.name}</p>
                  <p className="mt-1 text-[22px] font-bold tabular">{formatNumber(b.remaining, prefs.digits)}</p>
                  <p className="text-[12px] text-fg-3">
                    من {formatNumber(b.entitled, prefs.digits)} · استُخدم {formatNumber(b.used, prefs.digits)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-lg bg-card p-4 shadow-card">
              <h2 className="mb-2 text-[15px] font-semibold">طلباتي</h2>
              {!d.requests.length ? (
                <p className="text-[13px] text-fg-3">لا طلبات إجازة.</p>
              ) : (
                <ul className="divide-y divide-line/60 text-[13px]">
                  {d.requests.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="font-medium">{r.type}</span>
                      <span className="tabular text-fg-3">
                        {fmtDate(r.startDate)} ← {fmtDate(r.endDate)} · {formatNumber(r.days, prefs.digits)} يوم
                      </span>
                      <Tag size="sm" color={LEAVE_STATUS[r.status]?.color}>
                        {LEAVE_STATUS[r.status]?.label}
                      </Tag>
                      {r.status === "PENDING" ? (
                        <Button size="xs" variant="ghost" className="ms-auto" onClick={() => cancel.mutate({ id: r.id })}>
                          إلغاء
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {d.month ? (
                <p className="mt-3 border-t border-line pt-2 text-[12px] text-fg-3">
                  هذا الشهر: حضور {formatNumber(d.month.presentDays, prefs.digits)} · غياب {formatNumber(d.month.absentDays, prefs.digits)} · تأخر {formatNumber(d.month.lateMinutes, prefs.digits)} دقيقة · إجازة {formatNumber(d.month.leaveDays, prefs.digits)}
                </p>
              ) : null}
            </section>
            <section className="rounded-lg bg-card p-4 shadow-card">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">قسائم راتبي</h2>
                <Button size="xs" variant="ghost" icon={<HandCoins className="size-3.5" />} onClick={() => setDialog("loan")}>
                  طلب سلفة
                </Button>
              </div>
              {!d.payslips.length ? (
                <p className="text-[13px] text-fg-3">تظهر القسائم بعد اعتماد مسير الرواتب.</p>
              ) : (
                <ul className="divide-y divide-line/60 text-[13px]">
                  {d.payslips.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 py-2">
                      <span className="flex-1">{monthLabel(p.month)}</span>
                      <Tag size="sm" color={RUN_STATUS[p.status]?.color}>
                        {p.status === "PAID" ? "مصروف" : "معتمد"}
                      </Tag>
                      <span className="font-semibold tabular">{money.fmt(p.netMinor)}</span>
                      <Link href={`/hr/payroll/payslip/${p.id}`}>
                        <Button size="icon-sm" variant="ghost" aria-label={`قسيمة ${monthLabel(p.month)}`}>
                          <Printer className="size-3.5" />
                        </Button>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
      {dialog === "leave" && d?.employee ? <LeaveDialog types={d.leaveTypes} onClose={() => setDialog(null)} /> : null}
      {dialog === "loan" ? <LoanDialog onClose={() => setDialog(null)} /> : null}
    </ModuleShell>
  );
}

export function LoanDialog({ employees, onClose }: { employees?: Array<{ id: string; fullName: string }>; onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const money = useMoney();
  const next = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)).toISOString().slice(0, 7);
  const [v, setV] = useState({ employeeId: "", amountMinor: null as number | null, installmentMinor: null as number | null, startMonth: next, reason: "" });
  const m = trpc.hr.payroll.requestLoan.useMutation({ onSuccess: () => (toast.success("أُرسل طلب السلفة للاعتماد"), void utils.hr.payroll.loans.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const months = v.amountMinor && v.installmentMinor ? Math.ceil(v.amountMinor / v.installmentMinor) : null;
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent title="طلب سلفة" description="تُعتمد من مدير الموارد البشرية، وتُستقطع أقساطها من الراتب بعد صرفها (بحد أقصى نصف الراتب شهرياً مع باقي الاستقطاعات).">
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          {employees ? (
            <Field label="الموظف" className="col-span-2">
              <Select value={v.employeeId || undefined} onChange={(employeeId) => setV({ ...v, employeeId })} options={employees.map((e) => ({ value: e.id, label: e.fullName }))} />
            </Field>
          ) : null}
          <Field label="المبلغ">
            <MoneyInput value={v.amountMinor} onChange={(amountMinor) => setV({ ...v, amountMinor })} />
          </Field>
          <Field label="القسط الشهري">
            <MoneyInput value={v.installmentMinor} onChange={(installmentMinor) => setV({ ...v, installmentMinor })} />
          </Field>
          <Field label="أول استقطاع">
            <Input type="month" value={v.startMonth} onChange={(e) => setV({ ...v, startMonth: e.target.value })} />
          </Field>
          <p className="self-end pb-2 text-[13px] text-fg-2">{months ? `${months} أقساط${v.amountMinor ? ` · ${money.fmt(v.amountMinor)}` : ""}` : ""}</p>
          <Field label="السبب" className="col-span-2">
            <Textarea rows={2} value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.amountMinor || !v.installmentMinor || v.reason.trim().length < 3 || (employees && !v.employeeId)} onClick={() => m.mutate({ employeeId: employees ? v.employeeId : null, amountMinor: v.amountMinor!, installmentMinor: v.installmentMinor!, startMonth: v.startMonth, reason: v.reason })}>
            إرسال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
