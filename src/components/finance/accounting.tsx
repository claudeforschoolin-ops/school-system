"use client";
/**
 * المحاسبة العامة: دفتر اليومية، القيد اليدوي بمؤشر توازن حيّ، صفحة القيد (عكس القيود اليدوية)،
 * دليل الحسابات شجرياً بأرصدته، دفتر الأستاذ لحساب، الفترات وقائمة الإقفال، ومراكز التكلفة.
 */
import { BookOpen, CheckCircle2, ChevronDown, ChevronLeft, CircleAlert, CircleX, FilePlus2, Lock, LockOpen, Pencil, Plus, Scale, Sparkles, Trash2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ACCOUNT_TYPE, JOURNAL_SOURCE, type AccountTypeKey, type JournalSourceKey } from "@/lib/finance/labels";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { ACCOUNTING_TABS, DocLink, Figure, FinTable, financeNav, MoneyInput, monthStart, num, RangePicker, useFmtDate, useMoney, useToday, yearStart, docNo } from "./common";

type Account = RouterOutputs["finance"]["accounting"]["chart"]["accounts"][number];
const SOURCES = Object.keys(JOURNAL_SOURCE) as JournalSourceKey[];

// ---------------------------------------------------------------------
// دفتر اليومية
// ---------------------------------------------------------------------

