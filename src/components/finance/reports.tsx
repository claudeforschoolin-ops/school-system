"use client";
/**
 * التقارير المالية: ميزان المراجعة، قائمة الدخل (بمقارنة ومركز تكلفة وحسب الفرع)، الميزانية العمومية،
 * التدفقات النقدية، تقادم الذمم، إقرار ضريبة القيمة المضافة، الإيراد المؤجل، التحصيل، الخصومات، وحركة الصندوق.
 * كل رقم ينزل إلى دفتر الأستاذ ثم القيد ثم المستند المصدر.
 */
import { Download, FileBarChart, Printer } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { PAYMENT_METHOD, type PaymentMethodKey } from "@/lib/finance/labels";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { minorToDecimalString } from "@/lib/money";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ChartCard, HBars } from "@/components/charts/bars";
import { Columns } from "@/components/charts/columns";
import { ModuleShell } from "@/components/modules/module-shell";
import {
  downloadCsv,
  Figure,
  FinTable,
  financeNav,
  monthStart,
  num,
  RangePicker,
  useFmtDate,
  useMoney,
  useToday,
  yearStart,
  docNo,
} from "./common";

export const REPORTS = [
  {
    href: "/finance/reports/trial-balance",
    label: "ميزان المراجعة",
    description: "أرصدة أول المدة والحركة والختامية لكل حساب، مع التحقق من التوازن.",
  },
  {
    href: "/finance/reports/income",
    label: "قائمة الدخل",
    description: "الإيرادات بعد الخصومات والمصروفات، بمقارنة فترة سابقة وحسب الفرع ومركز التكلفة.",
  },
  {
    href: "/finance/reports/balance-sheet",
    label: "الميزانية العمومية",
    description: "الأصول والخصوم وحقوق الملكية في تاريخ محدد.",
  },
  {
    href: "/finance/reports/cash-flow",
    label: "التدفقات النقدية",
    description: "حركة النقد والبنوك بالطريقة المباشرة: تشغيلية واستثمارية وتمويلية.",
  },
  {
    href: "/finance/reports/aging",
    label: "تقادم الذمم",
    description: "المستحق على الأسر بشرائح التأخير، مع أرقام التواصل.",
  },
  {
    href: "/finance/reports/vat",
    label: "إقرار ضريبة القيمة المضافة",
    description: "المبيعات حسب رمز الضريبة، والمدخلات، وصافي المستحق للفترة.",
  },
  {
    href: "/finance/reports/deferred",
    label: "الإيراد المؤجل والمحقق",
    description: "ما فُوتر من رسوم دراسية وما اعتُرف به شهرياً وما بقي مؤجلاً.",
  },
  {
    href: "/finance/reports/collections",
    label: "التحصيل مقابل المستهدف",
    description: "المحصّل حسب الطريقة واليوم وأمين الصندوق، ونسبة المستهدف.",
  },
  {
    href: "/finance/reports/discounts",
    label: "الخصومات والمنح",
    description: "إجمالي الخصومات حسب النوع والصف وعدد المستفيدين.",
  },
  {
    href: "/finance/reports/daily-cash",
    label: "حركة الصندوق اليومية",
    description: "سندات اليوم وورديات أمناء الصندوق وفروقاتها.",
  },
] as const;

const REPORT_TABS = [
  { href: "/finance/reports", label: "كل التقارير", exact: true },
  ...REPORTS.map((r) => ({ href: r.href, label: r.label })),
];

