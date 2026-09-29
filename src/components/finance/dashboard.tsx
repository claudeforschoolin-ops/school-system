"use client";
/**
 * لوحة المالية: المؤشرات الرئيسية، التحصيل مقابل المستهدف شهرياً، وما ينتظر الإجراء
 * (فواتير متأخرة، سندات صرف، استردادات، خصومات بانتظار الاعتماد، شيكات تحت التحصيل).
 */
import { AlertTriangle, Banknote, CircleDollarSign, FilePlus2, HandCoins, Landmark, Receipt, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { REFUND_STATUS, VOUCHER_STATUS } from "@/lib/finance/labels";
import { formatNumber } from "@/lib/numbers";
import { monthTitle } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ChartCard } from "@/components/charts/bars";
import { TargetColumns } from "@/components/charts/target-columns";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { financeNav, labelOf, useFmtDate, useMoney, useToday } from "./common";

export function FinanceHome() {
  const { can } = useApp();
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const today = useToday();
  const q = trpc.finance.reports.dashboard.useQuery();
  const d = q.data;
  const fmt = (n: number) => money.fmt(n);
  const whole = (n: number) => money.whole(n);
  const actions = (
    <>
      {can("collections", "create") ? (
        <Link href="/finance/collect">
          <Button size="sm" variant="primary" icon={<Banknote className="size-3.5" />}>
            سند قبض
          </Button>
        </Link>
      ) : null}
      {can("invoices", "create") ? (
        <Link href="/finance/invoices/bulk">
          <Button size="sm" icon={<FilePlus2 className="size-3.5" />}>
            فوترة جماعية
          </Button>
        </Link>
      ) : null}
    </>
  );
  if (q.error) {
    return (
      <ModuleShell nav={financeNav("finance")}>
        <EmptyState illustration="lock" title="لا يمكن عرض لوحة المالية" description={q.error.message} />
      </ModuleShell>
    );
  }
  const months = d?.months ?? [];
  const thisMonth = today.slice(0, 7);
  return (
    <ModuleShell nav={financeNav("finance")} wide actions={actions}>
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="المحصّل هذا الشهر" value={d?.kpis.collectedMonth} format={whole} compact icon={<CircleDollarSign className="size-4" />} tone="success" href="/finance/collect/receipts" />
        <StatCard label="الذمم المفتوحة" value={d?.kpis.receivable} format={whole} compact icon={<Receipt className="size-4" />} href="/finance/reports/aging" />
        <StatCard label="المتأخر" value={d?.kpis.overdue} format={whole} compact icon={<AlertTriangle className="size-4" />} tone={d?.kpis.overdue ? "danger" : undefined} hint={d ? `${formatNumber(d.kpis.overdueCount, prefs.digits)} فاتورة متأخرة` : undefined} href="/finance/reports/aging" />
        <StatCard label="مصروفات الشهر" value={d?.kpis.expensesMonth} format={whole} compact icon={<HandCoins className="size-4" />} href="/finance/reports/income" />
        <StatCard label="النقد والبنوك" value={d?.kpis.cashAndBank} format={whole} compact icon={<Landmark className="size-4" />} href="/finance/banking" />
      </section>

      {!d ? (
        <SkeletonLines lines={12} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <ChartCard
            className="lg:col-span-2"
            title="التحصيل مقابل المستهدف"
            subtitle="المحصّل شهرياً في العام الدراسي، والمستهدف نسبة من الأقساط المستحقة في الشهر"
            table={{
              columns: ["الشهر", "المستحق", "المستهدف", "المحصّل"],
              rows: months.map((m) => [monthTitle(Number(m.key.slice(0, 4)), Number(m.key.slice(5, 7)) - 1, "gregory", prefs.digits), money.fmt(m.due), money.fmt(m.target), money.fmt(m.collected)]),
            }}
          >
            {months.length ? (
              <TargetColumns
                format={fmt}
                data={months.map((m) => ({
                  key: m.key,
                  label: monthTitle(Number(m.key.slice(0, 4)), Number(m.key.slice(5, 7)) - 1, "gregory", prefs.digits).split(" ")[0]!,
                  value: m.collected,
                  target: m.target,
                  future: m.key > thisMonth,
                }))}
              />
            ) : (
              <EmptyState compact illustration="calendar" title="لا يوجد عام دراسي حالي" description="حدّد العام الدراسي الحالي من إعدادات الصفوف لعرض التحصيل الشهري." />
            )}
          </ChartCard>

          <Panel title="فواتير متأخرة" href="/finance/invoices" count={d.kpis.overdueCount}>
            {d.actions.overdue.length ? (
              <ul className="divide-y divide-line/70">
                {d.actions.overdue.map((i) => (
                  <li key={i.id}>
                    <Link href={`/finance/invoices/${i.id}`} className="flex items-center gap-3 px-1 py-2 hover:bg-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{i.student}</span>
                        <span className="block truncate text-[12px] text-fg-3">
                          فاتورة {formatNumber(i.number ?? 0, prefs.digits, { useGrouping: false })} · {i.guardian ?? "—"}
                        </span>
                      </span>
                      <span className="text-end">
                        <span className="block text-[13px] font-medium tabular">{money.fmt(i.balance)}</span>
                        <span className="block text-[11px] text-danger-700">متأخرة {formatNumber(i.days, prefs.digits)} يوماً</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet>لا فواتير متأخرة. أحسنتم المتابعة.</Quiet>
            )}
          </Panel>

          <Panel title="سندات صرف تنتظر" href="/finance/vouchers" count={d.actions.vouchers.length}>
            {d.actions.vouchers.length ? (
              <ul className="divide-y divide-line/70">
                {d.actions.vouchers.map((v) => (
                  <li key={v.id}>
                    <Link href={`/finance/vouchers/${v.id}`} className="flex items-center gap-3 px-1 py-2 hover:bg-hover">
                      <span className="min-w-0 flex-1 truncate text-[14px]">{v.payee}</span>
                      <Tag size="sm" color={labelOf(VOUCHER_STATUS, v.status).color}>
                        {labelOf(VOUCHER_STATUS, v.status).label}
                      </Tag>
                      <span className="text-[13px] tabular">{money.fmt(v.total)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet>لا سندات صرف معلّقة.</Quiet>
            )}
          </Panel>

          <Panel title="شيكات تحت التحصيل" href="/finance/collect/cheques" count={d.actions.cheques.length}>
            {d.actions.cheques.length ? (
              <ul className="divide-y divide-line/70">
                {d.actions.cheques.map((c) => (
                  <li key={c.id}>
                    <Link href={`/finance/receipts/${c.id}`} className="flex items-center gap-3 px-1 py-2 hover:bg-hover">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px]">{c.payer ?? "—"}</span>
                        <span className="block truncate text-[12px] text-fg-3">
                          شيك <bdi dir="ltr">{c.chequeNumber}</bdi> · {c.bank} · {fmtDate(c.date)}
                        </span>
                      </span>
                      <span className="text-[13px] tabular">{money.fmt(c.amount)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Quiet>لا شيكات معلّقة.</Quiet>
            )}
          </Panel>

          <Panel title="استردادات وخصومات بانتظار القرار" href="/inbox" count={d.actions.refunds.length + d.actions.pendingDiscounts}>
            <ul className="divide-y divide-line/70">
              {d.actions.refunds.map((r) => (
                <li key={r.id}>
                  <Link href={`/finance/families/${r.guardianId}`} className="flex items-center gap-3 px-1 py-2 hover:bg-hover">
                    <Wallet className="size-4 text-fg-3" />
                    <span className="min-w-0 flex-1 truncate text-[14px]">استرداد رقم {formatNumber(r.number, prefs.digits, { useGrouping: false })}</span>
                    <Tag size="sm" color={labelOf(REFUND_STATUS, r.status).color}>
                      {labelOf(REFUND_STATUS, r.status).label}
                    </Tag>
                    <span className="text-[13px] tabular">{money.fmt(r.amount)}</span>
                  </Link>
                </li>
              ))}
              {d.actions.pendingDiscounts ? (
                <li>
                  <Link href="/inbox" className="flex items-center gap-3 px-1 py-2 hover:bg-hover">
                    <Receipt className="size-4 text-fg-3" />
                    <span className="flex-1 text-[14px]">خصومات طلاب بانتظار الاعتماد</span>
                    <span className="text-[13px] tabular">{formatNumber(d.actions.pendingDiscounts, prefs.digits)}</span>
                  </Link>
                </li>
              ) : null}
            </ul>
            {!d.actions.refunds.length && !d.actions.pendingDiscounts ? <Quiet>لا طلبات معلّقة.</Quiet> : null}
          </Panel>
        </div>
      )}
    </ModuleShell>
  );
}

function Panel({ title, href, count, children }: { title: string; href: string; count: number; children: ReactNode }) {
  const prefs = usePrefs();
  return (
    <section className="rounded-lg bg-card p-4 shadow-card">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold">
          {title}
          {count ? <span className="ms-1.5 text-[12px] font-normal text-fg-3 tabular">{formatNumber(count, prefs.digits)}</span> : null}
        </h3>
        <Link href={href} className="text-[12px] text-fg-3 hover:text-fg">
          عرض الكل
        </Link>
      </div>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-fg-3">{children}</p>;
}