export function JournalPage() {
  const { can } = useApp();
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const today = useToday();
  const [range, setRange] = useState({ from: monthStart(today), to: today });
  const [source, setSource] = useState<JournalSourceKey | "all">("all");
  const [search, setSearch] = useState("");
  const [cursors, setCursors] = useState<number[]>([]);
  const q = trpc.finance.accounting.entries.useQuery({ ...range, source: source === "all" ? null : source, q: search.trim() || null, cursor: cursors.at(-1) ?? null });
  const rows = q.data?.rows ?? [];
  return (
    <ModuleShell
      nav={financeNav("accounting")}
      tabs={ACCOUNTING_TABS}
      wide
      actions={
        can("accounting", "create") ? (
          <Link href="/finance/accounting/new">
            <Button size="sm" variant="primary" icon={<FilePlus2 className="size-3.5" />}>
              قيد يدوي
            </Button>
          </Link>
        ) : null
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <RangePicker from={range.from} to={range.to} onChange={(r) => (setRange(r), setCursors([]))} />
        <Select size="sm" className="w-48" value={source} onChange={(v) => (setSource(v as JournalSourceKey | "all"), setCursors([]))} options={[{ value: "all", label: "كل المصادر" }, ...SOURCES.map((s) => ({ value: s, label: JOURNAL_SOURCE[s].label }))]} />
        <Input className="h-7 w-56 text-[13px]" placeholder="رقم القيد، البيان، المرجع" value={search} onChange={(e) => (setSearch(e.target.value), setCursors([]))} />
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض القيود" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={12} />
      ) : rows.length ? (
        <>
          <FinTable
            head={
              <tr>
                <th>رقم القيد</th>
                <th>التاريخ</th>
                <th>البيان</th>
                <th>المصدر</th>
                <th>المرجع</th>
                <th>أنشأه</th>
                <th className={num}>المبلغ</th>
              </tr>
            }
          >
            {rows.map((e) => (
              <tr key={e.id} className={cn(e.isReversed && "text-fg-3")}>
                <td>
                  <Link href={`/finance/accounting/entries/${e.id}`} className="tabular font-medium hover:underline">
                    {docNo(e.number, prefs.digits)}
                  </Link>
                  {e.periodClosed ? <Lock className="ms-1 inline size-3 text-fg-3" aria-label="فترة مقفلة" /> : null}
                </td>
                <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                <td className="max-w-[360px] truncate">
                  {e.description}
                  {e.isReversed ? <Tag size="sm" color="red" className="ms-1">معكوس</Tag> : null}
                  {e.postedInClosedPeriod ? <Tag size="sm" color="orange" className="ms-1">في فترة مقفلة</Tag> : null}
                </td>
                <td>
                  <Tag size="sm" color={JOURNAL_SOURCE[e.source].color}>
                    {JOURNAL_SOURCE[e.source].label}
                  </Tag>
                </td>
                <td>
                  <bdi dir="ltr" className="tabular text-fg-2">
                    {e.reference ?? ""}
                  </bdi>
                </td>
                <td className="text-fg-2">{e.createdBy ?? "النظام"}</td>
                <td className={num}>{money.fmt(e.totalMinor, false)}</td>
              </tr>
            ))}
          </FinTable>
          <div className="mt-3 flex justify-between">
            <Button size="sm" variant="ghost" disabled={!cursors.length} onClick={() => setCursors(cursors.slice(0, -1))}>
              الأحدث
            </Button>
            <Button size="sm" variant="ghost" disabled={!q.data.nextCursor} onClick={() => setCursors([...cursors, q.data!.nextCursor!])}>
              الأقدم
            </Button>
          </div>
        </>
      ) : (
        <EmptyState compact illustration="table" title="لا قيود بهذه المعايير" description="القيود الآلية تُنشأ من الفواتير والسندات، ويمكن إضافة قيد يدوي." />
      )}
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// القيد اليدوي
// ---------------------------------------------------------------------

type Line = { key: number; accountId: string | null; debit: number | null; credit: number | null; costCenterId: string | null; description: string };

export function ManualEntryPage() {
  const { can } = useApp();
  const router = useRouter();
  const money = useMoney();
  const today = useToday();
  const chart = trpc.finance.accounting.chart.useQuery({});
  const centers = trpc.finance.accounting.costCenters.useQuery();
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { key: 1, accountId: null, debit: null, credit: null, costCenterId: null, description: "" },
    { key: 2, accountId: null, debit: null, credit: null, costCenterId: null, description: "" },
  ]);
  const [closedReason, setClosedReason] = useState("");
  const [allowClosed, setAllowClosed] = useState(false);
  const create = trpc.finance.accounting.createEntry.useMutation({
    onSuccess: (e) => {
      toast.success(`رُحّل القيد رقم ${e.number}`);
      router.push(`/finance/accounting/entries/${e.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const accounts = (chart.data?.accounts ?? []).filter((a) => !a.isGroup && a.isActive);
  const debit = lines.reduce((s, l) => s + (l.debit ?? 0), 0);
  const credit = lines.reduce((s, l) => s + (l.credit ?? 0), 0);
  const diff = debit - credit;
  const filled = lines.filter((l) => l.accountId && ((l.debit ?? 0) > 0 || (l.credit ?? 0) > 0));
  const bothSides = lines.some((l) => (l.debit ?? 0) > 0 && (l.credit ?? 0) > 0);
  const valid = filled.length >= 2 && diff === 0 && debit > 0 && !bothSides && description.trim().length >= 3 && (!allowClosed || closedReason.trim().length >= 5);
  const set = (key: number, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines([...lines, { key: Math.max(...lines.map((l) => l.key)) + 1, accountId: null, debit: null, credit: null, costCenterId: null, description: "" }]);
  if (!can("accounting", "create")) {
    return (
      <ModuleShell nav={financeNav("accounting")} tabs={ACCOUNTING_TABS} title="قيد يدوي">
        <EmptyState illustration="lock" title="القيود اليدوية من صلاحية المحاسب" />
      </ModuleShell>
    );
  }
  return (
    <ModuleShell nav={financeNav("accounting")} tabs={ACCOUNTING_TABS} title="قيد يدوي" crumbs={[{ title: "قيد يدوي" }]} wide>
      <div className="mb-4 grid gap-3 md:grid-cols-[160px_1fr_200px]">
        <Field label="التاريخ">
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <Field label="البيان">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="مثال: إثبات مصروف كهرباء شهر أغسطس المستحق" autoFocus />
        </Field>
        <Field label="المرجع (اختياري)">
          <Input dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
        <table className="w-full min-w-[860px] text-[13px]">
          <thead className="text-fg-3">
            <tr className="[&_th]:border-b [&_th]:border-line [&_th]:px-2 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium">
              <th className="w-[30%]">الحساب</th>
              <th className="w-[140px] text-end">مدين</th>
              <th className="w-[140px] text-end">دائن</th>
              <th className="w-[170px]">مركز التكلفة</th>
              <th>بيان السطر</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="[&_td]:border-b [&_td]:border-line/60 [&_td]:px-2 [&_td]:py-1.5 align-top">
                <td>
                  <AccountSelect accounts={accounts} value={l.accountId} onChange={(v) => set(l.key, { accountId: v })} />
                </td>
                <td>
                  <MoneyInput value={l.debit} onChange={(v) => set(l.key, { debit: v, ...(v ? { credit: null } : {}) })} aria-label="مدين" onEnter={addLine} />
                </td>
                <td>
                  <MoneyInput value={l.credit} onChange={(v) => set(l.key, { credit: v, ...(v ? { debit: null } : {}) })} aria-label="دائن" onEnter={addLine} />
                </td>
                <td>
                  <Select size="sm" value={l.costCenterId ?? "none"} onChange={(v) => set(l.key, { costCenterId: v === "none" ? null : v })} options={[{ value: "none", label: "—" }, ...(centers.data?.rows ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))]} />
                </td>
                <td>
                  <Input className="h-7 text-[13px]" value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} />
                </td>
                <td>
                  <Button size="icon-sm" variant="ghost" aria-label="حذف السطر" disabled={lines.length <= 2} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold [&_td]:px-2 [&_td]:py-2">
              <td>
                <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={addLine}>
                  سطر
                </Button>
              </td>
              <td className={num}>{money.fmt(debit, false)}</td>
              <td className={num}>{money.fmt(credit, false)}</td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <BalanceIndicator diff={diff} total={debit} />
        {can("accounting_periods", "approve") ? (
          <label className="flex items-center gap-2 text-[13px] text-fg-2">
            <Switch checked={allowClosed} onChange={setAllowClosed} />
            الترحيل في فترة مقفلة (يُسجل في سجل التدقيق)
          </label>
        ) : null}
        {allowClosed ? <Input className="h-7 w-64 text-[13px]" placeholder="سبب الترحيل في الفترة المقفلة" value={closedReason} onChange={(e) => setClosedReason(e.target.value)} /> : null}
        <span className="flex-1" />
        <Button
          variant="primary"
          icon={<CheckCircle2 className="size-3.5" />}
          loading={create.isPending}
          disabled={!valid}
          onClick={() =>
            create.mutate({
              date,
              description,
              reference: reference || null,
              lines: filled.map((l) => ({ accountId: l.accountId!, debit: l.debit ?? 0, credit: l.credit ?? 0, costCenterId: l.costCenterId, description: l.description || null })),
              allowClosedPeriod: allowClosed,
              closedReason: allowClosed ? closedReason : null,
            })
          }
        >
          ترحيل القيد
        </Button>
      </div>
      {bothSides ? <p className="mt-2 text-[13px] text-danger-700">السطر الواحد إما مدين أو دائن.</p> : null}
      <p className="mt-2 text-[12px] text-fg-3">بعد الترحيل لا يُعدَّل القيد ولا يُحذف؛ التصحيح بقيد عكسي. قاعدة البيانات نفسها ترفض أي قيد غير متوازن.</p>
    </ModuleShell>
  );
}

/** مؤشر التوازن الحيّ */
export function BalanceIndicator({ diff, total }: { diff: number; total: number }) {
  const money = useMoney();
  const ok = diff === 0 && total > 0;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="balance-indicator"
      data-balanced={ok}
      className={cn("flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium", ok ? "bg-success-50 text-success-800" : total === 0 ? "bg-hover text-fg-3" : "bg-danger-50 text-danger-700")}
    >
      {ok ? <Scale className="size-4" /> : total === 0 ? <Scale className="size-4" /> : <CircleAlert className="size-4" />}
      {ok ? "القيد متوازن" : total === 0 && diff === 0 ? "أدخل المبالغ" : `غير متوازن: الفرق ${money.fmt(Math.abs(diff))} ${diff > 0 ? "زيادة في المدين" : "زيادة في الدائن"}`}
    </div>
  );
}

/** منتقي حساب بالبحث بالرمز أو الاسم */
function AccountSelect({ accounts, value, onChange }: { accounts: Account[]; value: string | null; onChange: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const cur = accounts.find((a) => a.id === value);
  const list = accounts.filter((a) => !q || a.code.startsWith(q) || a.name.includes(q)).slice(0, 40);
  return (
    <div className="relative">
      <Input
        className="h-8 text-[13px]"
        placeholder="رمز أو اسم الحساب"
        value={open ? q : cur ? `${cur.code} — ${cur.name}` : ""}
        onFocus={() => (setOpen(true), setQ(""))}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && list[0]) {
            e.preventDefault();
            onChange(list[0].id);
            setOpen(false);
            (e.target as HTMLInputElement).blur();
          }
        }}
        aria-label="الحساب"
      />
      {open ? (
        <ul className="anim-menu absolute inset-x-0 top-9 z-30 max-h-64 overflow-y-auto rounded-[10px] bg-elevated p-1 shadow-popover thin-scroll">
          {list.length ? (
            list.map((a) => (
              <li key={a.id}>
                <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-start text-[13px] hover:bg-hover" onMouseDown={(e) => (e.preventDefault(), onChange(a.id), setOpen(false))}>
                  <bdi dir="ltr" className="tabular text-fg-3">
                    {a.code}
                  </bdi>
                  <span className="flex-1 truncate">{a.name}</span>
                  <Tag size="sm" color={ACCOUNT_TYPE[a.type as AccountTypeKey].color}>
                    {ACCOUNT_TYPE[a.type as AccountTypeKey].label}
                  </Tag>
                </button>
              </li>
            ))
          ) : (
            <li className="px-2 py-2 text-[13px] text-fg-3">لا حساب مطابق</li>
          )}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------
// صفحة القيد
// ---------------------------------------------------------------------

export function EntryDetail({ id }: { id: string }) {
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const q = trpc.finance.accounting.entry.useQuery({ id });
  const utils = trpc.useUtils();
  const [reversing, setReversing] = useState(false);
  const [reason, setReason] = useState("");
  const reverse = trpc.finance.accounting.reverse.useMutation({
    onSuccess: () => {
      toast.success("رُحّل القيد العكسي");
      setReversing(false);
      void utils.finance.accounting.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const e = q.data;
  const nav = financeNav("accounting");
  if (q.error) {
    return (
      <ModuleShell nav={nav} tabs={ACCOUNTING_TABS} title="قيد">
        <EmptyState illustration="lock" title="لا يمكن عرض القيد" description={q.error.message} />
      </ModuleShell>
    );
  }
  const title = e ? `قيد رقم ${docNo(e.number, prefs.digits)}` : "قيد";
  const totalD = e?.lines.reduce((s, l) => s + l.debit, 0) ?? 0;
  const totalC = e?.lines.reduce((s, l) => s + l.credit, 0) ?? 0;
  return (
    <ModuleShell
      nav={nav}
      title={title}
      crumbs={[{ title: "دفتر اليومية", href: "/finance/accounting" }, ...(e ? [{ title }] : [])]}
      wide
      actions={
        e?.canReverse ? (
          <Button size="sm" icon={<Undo2 className="size-3.5" />} onClick={() => setReversing(true)}>
            قيد عكسي
          </Button>
        ) : null
      }
    >
      {!e ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <header className="mb-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={JOURNAL_SOURCE[e.source].color}>{JOURNAL_SOURCE[e.source].label}</Tag>
              <Tag color={e.period.status === "CLOSED" ? "slate" : "green"}>
                {e.period.name} · {e.period.status === "CLOSED" ? "مقفلة" : "مفتوحة"}
              </Tag>
              {e.isReversed ? <Tag color="red">معكوس</Tag> : null}
              {e.postedInClosedPeriod ? <Tag color="orange">رُحّل في فترة مقفلة</Tag> : null}
            </div>
            <h1 className="mt-2 text-[24px] font-bold">{e.description}</h1>
            <p className="mt-1 text-[13px] text-fg-3">
              {fmtDate(e.date, "long")} · {e.createdBy ?? "النظام"}
              {e.reference ? (
                <>
                  {" · "}مرجع <bdi dir="ltr">{e.reference}</bdi>
                </>
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-4 text-[13px]">
              {e.sourceLink ? (
                <Link href={e.sourceLink} className="text-fg-2 underline decoration-line underline-offset-4">
                  المستند المصدر
                </Link>
              ) : null}
              {e.reversal ? (
                <Link href={`/finance/accounting/entries/${e.reversal.id}`} className="text-fg-2 underline decoration-line underline-offset-4">
                  القيد العكسي رقم {docNo(e.reversal.number, prefs.digits)}
                </Link>
              ) : null}
              {e.original ? (
                <Link href={`/finance/accounting/entries/${e.original.id}`} className="text-fg-2 underline decoration-line underline-offset-4">
                  يعكس القيد رقم {docNo(e.original.number, prefs.digits)}
                </Link>
              ) : null}
            </div>
          </header>
          <FinTable
            head={
              <tr>
                <th>الحساب</th>
                <th>البيان</th>
                <th>مركز التكلفة</th>
                <th>الطالب</th>
                <th className={num}>مدين</th>
                <th className={num}>دائن</th>
              </tr>
            }
            foot={
              <tr>
                <td colSpan={4}>
                  <span className="flex items-center gap-2">
                    الإجمالي {totalD === totalC ? <Tag size="sm" color="green">متوازن</Tag> : <Tag size="sm" color="red">غير متوازن</Tag>}
                  </span>
                </td>
                <td className={num}>{money.fmt(totalD, false)}</td>
                <td className={num}>{money.fmt(totalC, false)}</td>
              </tr>
            }
          >
            {e.lines.map((l) => (
              <tr key={l.id}>
                <td>
                  <Link href={`/finance/accounting/accounts/${l.accountId}`} className="hover:underline">
                    <bdi dir="ltr" className="tabular text-fg-3">
                      {l.code}
                    </bdi>{" "}
                    {l.name}
                  </Link>
                  {l.reconciled ? <Tag size="sm" color="teal" className="ms-1">مطابق بنكياً</Tag> : null}
                </td>
                <td className="text-fg-2">{l.description ?? ""}</td>
                <td className="text-fg-2">{l.costCenter ?? ""}</td>
                <td className="text-fg-2">{l.student ?? ""}</td>
                <td className={num}>{money.cell(l.debit)}</td>
                <td className={num}>{money.cell(l.credit)}</td>
              </tr>
            ))}
          </FinTable>
          <p className="mt-2 text-[12px] text-fg-3">القيود المرحّلة غير قابلة للتعديل أو الحذف (تفرضه قاعدة البيانات)؛ التصحيح بقيد عكسي فقط.</p>
        </>
      )}
      <Dialog open={reversing} onOpenChange={setReversing}>
        <DialogContent title="قيد عكسي" description="يُرحّل قيد بعكس كل السطور بتاريخ اليوم، ويُعلَّم الأصل «معكوس».">
          <div className="px-5 pb-4">
            <Field label="السبب">
              <Textarea value={reason} onChange={(ev) => setReason(ev.target.value)} autoFocus />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReversing(false)}>
              تراجع
            </Button>
            <Button variant="primary" loading={reverse.isPending} disabled={reason.trim().length < 3} onClick={() => reverse.mutate({ id, reason })}>
              ترحيل القيد العكسي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// دليل الحسابات
// ---------------------------------------------------------------------

export function ChartOfAccounts() {
  const money = useMoney();
  const q = trpc.finance.accounting.chart.useQuery({});
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [showZero, setShowZero] = useState(true);
  const accounts = useMemo(() => q.data?.accounts ?? [], [q.data]);
  const children = useMemo(() => {
    const m = new Map<string | null, Account[]>();
    for (const a of accounts) m.set(a.parentId, [...(m.get(a.parentId) ?? []), a]);
    return m;
  }, [accounts]);
  const rows: Array<{ a: Account; depth: number }> = [];
  const walk = (parent: string | null, depth: number) => {
    for (const a of children.get(parent) ?? []) {
      if (!showZero && !a.isGroup && !a.debit && !a.credit) continue;
      rows.push({ a, depth });
      if (!collapsed.has(a.id)) walk(a.id, depth + 1);
    }
  };
  walk(null, 0);
  return (
    <ModuleShell
      nav={financeNav("accounting")}
      tabs={ACCOUNTING_TABS}
      wide
      actions={
        q.data?.canEdit ? (
          <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>
            حساب
          </Button>
        ) : null
      }
    >
      <div className="mb-3 flex items-center gap-4 text-[13px] text-fg-2">
        <label className="flex items-center gap-2">
          <Checkbox checked={showZero} onChange={setShowZero} /> إظهار الحسابات الصفرية
        </label>
        <button className="hover:text-fg" onClick={() => setCollapsed(new Set(accounts.filter((a) => a.isGroup).map((a) => a.id)))}>
          طي الكل
        </button>
        <button className="hover:text-fg" onClick={() => setCollapsed(new Set())}>
          فتح الكل
        </button>
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض دليل الحسابات" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={16} />
      ) : (
        <FinTable
          dense
          head={
            <tr>
              <th>الحساب</th>
              <th>النوع</th>
              <th className={num}>مدين</th>
              <th className={num}>دائن</th>
              <th className={num}>الرصيد</th>
              <th className="w-9" />
            </tr>
          }
        >
          {rows.map(({ a, depth }) => (
            <tr key={a.id} className={cn(a.isGroup && "font-semibold", !a.isActive && "text-fg-3")}>
              <td>
                <span className="flex items-center gap-1" style={{ paddingInlineStart: depth * 18 }}>
                  {a.isGroup ? (
                    <button className="grid size-5 place-items-center rounded hover:bg-hover" aria-label={collapsed.has(a.id) ? "فتح" : "طي"} onClick={() => setCollapsed((s) => (s.has(a.id) ? new Set([...s].filter((x) => x !== a.id)) : new Set([...s, a.id])))}>
                      {collapsed.has(a.id) ? <ChevronLeft className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </button>
                  ) : (
                    <span className="w-5" />
                  )}
                  <bdi dir="ltr" className="tabular text-fg-3">
                    {a.code}
                  </bdi>
                  {a.isGroup ? (
                    <span>{a.name}</span>
                  ) : (
                    <Link href={`/finance/accounting/accounts/${a.id}`} className="hover:underline">
                      {a.name}
                    </Link>
                  )}
                  {a.systemKey ? <Sparkles className="size-3 text-fg-3" aria-label="حساب نظامي تستخدمه القيود الآلية" /> : null}
                </span>
              </td>
              <td>
                <Tag size="sm" color={ACCOUNT_TYPE[a.type as AccountTypeKey].color}>
                  {ACCOUNT_TYPE[a.type as AccountTypeKey].label}
                </Tag>
              </td>
              <td className={num}>{money.cell(a.debit)}</td>
              <td className={num}>{money.cell(a.credit)}</td>
              <td className={num}>{a.balance ? money.fmt(a.balance, false) : "—"}</td>
              <td>
                {q.data.canEdit ? (
                  <Button size="icon-sm" variant="ghost" aria-label="تعديل الحساب" onClick={() => setEditing(a)}>
                    <Pencil className="size-3" />
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </FinTable>
      )}
      {editing ? <AccountDialog account={editing === "new" ? null : editing} accounts={accounts} onClose={() => setEditing(null)} /> : null}
    </ModuleShell>
  );
}

function AccountDialog({ account, accounts, onClose }: { account: Account | null; accounts: Account[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ code: account?.code ?? "", name: account?.name ?? "", parentId: account?.parentId ?? null, isGroup: account?.isGroup ?? false, description: account?.description ?? "", cashFlowGroup: account?.cashFlowGroup ?? null, isActive: account?.isActive ?? true });
  const m = trpc.finance.accounting.saveAccount.useMutation({
    onSuccess: () => {
      toast.success("حُفظ الحساب");
      void utils.finance.accounting.chart.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const groups = accounts.filter((a) => a.isGroup && a.id !== account?.id);
  const hasMoves = Boolean(account && (account.debit || account.credit));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={account ? "تعديل حساب" : "حساب جديد"} description="النوع والجانب الطبيعي يُورثان من الحساب الأب. لا يُحذف حساب عليه حركة؛ يُعطَّل فقط.">
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الحساب الأب" className="col-span-2">
            <Select value={v.parentId ?? undefined} onChange={(p) => setV({ ...v, parentId: p })} options={groups.map((g) => ({ value: g.id, label: `${g.code} — ${g.name}` }))} placeholder="اختر المجموعة" />
          </Field>
          <Field label="الرمز">
            <Input dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} disabled={Boolean(account?.systemKey)} />
          </Field>
          <Field label="الاسم">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="تصنيف التدفق النقدي" className="col-span-2">
            <Select
              value={v.cashFlowGroup ?? "none"}
              onChange={(c) => setV({ ...v, cashFlowGroup: c === "none" ? null : c })}
              options={[
                { value: "none", label: "حسب النوع" },
                { value: "CASH", label: "نقد وما في حكمه" },
                { value: "OPERATING", label: "تشغيلي" },
                { value: "INVESTING", label: "استثماري" },
                { value: "FINANCING", label: "تمويلي" },
              ]}
            />
          </Field>
          <Field label="الوصف" className="col-span-2">
            <Input value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.isGroup} disabled={hasMoves} onChange={(on) => setV({ ...v, isGroup: on })} /> حساب تجميعي
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.isActive} onChange={(on) => setV({ ...v, isActive: on })} /> نشط
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.code.trim() || v.name.trim().length < 2 || !v.parentId} onClick={() => m.mutate({ id: account?.id ?? null, ...v, description: v.description || null, cashFlowGroup: v.cashFlowGroup as "CASH" | "OPERATING" | "INVESTING" | "FINANCING" | null })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// دفتر الأستاذ
// ---------------------------------------------------------------------

export function LedgerPage({ accountId }: { accountId: string }) {
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const today = useToday();
  const [range, setRange] = useState({ from: yearStart(today), to: today });
  const q = trpc.finance.reports.ledger.useQuery({ accountId, ...range });
  const d = q.data;
  const title = d ? `${d.account.code} — ${d.account.name}` : "دفتر الأستاذ";
  return (
    <ModuleShell nav={financeNav("accounting")} tabs={ACCOUNTING_TABS} title={title} crumbs={[{ title: "دليل الحسابات", href: "/finance/accounting/chart" }, ...(d ? [{ title: d.account.name }] : [])]} wide>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض دفتر الأستاذ" description={q.error.message} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h1 className="flex items-center gap-2 text-[22px] font-bold">
              <BookOpen className="size-5 text-fg-3" />
              {title}
            </h1>
            <RangePicker from={range.from} to={range.to} onChange={setRange} />
          </div>
          {!d ? (
            <SkeletonLines lines={12} />
          ) : (
            <>
              <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Figure label="رصيد أول المدة" value={money.fmt(d.opening)} />
                <Figure label="حركة مدينة" value={money.fmt(d.rows.reduce((s, r) => s + r.debit, 0))} />
                <Figure label="حركة دائنة" value={money.fmt(d.rows.reduce((s, r) => s + r.credit, 0))} />
                <Figure label="رصيد آخر المدة" value={money.fmt(d.closing)} />
              </section>
              {d.rows.length ? (
                <FinTable
                  dense
                  head={
                    <tr>
                      <th>التاريخ</th>
                      <th>القيد</th>
                      <th>البيان</th>
                      <th>الطالب</th>
                      <th className={num}>مدين</th>
                      <th className={num}>دائن</th>
                      <th className={num}>الرصيد</th>
                    </tr>
                  }
                >
                  <tr className="text-fg-3">
                    <td colSpan={6}>رصيد أول المدة</td>
                    <td className={num}>{money.fmt(d.opening, false)}</td>
                  </tr>
                  {d.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td>
                        <DocLink href={`/finance/accounting/entries/${r.entryId}`}>{docNo(r.number, prefs.digits)}</DocLink>
                      </td>
                      <td className="max-w-[340px] truncate">
                        {r.sourceLink ? (
                          <Link href={r.sourceLink} className="hover:underline">
                            {r.description}
                          </Link>
                        ) : (
                          r.description
                        )}
                      </td>
                      <td className="text-fg-2">{r.student ?? ""}</td>
                      <td className={num}>{money.cell(r.debit)}</td>
                      <td className={num}>{money.cell(r.credit)}</td>
                      <td className={cn(num, "font-medium")}>{money.fmt(r.balance, false)}</td>
                    </tr>
                  ))}
                </FinTable>
              ) : (
                <EmptyState compact illustration="table" title="لا حركة على الحساب في هذه الفترة" />
              )}
            </>
          )}
        </>
      )}
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// الفترات والإقفال
// ---------------------------------------------------------------------

export function PeriodsPage() {
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const q = trpc.finance.accounting.years.useQuery();
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<string | null>(null);
  const [reopen, setReopen] = useState<string | null>(null);
  const [closeYear, setCloseYear] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const onError = (e: { message: string }) => toast.error(e.message);
  const refresh = () => void utils.finance.accounting.invalidate();
  const addYear = trpc.finance.accounting.addYear.useMutation({ onSuccess: () => (toast.success("أُضيف العام المالي بفتراته"), refresh()), onError });
  const reopenM = trpc.finance.accounting.reopenPeriod.useMutation({ onSuccess: () => (toast.success("أُعيد فتح الفترة وسُجل السبب"), setReopen(null), setReason(""), refresh()), onError });
  const closeYearM = trpc.finance.accounting.closeYear.useMutation({ onSuccess: () => (toast.success("أُقفل العام ونُقل صافي الدخل إلى الأرباح المبقاة"), setCloseYear(null), refresh()), onError });
  const d = q.data;
  const nextYear = d?.years.length ? new Date(d.years[0]!.startDate).getUTCFullYear() + 1 : new Date().getUTCFullYear();
  return (
    <ModuleShell
      nav={financeNav("accounting")}
      tabs={ACCOUNTING_TABS}
      wide
      actions={
        d?.canClose ? (
          <Button size="sm" icon={<Plus className="size-3.5" />} loading={addYear.isPending} onClick={() => addYear.mutate({ year: nextYear })}>
            العام المالي {formatNumber(nextYear, prefs.digits, { useGrouping: false })}
          </Button>
        ) : null
      }
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الفترات" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={12} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            {d.years.map((y) => (
              <section key={y.id} className="rounded-lg bg-card p-4 shadow-card">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-[16px] font-semibold">
                    {y.name} <Tag size="sm" color={y.status === "CLOSED" ? "slate" : "green"}>{y.status === "CLOSED" ? "مقفل" : "مفتوح"}</Tag>
                  </h2>
                  {d.canReopen && y.status !== "CLOSED" && y.periods.every((p) => p.status === "CLOSED") ? (
                    <Button size="sm" onClick={() => setCloseYear(y.id)}>
                      إقفال العام
                    </Button>
                  ) : null}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {y.periods.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p.id)}
                      className={cn("rounded-md border p-2.5 text-start transition-colors", selected === p.id ? "border-navy-600 bg-hover" : "border-line hover:bg-hover")}
                    >
                      <span className="flex items-center justify-between text-[14px] font-medium">
                        {p.name}
                        {p.status === "CLOSED" ? <Lock className="size-3.5 text-fg-3" /> : <LockOpen className="size-3.5 text-success-800" />}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-fg-3">
                        {formatNumber(p.entries, prefs.digits)} قيد{p.closedBy ? ` · أقفلها ${p.closedBy}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <aside>
            {selected ? (
              <CloseChecklist periodId={selected} canClose={d.canClose} canReopen={d.canReopen} onReopen={() => setReopen(selected)} />
            ) : (
              <div className="rounded-lg bg-card p-5 text-[13px] text-fg-3 shadow-card">اختر فترة لعرض قائمة الإقفال: الاعتراف بالإيراد، الورديات، المطابقة البنكية، الشيكات، وسندات الصرف.</div>
            )}
            <p className="mt-3 text-[12px] text-fg-3">
              الفترة المقفلة ترفض قاعدة البيانات الترحيل فيها. إعادة الفتح أو الترحيل الاستثنائي من صلاحية المدير وتُسجل بسببها في سجل التدقيق.
            </p>
          </aside>
        </div>
      )}
      <Dialog open={Boolean(reopen)} onOpenChange={(o) => !o && setReopen(null)}>
        <DialogContent title="إعادة فتح الفترة" description="تُسجَّل إعادة الفتح وسببها في سجل التدقيق غير القابل للتعديل.">
          <div className="px-5 pb-4">
            <Field label="السبب">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReopen(null)}>
              تراجع
            </Button>
            <Button variant="primary" loading={reopenM.isPending} disabled={reason.trim().length < 5} onClick={() => reopenM.mutate({ periodId: reopen!, reason })}>
              إعادة الفتح
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(closeYear)}
        onOpenChange={(o) => !o && setCloseYear(null)}
        title="إقفال العام المالي؟"
        description="يُرحّل قيد إقفال ينقل أرصدة الإيرادات والمصروفات إلى الأرباح المبقاة، ويُقفل العام."
        confirmLabel="إقفال العام"
        loading={closeYearM.isPending}
        onConfirm={() => closeYearM.mutate({ fiscalYearId: closeYear! })}
      />
    </ModuleShell>
  );
}