function ReportShell({
  title,
  controls,
  children,
  onCsv,
}: {
  title: string;
  controls?: ReactNode;
  children: ReactNode;
  onCsv?: () => void;
}) {
  const { tenant } = useApp();
  return (
    <ModuleShell
      nav={financeNav("finance-reports")}
      tabs={REPORT_TABS}
      title={title}
      crumbs={[{ title }]}
      wide
      actions={
        <>
          {onCsv ? (
            <Button size="sm" icon={<Download className="size-3.5" />} onClick={onCsv}>
              CSV
            </Button>
          ) : null}
          <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
            طباعة
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="hidden text-[13px] text-fg-3 print:block">{tenant.name}</p>
          <h1 className="text-[24px] font-bold">{title}</h1>
        </div>
        <div className="no-print flex flex-wrap items-center gap-3">{controls}</div>
      </div>
      {children}
    </ModuleShell>
  );
}

function Loading({ error }: { error?: { message: string } | null }) {
  return error ? (
    <EmptyState illustration="lock" title="تعذر عرض التقرير" description={error.message} />
  ) : (
    <SkeletonLines lines={12} />
  );
}

const dec = (minor: number) => minorToDecimalString(minor, "SAR");

export function ReportsIndex() {
  const { can } = useApp();
  return (
    <ModuleShell nav={financeNav("finance-reports")} tabs={REPORT_TABS} wide>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.filter((r) => r.href !== "/finance/reports/vat" || can("taxes", "view")).map((r) => (
          <Link
            key={r.href}
            href={r.href}
            className="rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] duration-[140ms] hover:-translate-y-px hover:shadow-card-hover"
          >
            <FileBarChart className="size-5 text-fg-3" />
            <p className="mt-2 text-[15px] font-semibold">{r.label}</p>
            <p className="mt-1 text-[13px] leading-6 text-fg-3">{r.description}</p>
          </Link>
        ))}
      </div>
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// ميزان المراجعة
// ---------------------------------------------------------------------

export function TrialBalanceReport() {
  const money = useMoney();
  const today = useToday();
  const [range, setRange] = useState({ from: yearStart(today), to: today });
  const [cc, setCc] = useState<string>("all");
  const [zero, setZero] = useState(false);
  const centers = trpc.finance.accounting.costCenters.useQuery(undefined, { retry: false });
  const q = trpc.finance.reports.trialBalance.useQuery({
    ...range,
    costCenterId: cc === "all" ? null : cc,
    includeZero: zero,
  });
  const d = q.data;
  const c = money.cell;
  const hasOpening = Boolean(d && (d.totals.openingDebit || d.totals.openingCredit));
  return (
    <ReportShell
      title="ميزان المراجعة"
      onCsv={
        d
          ? () =>
              downloadCsv(`trial-balance-${range.to}.csv`, [
                [
                  "code",
                  "account",
                  "opening_debit",
                  "opening_credit",
                  "debit",
                  "credit",
                  "closing_debit",
                  "closing_credit",
                ],
                ...d.rows.map((r) => [
                  r.code,
                  r.name,
                  dec(r.openingDebit),
                  dec(r.openingCredit),
                  dec(r.debit),
                  dec(r.credit),
                  dec(r.closingDebit),
                  dec(r.closingCredit),
                ]),
              ])
          : undefined
      }
      controls={
        <>
          <RangePicker from={range.from} to={range.to} onChange={setRange} />
          {centers.data?.rows.length ? (
            <Select
              size="sm"
              className="w-44"
              value={cc}
              onChange={setCc}
              options={[
                { value: "all", label: "كل مراكز التكلفة" },
                ...centers.data.rows.map((x) => ({ value: x.id, label: x.name })),
              ]}
            />
          ) : null}
          <label className="flex items-center gap-1.5 text-[13px] text-fg-2">
            <Checkbox checked={zero} onChange={setZero} /> الصفرية
          </label>
        </>
      }
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <p className="mb-2">
            {d.balanced ? (
              <Tag color="green">متوازن: مجموع المدين = مجموع الدائن</Tag>
            ) : (
              <Tag color="red">غير متوازن</Tag>
            )}
          </p>
          <FinTable
            dense
            head={
              <>
                <tr>
                  <th rowSpan={2}>الحساب</th>
                  {hasOpening ? (
                    <th colSpan={2} className="!text-center">
                      أول المدة
                    </th>
                  ) : null}
                  <th colSpan={2} className="!text-center">
                    الحركة
                  </th>
                  <th colSpan={2} className="!text-center">
                    الختامي
                  </th>
                </tr>
                <tr>
                  {(hasOpening
                    ? ["مدين", "دائن", "مدين", "دائن", "مدين", "دائن"]
                    : ["مدين", "دائن", "مدين", "دائن"]
                  ).map((h, i) => (
                    <th key={i} className={num}>
                      {h}
                    </th>
                  ))}
                </tr>
              </>
            }
            foot={
              <tr>
                <td>الإجمالي</td>
                {hasOpening ? <td className={num}>{c(d.totals.openingDebit)}</td> : null}
                {hasOpening ? <td className={num}>{c(d.totals.openingCredit)}</td> : null}
                <td className={num}>{c(d.totals.debit)}</td>
                <td className={num}>{c(d.totals.credit)}</td>
                <td className={num}>{c(d.totals.closingDebit)}</td>
                <td className={num}>{c(d.totals.closingCredit)}</td>
              </tr>
            }
          >
            {d.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/finance/accounting/accounts/${r.id}`} className="hover:underline">
                    <bdi dir="ltr" className="tabular text-fg-3">
                      {r.code}
                    </bdi>{" "}
                    {r.name}
                  </Link>
                </td>
                {hasOpening ? <td className={num}>{c(r.openingDebit)}</td> : null}
                {hasOpening ? <td className={num}>{c(r.openingCredit)}</td> : null}
                <td className={num}>{c(r.debit)}</td>
                <td className={num}>{c(r.credit)}</td>
                <td className={cn(num, "font-medium")}>{c(r.closingDebit)}</td>
                <td className={cn(num, "font-medium")}>{c(r.closingCredit)}</td>
              </tr>
            ))}
          </FinTable>
        </>
      )}
    </ReportShell>
  );
}

// ---------------------------------------------------------------------
// قائمة الدخل
// ---------------------------------------------------------------------

function shiftYear(iso: string, by: number) {
  return `${Number(iso.slice(0, 4)) + by}${iso.slice(4)}`;
}

export function IncomeStatementReport() {
  const money = useMoney();
  const prefs = usePrefs();
  const today = useToday();
  const [range, setRange] = useState({ from: yearStart(today), to: today });
  const [compare, setCompare] = useState(false);
  const [cc, setCc] = useState("all");
  const centers = trpc.finance.accounting.costCenters.useQuery(undefined, { retry: false });
  const q = trpc.finance.reports.incomeStatement.useQuery({
    ...range,
    compareFrom: compare ? shiftYear(range.from, -1) : null,
    compareTo: compare ? shiftYear(range.to, -1) : null,
    costCenterId: cc === "all" ? null : cc,
  });
  const branches = trpc.finance.reports.incomeByBranch.useQuery(range);
  const d = q.data;
  const cmpLabel = `${formatNumber(Number(range.from.slice(0, 4)) - 1, prefs.digits, { useGrouping: false })}`;
  const change = (a: number, b?: number) => (b ? formatPercent((a - b) / Math.abs(b), prefs.digits) : "—");
  return (
    <ReportShell
      title="قائمة الدخل"
      onCsv={
        d
          ? () =>
              downloadCsv(`income-${range.to}.csv`, [
                ["section", "code", "account", "amount", "compare"],
                ...d.sections.flatMap((s) =>
                  s.rows.map((r) => [
                    s.label,
                    r.code,
                    r.name,
                    dec(r.amount),
                    r.compare !== undefined ? dec(r.compare) : "",
                  ]),
                ),
                ["net", "", "", dec(d.net), d.compareNet !== undefined ? dec(d.compareNet) : ""],
              ])
          : undefined
      }
      controls={
        <>
          <RangePicker from={range.from} to={range.to} onChange={setRange} />
          {centers.data?.rows.length ? (
            <Select
              size="sm"
              className="w-44"
              value={cc}
              onChange={setCc}
              options={[
                { value: "all", label: "كل مراكز التكلفة" },
                ...centers.data.rows.map((x) => ({ value: x.id, label: x.name })),
              ]}
            />
          ) : null}
          <label className="flex items-center gap-1.5 text-[13px] text-fg-2">
            <Checkbox checked={compare} onChange={setCompare} /> مقارنة بالعام السابق
          </label>
        </>
      }
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure label="الإيرادات" value={money.fmt(d.sections[0]!.total)} />
            <Figure label="تكلفة الإيراد" value={money.fmt(d.sections[1]!.total)} />
            <Figure label="المصروفات التشغيلية" value={money.fmt(d.sections[2]!.total)} />
            <Figure
              label="صافي الدخل"
              value={money.fmt(d.net)}
              tone={d.net < 0 ? "danger" : "success"}
              hint={compare ? `مقابل ${money.fmt(d.compareNet ?? 0)} في ${cmpLabel}` : undefined}
            />
          </section>
          <FinTable
            head={
              <tr>
                <th>البند</th>
                <th className={num}>الفترة</th>
                {compare ? <th className={num}>{cmpLabel}</th> : null}
                {compare ? <th className={num}>التغير</th> : null}
              </tr>
            }
          >
            {d.sections.map((s, si) => (
              <SectionRows
                key={s.key}
                label={s.label}
                rows={s.rows}
                total={s.total}
                compareTotal={s.compareTotal}
                compare={compare}
                change={change}
                after={si === 1 ? { label: "مجمل الربح", value: d.grossProfit } : undefined}
              />
            ))}
            <tr className="bg-hover/60 text-[15px] font-bold">
              <td>صافي الدخل</td>
              <td className={num}>{money.fmt(d.net)}</td>
              {compare ? <td className={num}>{money.fmt(d.compareNet ?? 0)}</td> : null}
              {compare ? <td className={num}>{change(d.net, d.compareNet)}</td> : null}
            </tr>
          </FinTable>
          <p className="mt-2 text-[12px] text-fg-3">
            الإيرادات صافية بعد حساب «خصومات وإعفاءات ومنح» المقابل، والرسوم الدراسية تظهر عند الاعتراف الشهري
            لا عند الفوترة.
          </p>
          {branches.data && branches.data.length > 1 ? (
            <section className="mt-6">
              <h2 className="mb-2 text-[15px] font-semibold">حسب الفرع</h2>
              <FinTable
                dense
                head={
                  <tr>
                    <th>الفرع</th>
                    <th className={num}>الإيرادات</th>
                    <th className={num}>المصروفات</th>
                    <th className={num}>الصافي</th>
                  </tr>
                }
              >
                {branches.data.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td className={num}>{money.fmt(b.revenue, false)}</td>
                    <td className={num}>{money.fmt(b.expenses, false)}</td>
                    <td className={cn(num, "font-medium")}>{money.fmt(b.net, false)}</td>
                  </tr>
                ))}
              </FinTable>
            </section>
          ) : null}
        </>
      )}
    </ReportShell>
  );
}

function SectionRows({
  label,
  rows,
  total,
  compareTotal,
  compare,
  change,
  after,
}: {
  label: string;
  rows: Array<{ id: string; code: string; name: string; amount: number; compare?: number }>;
  total: number;
  compareTotal?: number;
  compare: boolean;
  change: (a: number, b?: number) => string;
  after?: { label: string; value: number };
}) {
  const money = useMoney();
  return (
    <>
      <tr className="font-semibold">
        <td colSpan={compare ? 4 : 2} className="!pt-4">
          {label}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.id}>
          <td className="ps-6">
            <Link href={`/finance/accounting/accounts/${r.id}`} className="hover:underline">
              {r.name}
            </Link>
          </td>
          <td className={num}>{money.fmt(r.amount, false)}</td>
          {compare ? (
            <td className={cn(num, "text-fg-3")}>
              {r.compare !== undefined ? money.fmt(r.compare, false) : "—"}
            </td>
          ) : null}
          {compare ? <td className={cn(num, "text-fg-3")}>{change(r.amount, r.compare)}</td> : null}
        </tr>
      ))}
      {!rows.length ? (
        <tr>
          <td colSpan={compare ? 4 : 2} className="ps-6 text-fg-3">
            لا حركة
          </td>
        </tr>
      ) : null}
      <tr className="font-semibold">
        <td>إجمالي {label.split(" ")[0]}</td>
        <td className={num}>{money.fmt(total, false)}</td>
        {compare ? <td className={num}>{money.fmt(compareTotal ?? 0, false)}</td> : null}
        {compare ? <td className={num}>{change(total, compareTotal)}</td> : null}
      </tr>
      {after ? (
        <tr className="bg-hover/40 font-semibold">
          <td>{after.label}</td>
          <td className={num}>{money.fmt(after.value, false)}</td>
          {compare ? <td /> : null}
          {compare ? <td /> : null}
        </tr>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------
// الميزانية العمومية
// ---------------------------------------------------------------------

export function BalanceSheetReport() {
  const money = useMoney();
  const today = useToday();
  const [asOf, setAsOf] = useState(today);
  const q = trpc.finance.reports.balanceSheet.useQuery({ asOf });
  const d = q.data;
  return (
    <ReportShell
      title="الميزانية العمومية"
      controls={
        <Input
          type="date"
          className="h-7 w-[150px] text-[13px]"
          value={asOf}
          onChange={(e) => e.target.value && setAsOf(e.target.value)}
          aria-label="في تاريخ"
        />
      }
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <p className="mb-3">
            {d.balanced ? (
              <Tag color="green">الأصول = الخصوم + حقوق الملكية</Tag>
            ) : (
              <Tag color="red">غير متوازنة</Tag>
            )}
          </p>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <BsBlock title="الأصول" rows={d.assets} total={d.totalAssets} />
            <div className="space-y-5">
              <BsBlock title="الخصوم" rows={d.liabilities} total={d.totalLiabilities} />
              <BsBlock
                title="حقوق الملكية"
                rows={d.equity}
                total={d.totalEquity}
                extra={{ label: "صافي دخل الفترة غير المقفل", amount: d.earnings }}
              />
              <Figure
                label="إجمالي الخصوم وحقوق الملكية"
                value={money.fmt(d.totalLiabilities + d.totalEquity)}
              />
            </div>
          </div>
        </>
      )}
    </ReportShell>
  );
}

function BsBlock({
  title,
  rows,
  total,
  extra,
}: {
  title: string;
  rows: Array<{ id: string; code: string; name: string; amount: number }>;
  total: number;
  extra?: { label: string; amount: number };
}) {
  const money = useMoney();
  return (
    <section>
      <h2 className="mb-2 text-[15px] font-semibold">{title}</h2>
      <FinTable
        dense
        head={
          <tr>
            <th>الحساب</th>
            <th className={num}>الرصيد</th>
          </tr>
        }
        foot={
          <tr>
            <td>الإجمالي</td>
            <td className={num}>{money.fmt(total)}</td>
          </tr>
        }
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>
              <Link href={`/finance/accounting/accounts/${r.id}`} className="hover:underline">
                <bdi dir="ltr" className="tabular text-fg-3">
                  {r.code}
                </bdi>{" "}
                {r.name}
              </Link>
            </td>
            <td className={num}>{money.fmt(r.amount, false)}</td>
          </tr>
        ))}
        {extra ? (
          <tr>
            <td>{extra.label}</td>
            <td className={num}>{money.fmt(extra.amount, false)}</td>
          </tr>
        ) : null}
      </FinTable>
    </section>
  );
}

// ---------------------------------------------------------------------
// التدفقات النقدية
// ---------------------------------------------------------------------

export function CashFlowReport() {
  const money = useMoney();
  const today = useToday();
  const [range, setRange] = useState({ from: yearStart(today), to: today });
  const q = trpc.finance.reports.cashFlow.useQuery(range);
  const d = q.data;
  return (
    <ReportShell
      title="قائمة التدفقات النقدية"
      controls={<RangePicker from={range.from} to={range.to} onChange={setRange} />}
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <FinTable
            head={
              <tr>
                <th>البند</th>
                <th className={num}>المبلغ</th>
              </tr>
            }
          >
            <tr className="font-semibold">
              <td>النقد وما في حكمه أول الفترة</td>
              <td className={num}>{money.fmt(d.opening)}</td>
            </tr>
            {d.sections.map((s) => (
              <SectionCash key={s.key} label={s.label} rows={s.rows} total={s.total} />
            ))}
            <tr className="font-semibold">
              <td>صافي التغير في النقد</td>
              <td className={num}>{money.fmt(d.net)}</td>
            </tr>
            <tr className="bg-hover/60 text-[15px] font-bold">
              <td>النقد وما في حكمه آخر الفترة</td>
              <td className={num}>{money.fmt(d.closing)}</td>
            </tr>
          </FinTable>
          <p className="mt-2 text-[12px] text-fg-3">
            الطريقة المباشرة من قيود حسابات النقد والبنوك؛ التحويلات الداخلية بينها مستبعدة.
          </p>
        </>
      )}
    </ReportShell>
  );
}

function SectionCash({
  label,
  rows,
  total,
}: {
  label: string;
  rows: Array<{ label: string; amount: number }>;
  total: number;
}) {
  const money = useMoney();
  return (
    <>
      <tr className="font-semibold">
        <td colSpan={2} className="!pt-4">
          {label}
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.label}>
          <td className="ps-6">{r.label}</td>
          <td className={num}>{money.fmt(r.amount, false)}</td>
        </tr>
      ))}
      <tr className="font-semibold">
        <td>صافي النقد من {label}</td>
        <td className={num}>{money.fmt(total, false)}</td>
      </tr>
    </>
  );
}

// ---------------------------------------------------------------------
// تقادم الذمم
// ---------------------------------------------------------------------

export function AgingReport() {
  const money = useMoney();
  const prefs = usePrefs();
  const today = useToday();
  const [asOf, setAsOf] = useState(today);
  const setup = trpc.finance.setup.get.useQuery(undefined, { retry: false });
  const [branch, setBranch] = useState("all");
  const q = trpc.finance.reports.aging.useQuery({ asOf, branchId: branch === "all" ? null : branch });
  const d = q.data;
  const keys = d?.buckets.map((b) => b.key) ?? [];
  return (
    <ReportShell
      title="تقادم ذمم أولياء الأمور"
      onCsv={
        d
          ? () =>
              downloadCsv(`aging-${asOf}.csv`, [
                [
                  "guardian",
                  "phone",
                  "students",
                  ...(d.buckets.map((b) => b.label) ?? []),
                  "total",
                  "oldest_days",
                ],
                ...d.rows.map((r) => [
                  r.guardian,
                  r.phone ?? "",
                  r.students.join(" / "),
                  ...keys.map((k) => dec(r.buckets[k])),
                  dec(r.total),
                  r.oldestDays,
                ]),
              ])
          : undefined
      }
      controls={
        <>
          <Input
            type="date"
            className="h-7 w-[150px] text-[13px]"
            value={asOf}
            onChange={(e) => e.target.value && setAsOf(e.target.value)}
            aria-label="في تاريخ"
          />
          {setup.data && setup.data.branches.length > 1 ? (
            <Select
              size="sm"
              className="w-40"
              value={branch}
              onChange={setBranch}
              options={[
                { value: "all", label: "كل الفروع" },
                ...setup.data.branches.map((b) => ({ value: b.id, label: b.name })),
              ]}
            />
          ) : null}
        </>
      }
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <ChartCard
              title="المستحق حسب شرائح التأخير"
              subtitle={`الإجمالي ${money.fmt(d.total)}`}
              table={{
                columns: ["الشريحة", "المبلغ"],
                rows: d.buckets.map((b) => [b.label, money.fmt(b.amount)]),
              }}
            >
              <HBars
                data={d.buckets.map((b) => ({ key: b.key, label: b.label, value: b.amount }))}
                format={(n) => money.fmt(n)}
                labelWidth={130}
              />
            </ChartCard>
            <div className="grid gap-3">
              <Figure label="إجمالي الذمم" value={money.fmt(d.total)} />
              <Figure label="أسر عليها مستحقات" value={formatNumber(d.rows.length, prefs.digits)} />
              <Figure
                label="متأخر أكثر من ٩٠ يوماً"
                value={money.fmt(d.buckets.find((b) => b.key === "d90p")?.amount ?? 0)}
                tone={(d.buckets.find((b) => b.key === "d90p")?.amount ?? 0) > 0 ? "danger" : undefined}
              />
            </div>
          </div>
          {d.rows.length ? (
            <FinTable
              dense
              head={
                <tr>
                  <th>ولي الأمر</th>
                  <th>الجوال</th>
                  {d.buckets.map((b) => (
                    <th key={b.key} className={num}>
                      {b.label}
                    </th>
                  ))}
                  <th className={num}>الإجمالي</th>
                </tr>
              }
            >
              {d.rows.map((r) => (
                <tr key={r.guardianId || r.guardian}>
                  <td>
                    {r.guardianId ? (
                      <Link href={`/finance/families/${r.guardianId}`} className="hover:underline">
                        {r.guardian}
                      </Link>
                    ) : (
                      r.guardian
                    )}
                    <span className="block text-[11px] text-fg-3">{r.students.join("، ")}</span>
                  </td>
                  <td>
                    {r.phone ? (
                      <bdi dir="ltr" className="tabular text-fg-2">
                        {r.phone}
                      </bdi>
                    ) : null}
                  </td>
                  {keys.map((k) => (
                    <td key={k} className={cn(num, k === "d90p" && r.buckets[k] ? "text-danger-700" : "")}>
                      {money.cell(r.buckets[k])}
                    </td>
                  ))}
                  <td className={cn(num, "font-semibold")}>{money.fmt(r.total, false)}</td>
                </tr>
              ))}
            </FinTable>
          ) : (
            <EmptyState compact illustration="table" title="لا ذمم مفتوحة" />
          )}
        </>
      )}
    </ReportShell>
  );
}

// ---------------------------------------------------------------------
// ضريبة القيمة المضافة
// ---------------------------------------------------------------------

function quarterOf(iso: string) {
  const y = Number(iso.slice(0, 4));
  const q = Math.floor((Number(iso.slice(5, 7)) - 1) / 3);
  const start = `${y}-${String(q * 3 + 1).padStart(2, "0")}-01`;
  const endMonth = q * 3 + 3;
  const end = new Date(Date.UTC(y, endMonth, 0)).toISOString().slice(0, 10);
  return { from: start, to: end };
}

export function VatReport() {
  const money = useMoney();
  const prefs = usePrefs();
  const today = useToday();
  const [range, setRange] = useState(quarterOf(today));
  const q = trpc.finance.reports.vat.useQuery(range);
  const d = q.data;
  return (
    <ReportShell
      title="إقرار ضريبة القيمة المضافة"
      controls={
        <>
          <RangePicker from={range.from} to={range.to} onChange={setRange} />
          <Button size="xs" variant="ghost" onClick={() => setRange(quarterOf(today))}>
            الربع الحالي
          </Button>
        </>
      }
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Figure label="ضريبة المخرجات" value={money.fmt(d.output)} />
            <Figure label="ضريبة المدخلات" value={money.fmt(d.input)} />
            <Figure
              label={d.net >= 0 ? "صافي المستحق للهيئة" : "صافي القابل للاسترداد"}
              value={money.fmt(Math.abs(d.net))}
              tone={d.net > 0 ? "warning" : "success"}
            />
          </section>
          <h2 className="mb-2 text-[15px] font-semibold">المبيعات</h2>
          <FinTable
            dense
            head={
              <tr>
                <th>الفئة</th>
                <th className={num}>النسبة</th>
                <th className={num}>المبلغ الخاضع</th>
                <th className={num}>الضريبة</th>
              </tr>
            }
          >
            {d.sales.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className={num}>{formatPercent(s.rateBp / 10000, prefs.digits)}</td>
                <td className={num}>{money.fmt(s.base, false)}</td>
                <td className={num}>{money.fmt(s.tax, false)}</td>
              </tr>
            ))}
            <tr className="text-fg-2">
              <td>تعديلات (إشعارات دائنة)</td>
              <td />
              <td className={num}>{money.fmt(d.salesAdjustments.base, false)}</td>
              <td className={num}>{money.fmt(d.salesAdjustments.tax, false)}</td>
            </tr>
          </FinTable>
          <h2 className="mb-2 mt-5 text-[15px] font-semibold">المشتريات والمصروفات</h2>
          <FinTable
            dense
            head={
              <tr>
                <th>الفئة</th>
                <th className={num}>المبلغ</th>
                <th className={num}>الضريبة</th>
              </tr>
            }
          >
            <tr>
              <td>مشتريات خاضعة بالنسبة الأساسية</td>
              <td className={num}>{money.fmt(d.purchases.base, false)}</td>
              <td className={num}>{money.fmt(d.purchases.tax, false)}</td>
            </tr>
            <tr>
              <td>مشتريات معفاة أو خارج النطاق</td>
              <td className={num}>{money.fmt(d.purchases.exemptBase, false)}</td>
              <td className={num}>—</td>
            </tr>
          </FinTable>
          <p className="mt-3 rounded-md bg-hover px-3 py-2 text-[12px] leading-6 text-fg-2">
            للمراجعة قبل التقديم: الأرقام من الدفاتر (حسابي المخرجات والمدخلات) ومن الفواتير حسب رمز الضريبة.
            الربط الإلكتروني مع منصة «فاتورة» (المرحلة الثانية) غير مفعّل في هذا الإصدار.
          </p>
        </>
      )}
    </ReportShell>
  );
}

// ---------------------------------------------------------------------
// الإيراد المؤجل
// ---------------------------------------------------------------------

export function DeferredReport() {
  const money = useMoney();
  const prefs = usePrefs();
  const setup = trpc.finance.setup.get.useQuery(undefined, { retry: false });
  const [year, setYear] = useState<string>("all");
  const q = trpc.finance.reports.deferred.useQuery({ academicYearId: year === "all" ? null : year });
  const d = q.data;
  return (
    <ReportShell
      title="الإيراد المؤجل مقابل المحقق"
      controls={
        setup.data ? (
          <Select
            size="sm"
            className="w-48"
            value={year}
            onChange={setYear}
            options={[
              { value: "all", label: "كل الأعوام" },
              ...setup.data.years.map((y) => ({ value: y.id, label: y.name })),
            ]}
          />
        ) : null
      }
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure label="المفوتر (بعد الإشعارات)" value={money.fmt(d.totals.billed)} />
            <Figure label="المعترف به" value={money.fmt(d.totals.recognized)} tone="success" />
            <Figure label="المتبقي مؤجلاً" value={money.fmt(d.totals.deferred)} />
            <Figure
              label="رصيد حساب الإيراد المؤجل"
              value={money.fmt(d.ledgerBalance)}
              tone={year === "all" && d.ledgerBalance !== d.totals.deferred ? "danger" : undefined}
              hint={
                year === "all"
                  ? d.ledgerBalance === d.totals.deferred
                    ? "مطابق للتفاصيل"
                    : "لا يطابق التفاصيل؛ راجع القيود اليدوية"
                  : "لكل الأعوام"
              }
            />
          </section>
          <FinTable
            dense
            head={
              <tr>
                <th>حساب الإيراد</th>
                <th className={num}>المفوتر</th>
                <th className={num}>المعترف به</th>
                <th className={num}>المؤجل</th>
                <th className={num}>نسبة الاعتراف</th>
              </tr>
            }
          >
            {d.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/finance/accounting/accounts/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className={num}>{money.fmt(r.billed, false)}</td>
                <td className={num}>{money.fmt(r.recognized, false)}</td>
                <td className={num}>{money.fmt(r.deferred, false)}</td>
                <td className={num}>
                  {r.billed ? formatPercent(r.recognized / r.billed, prefs.digits) : "—"}
                </td>
              </tr>
            ))}
          </FinTable>
          <p className="mt-2 text-[12px] text-fg-3">
            تُعترف الرسوم الدراسية بالتساوي على أشهر العام الدراسي، من قائمة إقفال كل فترة.
          </p>
        </>
      )}
    </ReportShell>
  );
}

// ---------------------------------------------------------------------
// التحصيل
// ---------------------------------------------------------------------

export function CollectionsReport() {
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const today = useToday();
  const [range, setRange] = useState({ from: monthStart(today), to: today });
  const q = trpc.finance.reports.collections.useQuery(range);
  const d = q.data;
  const rate = d && d.due ? d.dueCollected / d.due : null;
  return (
    <ReportShell
      title="التحصيل مقابل المستهدف"
      controls={<RangePicker from={range.from} to={range.to} onChange={setRange} />}
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure
              label="المحصّل"
              value={money.fmt(d.collected)}
              hint={`${formatNumber(d.count, prefs.digits)} سند`}
            />
            <Figure label="أقساط مستحقة في الفترة" value={money.fmt(d.due)} />
            <Figure label="المستهدف" value={money.fmt(d.target)} />
            <Figure
              label="نسبة تحصيل المستحق"
              value={rate === null ? "—" : formatPercent(rate, prefs.digits)}
              tone={
                rate !== null && d.dueCollected >= d.target
                  ? "success"
                  : rate !== null
                    ? "warning"
                    : undefined
              }
            />
          </section>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              className="lg:col-span-2"
              title="المحصّل يومياً"
              table={{
                columns: ["اليوم", "المبلغ"],
                rows: d.byDay.map((x) => [fmtDate(x.date), money.fmt(x.amount)]),
              }}
            >
              {d.byDay.length ? (
                <Columns
                  data={d.byDay.map((x) => ({
                    key: x.date,
                    label: fmtDate(x.date).split(" ")[0]!,
                    value: x.amount,
                  }))}
                  format={(n) => money.fmt(n)}
                />
              ) : (
                <EmptyState compact title="لا تحصيل في الفترة" />
              )}
            </ChartCard>
            <ChartCard
              title="حسب طريقة الدفع"
              table={{
                columns: ["الطريقة", "المبلغ"],
                rows: d.byMethod.map((x) => [
                  PAYMENT_METHOD[x.method as PaymentMethodKey].label,
                  money.fmt(x.amount),
                ]),
              }}
            >
              <HBars
                data={d.byMethod
                  .sort((a, b) => b.amount - a.amount)
                  .map((x) => ({
                    key: x.method,
                    label: PAYMENT_METHOD[x.method as PaymentMethodKey].label,
                    value: x.amount,
                  }))}
                format={(n) => money.fmt(n)}
              />
            </ChartCard>
            <ChartCard
              title="حسب أمين الصندوق"
              table={{
                columns: ["المستخدم", "المبلغ"],
                rows: d.byCashier.map((x) => [x.name, money.fmt(x.amount)]),
              }}
            >
              <HBars
                data={d.byCashier.map((x) => ({ key: x.name, label: x.name, value: x.amount }))}
                format={(n) => money.fmt(n)}
              />
            </ChartCard>
          </div>
        </>
      )}
    </ReportShell>
  );
}

// ---------------------------------------------------------------------
// الخصومات
// ---------------------------------------------------------------------

export function DiscountsReport() {
  const money = useMoney();
  const prefs = usePrefs();
  const setup = trpc.finance.setup.get.useQuery(undefined, { retry: false });
  const [year, setYear] = useState<string>("all");
  const q = trpc.finance.reports.discounts.useQuery({ academicYearId: year === "all" ? null : year });
  const d = q.data;
  return (
    <ReportShell
      title="الخصومات والمنح"
      controls={
        setup.data ? (
          <Select
            size="sm"
            className="w-48"
            value={year}
            onChange={setYear}
            options={[
              { value: "all", label: "كل الأعوام" },
              ...setup.data.years.map((y) => ({ value: y.id, label: y.name })),
            ]}
          />
        ) : null
      }
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Figure label="إجمالي الخصومات" value={money.fmt(d.total)} />
            <Figure
              label="نسبتها من رسوم البنود المخصومة"
              value={
                d.grossOnDiscounted ? formatPercent(d.total / d.grossOnDiscounted, prefs.digits, 1) : "—"
              }
            />
            <Figure
              label="طلاب مستفيدون"
              value={formatNumber(
                d.byType.reduce((s, t) => Math.max(s, t.students), 0),
                prefs.digits,
              )}
              hint="أكبر عدد في نوع واحد"
            />
          </section>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard
              title="حسب نوع الخصم"
              table={{
                columns: ["النوع", "المبلغ", "الطلاب"],
                rows: d.byType.map((t) => [t.name, money.fmt(t.amount), t.students]),
              }}
            >
              {d.byType.length ? (
                <HBars
                  data={d.byType.map((t) => ({
                    key: t.name,
                    label: t.name,
                    value: t.amount,
                    hint: `${formatNumber(t.students, prefs.digits)} طالباً`,
                  }))}
                  format={(n) => money.fmt(n)}
                  labelWidth={160}
                />
              ) : (
                <EmptyState compact title="لا خصومات" />
              )}
            </ChartCard>
            <ChartCard
              title="حسب الصف"
              table={{
                columns: ["الصف", "المبلغ"],
                rows: d.byGrade.map((g) => [g.grade, money.fmt(g.amount)]),
              }}
            >
              {d.byGrade.length ? (
                <HBars
                  data={d.byGrade.map((g) => ({ key: g.grade, label: g.grade, value: g.amount }))}
                  format={(n) => money.fmt(n)}
                  labelWidth={160}
                />
              ) : (
                <EmptyState compact title="لا خصومات" />
              )}
            </ChartCard>
          </div>
        </>
      )}
    </ReportShell>
  );
}

// ---------------------------------------------------------------------
// حركة الصندوق اليومية
// ---------------------------------------------------------------------

export function DailyCashReport() {
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const today = useToday();
  const [date, setDate] = useState(today);
  const q = trpc.finance.reports.dailyCash.useQuery({ date });
  const d = q.data;
  return (
    <ReportShell
      title="حركة الصندوق اليومية"
      controls={
        <Input
          type="date"
          className="h-7 w-[150px] text-[13px]"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="اليوم"
        />
      }
    >
      {!d ? (
        <Loading error={q.error} />
      ) : (
        <>
          <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Figure label="سندات اليوم" value={formatNumber(d.totals.count, prefs.digits)} />
            <Figure label="إجمالي المحصّل" value={money.fmt(d.totals.amount)} />
            <Figure label="منها نقداً" value={money.fmt(d.totals.cash)} />
          </section>
          {d.sessions.length ? (
            <section className="mb-5">
              <h2 className="mb-2 text-[15px] font-semibold">الورديات</h2>
              <FinTable
                dense
                head={
                  <tr>
                    <th>أمين الصندوق</th>
                    <th>الحالة</th>
                    <th className={num}>العهدة</th>
                    <th className={num}>المتوقع</th>
                    <th className={num}>المعدود</th>
                    <th className={num}>الفرق</th>
                  </tr>
                }
              >
                {d.sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{s.cashier ?? "—"}</td>
                    <td>
                      {s.status === "OPEN" ? (
                        <Tag size="sm" color="green">
                          مفتوحة
                        </Tag>
                      ) : (
                        <Tag size="sm" color="slate">
                          مغلقة
                        </Tag>
                      )}
                    </td>
                    <td className={num}>{money.fmt(s.openingFloatMinor, false)}</td>
                    <td className={num}>
                      {s.expectedMinor !== null ? money.fmt(s.expectedMinor, false) : "—"}
                    </td>
                    <td className={num}>
                      {s.countedMinor !== null ? money.fmt(s.countedMinor, false) : "—"}
                    </td>
                    <td className={cn(num, s.differenceMinor ? "text-warning-700" : "")}>
                      {s.differenceMinor ? money.fmt(s.differenceMinor, false) : "—"}
                    </td>
                  </tr>
                ))}
              </FinTable>
            </section>
          ) : null}
          <h2 className="mb-2 text-[15px] font-semibold">السندات</h2>
          {d.receipts.length ? (
            <FinTable
              dense
              head={
                <tr>
                  <th>الرقم</th>
                  <th>الدافع</th>
                  <th>الطريقة</th>
                  <th>أمين الصندوق</th>
                  <th className={num}>المبلغ</th>
                </tr>
              }
            >
              {d.receipts.map((r) => (
                <tr key={r.id} className={cn(r.status === "VOID" && "text-fg-3 line-through")}>
                  <td>
                    <Link href={`/finance/receipts/${r.id}`} className="tabular hover:underline">
                      {docNo(r.number, prefs.digits)}
                    </Link>
                  </td>
                  <td>{r.payer}</td>
                  <td>{PAYMENT_METHOD[r.method].label}</td>
                  <td className="text-fg-2">{r.cashier ?? "—"}</td>
                  <td className={num}>{money.fmt(r.amount, false)}</td>
                </tr>
              ))}
            </FinTable>
          ) : (
            <EmptyState compact illustration="table" title={`لا سندات في ${fmtDate(date)}`} />
          )}
        </>
      )}
    </ReportShell>
  );
}