function CloseChecklist({ periodId, canClose, canReopen, onReopen }: { periodId: string; canClose: boolean; canReopen: boolean; onReopen: () => void }) {
  const money = useMoney();
  const q = trpc.finance.accounting.checklist.useQuery({ periodId });
  const utils = trpc.useUtils();
  const onError = (e: { message: string }) => toast.error(e.message);
  const recognize = trpc.finance.accounting.recognize.useMutation({
    onSuccess: (r) => (toast.success(r.posted ? `اعتُرف بإيراد ${money.fmt(r.total)}` : "لا إيراد مستحق الاعتراف"), void utils.finance.invalidate()),
    onError,
  });
  const close = trpc.finance.accounting.closePeriod.useMutation({ onSuccess: () => (toast.success("أُقفلت الفترة"), void utils.finance.accounting.invalidate()), onError });
  const [force, setForce] = useState(false);
  if (!q.data) return <SkeletonLines lines={8} />;
  const p = q.data.period;
  const blocking = q.data.items.filter((i) => !i.ok && i.blocking);
  const warnings = q.data.items.filter((i) => !i.ok && !i.blocking);
  return (
    <section className="rounded-lg bg-card p-4 shadow-card">
      <h3 className="text-[15px] font-semibold">
        قائمة إقفال {p.name} <Tag size="sm" color={p.status === "CLOSED" ? "slate" : "green"}>{p.status === "CLOSED" ? "مقفلة" : "مفتوحة"}</Tag>
      </h3>
      <ul className="mt-3 space-y-2">
        {q.data.items.map((i) => (
          <li key={i.key} className="flex items-start gap-2 text-[14px]">
            {i.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-800" /> : i.blocking ? <CircleX className="mt-0.5 size-4 shrink-0 text-danger-700" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning-700" />}
            <span className="flex-1">
              {i.label}
              {i.detail ? <span className="block text-[12px] text-fg-3">{i.detail}</span> : null}
            </span>
            {i.key === "recognition" && !i.ok && p.status !== "CLOSED" && canClose ? (
              <Button size="xs" variant="subtle" loading={recognize.isPending} onClick={() => recognize.mutate({ periodId })}>
                اعتراف الآن
              </Button>
            ) : null}
            {i.key === "cash" && !i.ok ? (
              <Link href="/finance/collect/session" className="text-[12px] underline">
                الورديات
              </Link>
            ) : null}
            {i.key === "bank" && !i.ok ? (
              <Link href="/finance/banking" className="text-[12px] underline">
                المطابقة
              </Link>
            ) : null}
            {i.key === "cheques" && !i.ok ? (
              <Link href="/finance/collect/cheques" className="text-[12px] underline">
                الشيكات
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {p.status === "CLOSED" ? (
        canReopen ? (
          <Button className="mt-4" size="sm" icon={<LockOpen className="size-3.5" />} onClick={onReopen}>
            إعادة فتح الفترة
          </Button>
        ) : null
      ) : canClose ? (
        <div className="mt-4 space-y-2 border-t border-line pt-3">
          {warnings.length && !blocking.length ? (
            <label className="flex items-center gap-2 text-[13px] text-fg-2">
              <Checkbox checked={force} onChange={setForce} /> الإقفال رغم التنبيهات
            </label>
          ) : null}
          <Button size="sm" variant="primary" icon={<Lock className="size-3.5" />} loading={close.isPending} disabled={blocking.length > 0 || (warnings.length > 0 && !force)} onClick={() => close.mutate({ periodId, force })}>
            إقفال الفترة
          </Button>
          {blocking.length ? <p className="text-[12px] text-danger-700">أكمل البنود الحمراء أولاً.</p> : null}
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------
// مراكز التكلفة
// ---------------------------------------------------------------------

export function CostCentersPage() {
  const q = trpc.finance.accounting.costCenters.useQuery();
  const utils = trpc.useUtils();
  const [editing, setEditing] = useState<{ id: string | null; code: string; name: string; kind: "BRANCH" | "STAGE" | "DEPARTMENT"; isActive: boolean } | null>(null);
  const save = trpc.finance.accounting.saveCostCenter.useMutation({
    onSuccess: () => (toast.success("حُفظ مركز التكلفة"), setEditing(null), void utils.finance.accounting.costCenters.invalidate()),
    onError: (e) => toast.error(e.message),
  });
  const KIND = { BRANCH: "فرع", STAGE: "مرحلة", DEPARTMENT: "قسم" } as const;
  return (
    <ModuleShell
      nav={financeNav("accounting")}
      tabs={ACCOUNTING_TABS}
      actions={
        q.data?.canEdit ? (
          <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ id: null, code: "", name: "", kind: "DEPARTMENT", isActive: true })}>
            مركز تكلفة
          </Button>
        ) : null
      }
    >
      <p className="mb-3 text-[13px] text-fg-3">الإيرادات والمصروفات تُحمَّل على مركز تكلفة الفرع تلقائياً، ويمكن تخصيص السطور يدوياً. تقارير قائمة الدخل تُصفّى حسبه.</p>
      {!q.data ? (
        <SkeletonLines lines={6} />
      ) : (
        <FinTable
          head={
            <tr>
              <th>الرمز</th>
              <th>الاسم</th>
              <th>النوع</th>
              <th>الحالة</th>
              <th className="w-9" />
            </tr>
          }
        >
          {q.data.rows.map((c) => (
            <tr key={c.id}>
              <td>
                <bdi dir="ltr" className="tabular">
                  {c.code}
                </bdi>
              </td>
              <td>{c.name}</td>
              <td>{KIND[c.kind as keyof typeof KIND] ?? c.kind}</td>
              <td>{c.isActive ? <Tag size="sm" color="green">نشط</Tag> : <Tag size="sm" color="gray">معطّل</Tag>}</td>
              <td>
                {q.data.canEdit ? (
                  <Button size="icon-sm" variant="ghost" aria-label="تعديل" onClick={() => setEditing({ id: c.id, code: c.code, name: c.name, kind: c.kind as "BRANCH" | "STAGE" | "DEPARTMENT", isActive: c.isActive })}>
                    <Pencil className="size-3" />
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </FinTable>
      )}
      {editing ? (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent title={editing.id ? "تعديل مركز تكلفة" : "مركز تكلفة جديد"}>
            <div className="grid grid-cols-2 gap-3 px-5 pb-4">
              <Field label="الرمز">
                <Input dir="ltr" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
              </Field>
              <Field label="النوع">
                <Select value={editing.kind} onChange={(k) => setEditing({ ...editing, kind: k as "BRANCH" | "STAGE" | "DEPARTMENT" })} options={Object.entries(KIND).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="الاسم" className="col-span-2">
                <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </Field>
              <label className="flex items-center gap-2 text-[14px]">
                <Checkbox checked={editing.isActive} onChange={(on) => setEditing({ ...editing, isActive: on })} /> نشط
              </label>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                إلغاء
              </Button>
              <Button variant="primary" loading={save.isPending} disabled={!editing.code.trim() || editing.name.trim().length < 2} onClick={() => save.mutate(editing)}>
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </ModuleShell>
  );
}

