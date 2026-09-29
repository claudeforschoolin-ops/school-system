"use client";
/**
 * البنوك والنقدية: الحسابات بأرصدتها، استيراد كشف CSV، المطابقة (مقترحة تلقائياً بالمبلغ والتاريخ والمرجع)،
 * ترحيل حركات الكشف غير المسجلة، والتحويل بين الحسابات. وسندات الصرف بموافقاتها.
 */
import { ibanHint, validIban } from "@/lib/region";
import {
  ArrowLeftRight,
  Ban,
  CheckCheck,
  FileUp,
  Landmark,
  Link2,
  Link2Off,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  Upload,
  Wallet,
  Wand2,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PAYMENT_METHOD, VOUCHER_STATUS } from "@/lib/finance/labels";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { pickFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs, useRegion } from "@/components/shell/app-context";
import { DatabaseView } from "@/components/database/database-view";
import { ModuleShell } from "@/components/modules/module-shell";
import {
  Figure,
  FinTable,
  financeNav,
  labelOf,
  MoneyInput,
  num,
  useFmtDate,
  useMoney,
  useToday,
  docNo,
} from "./common";

type Banks = RouterOutputs["finance"]["banking"]["accounts"];

// ---------------------------------------------------------------------
// الحسابات البنكية
// ---------------------------------------------------------------------

export function BankingHome() {
  const money = useMoney();
  const q = trpc.finance.banking.accounts.useQuery();
  const [editing, setEditing] = useState<Banks["banks"][number] | "new" | null>(null);
  const [transfer, setTransfer] = useState(false);
  const d = q.data;
  return (
    <ModuleShell
      nav={financeNav("banking")}
      wide
      actions={
        d?.canEdit ? (
          <>
            <Button
              size="sm"
              icon={<ArrowLeftRight className="size-3.5" />}
              onClick={() => setTransfer(true)}
            >
              تحويل بين الحسابات
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="size-3.5" />}
              onClick={() => setEditing("new")}
            >
              حساب بنكي
            </Button>
          </>
        ) : null
      }
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الحسابات البنكية" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : (
        <>
          <section className="mb-6 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {d.banks.map((b) => (
              <article
                key={b.id}
                className={cn("rounded-lg bg-card p-4 shadow-card", !b.isActive && "opacity-60")}
              >
                <div className="flex items-start justify-between">
                  <span className="grid size-9 place-items-center rounded-md bg-hover text-fg-2">
                    <Landmark className="size-4" />
                  </span>
                  {d.canEdit ? (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="تعديل الحساب"
                      onClick={() => setEditing(b)}
                    >
                      <Pencil className="size-3" />
                    </Button>
                  ) : null}
                </div>
                <p className="mt-2 text-[15px] font-semibold">{b.name}</p>
                <p className="text-[12px] text-fg-3">
                  {b.bankName} ·{" "}
                  <bdi dir="ltr" className="tabular">
                    {b.iban.replace(/(.{4})/g, "$1 ").trim()}
                  </bdi>
                </p>
                <p className="mt-3 text-[22px] font-bold tabular">{money.fmt(b.balanceMinor)}</p>
                <p className="text-[12px] text-fg-3">رصيد الدفاتر · حساب {b.account?.code}</p>
                <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[13px]">
                  {b.unmatched ? (
                    <Tag color="gold">{b.unmatched} حركة غير مطابقة</Tag>
                  ) : (
                    <Tag color="green">مطابق</Tag>
                  )}
                  <Link href={`/finance/banking/${b.id}`} className="font-medium text-fg-2 hover:text-fg">
                    المطابقة
                  </Link>
                </div>
              </article>
            ))}
            {!d.banks.length ? (
              <EmptyState
                compact
                illustration="blank"
                title="لا حسابات بنكية"
                description="أضف حساب المدرسة البنكي لاستلام التحويلات ومطابقة الكشوف."
              />
            ) : null}
          </section>
          <h2 className="mb-2 text-[15px] font-semibold">حسابات النقد</h2>
          <FinTable
            dense
            head={
              <tr>
                <th>الحساب</th>
                <th className={num}>الرصيد</th>
              </tr>
            }
          >
            {d.cash.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link href={`/finance/accounting/accounts/${c.id}`} className="hover:underline">
                    <Wallet className="me-1.5 inline size-3.5 text-fg-3" />
                    <bdi dir="ltr" className="tabular text-fg-3">
                      {c.code}
                    </bdi>{" "}
                    {c.name}
                  </Link>
                </td>
                <td className={num}>{money.fmt(c.balanceMinor)}</td>
              </tr>
            ))}
          </FinTable>
        </>
      )}
      {editing ? (
        <BankDialog bank={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
      {transfer && d ? <TransferDialog banks={d} onClose={() => setTransfer(false)} /> : null}
    </ModuleShell>
  );
}

function BankDialog({ bank, onClose }: { bank: Banks["banks"][number] | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({
    name: bank?.name ?? "",
    bankName: bank?.bankName ?? "",
    iban: bank?.iban ?? "SA",
    isActive: bank?.isActive ?? true,
  });
  const m = trpc.finance.banking.saveAccount.useMutation({
    onSuccess: () => (
      toast.success("حُفظ الحساب البنكي"),
      void utils.finance.banking.invalidate(),
      onClose()
    ),
    onError: (e) => toast.error(e.message),
  });
  const region = useRegion();
  const ibanOk = validIban(v.iban, region);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title={bank ? "تعديل حساب بنكي" : "حساب بنكي جديد"}
        description="يُنشأ له حساب أستاذ تحت «النقد والبنوك» تلقائياً."
      >
        <div className="space-y-3 px-5 pb-4">
          <Field label="اسم الحساب">
            <Input
              value={v.name}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              placeholder="مثال: الحساب الجاري — الراجحي"
            />
          </Field>
          <Field label="البنك">
            <Input value={v.bankName} onChange={(e) => setV({ ...v, bankName: e.target.value })} />
          </Field>
          <Field label="الآيبان" error={v.iban.length > 4 && !ibanOk ? ibanHint(region) : null}>
            <Input
              dir="ltr"
              value={v.iban}
              onChange={(e) => setV({ ...v, iban: e.target.value.toUpperCase() })}
            />
          </Field>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.isActive} onChange={(on) => setV({ ...v, isActive: on })} /> نشط
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={v.name.trim().length < 2 || v.bankName.trim().length < 2 || !ibanOk}
            onClick={() => m.mutate({ id: bank?.id ?? null, ...v, iban: v.iban.replace(/\s/g, "") })}
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ banks, onClose }: { banks: Banks; onClose: () => void }) {
  const money = useMoney();
  const today = useToday();
  const utils = trpc.useUtils();
  const all = [
    ...banks.banks
      .filter((b) => b.isActive)
      .map((b) => ({ id: b.accountId, label: b.name, balance: b.balanceMinor })),
    ...banks.cash.map((c) => ({ id: c.id, label: c.name, balance: c.balanceMinor })),
  ];
  const [from, setFrom] = useState<string | undefined>(all.find((a) => a.balance > 0)?.id);
  const [to, setTo] = useState<string | undefined>();
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("إيداع نقدية الصندوق في البنك");
  const m = trpc.finance.banking.transfer.useMutation({
    onSuccess: () => (toast.success("رُحّل قيد التحويل"), void utils.finance.invalidate(), onClose()),
    onError: (e) => toast.error(e.message),
  });
  const src = all.find((a) => a.id === from);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="تحويل بين الحسابات"
        description="مثل إيداع نقدية الصندوق في البنك أو التحويل بين حسابين بنكيين."
      >
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="من" hint={src ? `الرصيد ${money.fmt(src.balance)}` : undefined}>
            <Select
              value={from}
              onChange={setFrom}
              options={all.map((a) => ({ value: a.id, label: a.label }))}
            />
          </Field>
          <Field label="إلى">
            <Select
              value={to}
              onChange={setTo}
              options={all.filter((a) => a.id !== from).map((a) => ({ value: a.id, label: a.label }))}
            />
          </Field>
          <Field label="المبلغ" error={src && amount && amount > src.balance ? "أكبر من الرصيد" : null}>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="التاريخ">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="البيان" className="col-span-2">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!from || !to || !amount || Boolean(src && amount > src.balance)}
            onClick={() =>
              m.mutate({ fromAccountId: from!, toAccountId: to!, amountMinor: amount!, date, description })
            }
          >
            تحويل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// المطابقة البنكية
// ---------------------------------------------------------------------

export function Reconciliation({ bankAccountId }: { bankAccountId: string }) {
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const q = trpc.finance.banking.reconciliation.useQuery({ bankAccountId });
  const utils = trpc.useUtils();
  const refresh = () => void utils.finance.banking.invalidate();
  const onError = (e: { message: string }) => toast.error(e.message);
  const match = trpc.finance.banking.match.useMutation({ onSuccess: refresh, onError });
  const unmatch = trpc.finance.banking.unmatch.useMutation({ onSuccess: refresh, onError });
  const auto = trpc.finance.banking.autoMatch.useMutation({
    onSuccess: (r) => (
      toast.success(`طوبقت ${formatNumber(r.matched, prefs.digits)} حركة تلقائياً`),
      refresh()
    ),
    onError,
  });
  const [importing, setImporting] = useState(false);
  const [posting, setPosting] = useState<
    RouterOutputs["finance"]["banking"]["reconciliation"]["statement"][number] | null
  >(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "all">("open");
  const d = q.data;
  const title = d ? `مطابقة ${d.bank.name}` : "المطابقة البنكية";
  const suggestions = d?.statement.filter((s) => !s.matchedAt && s.suggestion).length ?? 0;
  const rows = (d?.statement ?? []).filter((s) => filter === "all" || !s.matchedAt);
  return (
    <ModuleShell
      nav={financeNav("banking")}
      title={title}
      crumbs={d ? [{ title: d.bank.name }] : []}
      wide
      actions={
        d?.canEdit ? (
          <>
            <Button size="sm" icon={<FileUp className="size-3.5" />} onClick={() => setImporting(true)}>
              استيراد كشف
            </Button>
            <Button
              size="sm"
              variant="primary"
              icon={<Wand2 className="size-3.5" />}
              disabled={!suggestions}
              loading={auto.isPending}
              onClick={() => auto.mutate({ bankAccountId })}
            >
              مطابقة المقترحات ({formatNumber(suggestions, prefs.digits)})
            </Button>
          </>
        ) : null
      }
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض المطابقة" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={12} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Figure label="رصيد الدفاتر" value={money.fmt(d.bookBalance)} hint="كل الحركات حتى اليوم" />
            <Figure
              label="حركة الكشف المستورد"
              value={money.fmt(d.statementBalance)}
              hint={d.period ? `${fmtDate(d.period.from)} – ${fmtDate(d.period.to)}` : "لم يُستورد كشف"}
            />
            <Figure
              label="الفرق في فترة الكشف"
              value={money.fmt(d.bookMovement - d.statementBalance)}
              tone={d.bookMovement !== d.statementBalance ? "warning" : "success"}
              hint={`حركة الدفاتر ${money.fmt(d.bookMovement)}؛ يُفسَّر بغير المطابق في الطرفين`}
            />
            <Figure
              label="حركات مطابقة"
              value={formatNumber(d.matchedCount, prefs.digits)}
              hint={`${formatNumber(d.unmatchedLedger.length, prefs.digits)} قيد في الدفاتر بلا مقابل`}
            />
          </section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15px] font-semibold">حركات الكشف</h2>
            <Select
              size="sm"
              className="w-40"
              value={filter}
              onChange={(v) => setFilter(v as "open" | "all")}
              options={[
                { value: "open", label: "غير المطابقة" },
                { value: "all", label: "الكل" },
              ]}
            />
          </div>
          {rows.length ? (
            <FinTable
              head={
                <tr>
                  <th>التاريخ</th>
                  <th>البيان</th>
                  <th>المرجع</th>
                  <th className={num}>المبلغ</th>
                  <th>المقابل في الدفاتر</th>
                  {d.canEdit ? <th /> : null}
                </tr>
              }
            >
              {rows.map((s) => {
                const sug = s.suggestion ? d.unmatchedLedger.find((l) => l.id === s.suggestion) : null;
                return (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap">{fmtDate(s.date)}</td>
                    <td className="max-w-[280px] truncate">{s.description}</td>
                    <td>
                      <bdi dir="ltr" className="tabular text-fg-2">
                        {s.reference ?? ""}
                      </bdi>
                    </td>
                    <td className={cn(num, s.amountMinor < 0 && "text-danger-700")}>
                      {money.fmt(s.amountMinor, false)}
                    </td>
                    <td>
                      {s.matched ? (
                        <Link
                          href={`/finance/accounting/entries/${s.matched.entryId}`}
                          className="text-[13px] hover:underline"
                        >
                          <CheckCheck className="me-1 inline size-3.5 text-success-800" />
                          قيد {docNo(s.matched.entryNumber, prefs.digits)}
                        </Link>
                      ) : sug ? (
                        <span className="text-[13px] text-fg-2">
                          مقترح: قيد {docNo(sug.number, prefs.digits)} · {sug.description}
                        </span>
                      ) : (
                        <span className="text-[13px] text-fg-3">لا مقابل</span>
                      )}
                    </td>
                    {d.canEdit ? (
                      <td className="whitespace-nowrap text-end">
                        {s.matched ? (
                          <Button
                            size="xs"
                            variant="ghost"
                            icon={<Link2Off className="size-3" />}
                            onClick={() => unmatch.mutate({ statementLineId: s.id })}
                          >
                            فك
                          </Button>
                        ) : (
                          <>
                            {sug ? (
                              <Button
                                size="xs"
                                variant="subtle"
                                icon={<Link2 className="size-3" />}
                                onClick={() => match.mutate({ statementLineId: s.id, journalLineId: sug.id })}
                              >
                                طابق
                              </Button>
                            ) : null}{" "}
                            <Button size="xs" variant="ghost" onClick={() => setPicking(s.id)}>
                              اختيار
                            </Button>{" "}
                            <Button size="xs" variant="ghost" onClick={() => setPosting(s)}>
                              ترحيل
                            </Button>
                          </>
                        )}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </FinTable>
          ) : (
            <EmptyState
              compact
              illustration="table"
              title={d.statement.length ? "كل حركات الكشف مطابقة" : "لم يُستورد كشف بعد"}
              description={
                d.statement.length
                  ? undefined
                  : "استورد ملف CSV من البنك (تاريخ، بيان، مرجع، مبلغ أو مدين/دائن)."
              }
            />
          )}
        </>
      )}
      {importing ? <ImportDialog bankAccountId={bankAccountId} onClose={() => setImporting(false)} /> : null}
      {posting ? <PostDialog line={posting} onClose={() => setPosting(null)} /> : null}
      {picking && d ? (
        <Dialog open onOpenChange={(o) => !o && setPicking(null)}>
          <DialogContent title="اختيار القيد المقابل" width={640}>
            <ul className="max-h-[50vh] overflow-y-auto px-5 pb-4 thin-scroll">
              {d.unmatchedLedger.map((l) => (
                <li key={l.id}>
                  <button
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-start text-[13px] hover:bg-hover"
                    onClick={() => (
                      match.mutate({ statementLineId: picking, journalLineId: l.id }),
                      setPicking(null)
                    )}
                  >
                    <span className="tabular text-fg-3">{docNo(l.number, prefs.digits)}</span>
                    <span className="min-w-0 flex-1 truncate">{l.description}</span>
                    <span className="text-fg-3">{fmtDate(l.date)}</span>
                    <span className="tabular">{money.fmt(l.amountMinor, false)}</span>
                  </button>
                </li>
              ))}
              {!d.unmatchedLedger.length ? (
                <li className="py-4 text-center text-[13px] text-fg-3">لا قيود غير مطابقة</li>
              ) : null}
            </ul>
          </DialogContent>
        </Dialog>
      ) : null}
    </ModuleShell>
  );
}

function ImportDialog({ bankAccountId, onClose }: { bankAccountId: string; onClose: () => void }) {
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const [csv, setCsv] = useState("");
  const [name, setName] = useState<string | null>(null);
  const m = trpc.finance.banking.importStatement.useMutation({
    onSuccess: (r) => {
      toast.success(
        `استُورد ${formatNumber(r.created, prefs.digits)} حركة${r.skipped ? ` وتُخطي ${formatNumber(r.skipped, prefs.digits)} مكرر` : ""}`,
      );
      void utils.finance.banking.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="استيراد كشف حساب"
        description="ملف CSV بأعمدة: التاريخ، البيان، المرجع، والمبلغ (موجب للإيداع وسالب للسحب) أو عمودي مدين/دائن. المكرر يُتخطى."
        width={600}
      >
        <div className="space-y-3 px-5 pb-4">
          <Button
            icon={<Upload className="size-3.5" />}
            onClick={async () => {
              const f = await pickFile(".csv,text/csv,text/plain");
              if (!f) return;
              setName(f.name);
              setCsv(await f.text());
            }}
          >
            {name ?? "اختيار ملف"}
          </Button>
          <Field label="أو الصق المحتوى">
            <Textarea
              dir="ltr"
              className="min-h-[140px] font-mono text-[12px]"
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={"date,description,reference,amount\n2026-09-01,SADAD 1234,TRX-99,4600.00"}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={csv.trim().length < 10}
            onClick={() => m.mutate({ bankAccountId, csv })}
          >
            استيراد
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PostDialog({
  line,
  onClose,
}: {
  line: RouterOutputs["finance"]["banking"]["reconciliation"]["statement"][number];
  onClose: () => void;
}) {
  const money = useMoney();
  const utils = trpc.useUtils();
  const chart = trpc.finance.accounting.chart.useQuery({});
  const [accountId, setAccountId] = useState<string | undefined>();
  const [description, setDescription] = useState(line.description);
  const m = trpc.finance.banking.postFromStatement.useMutation({
    onSuccess: () => (toast.success("رُحّلت الحركة وطوبقت"), void utils.finance.invalidate(), onClose()),
    onError: (e) => toast.error(e.message),
  });
  const accounts = (chart.data?.accounts ?? []).filter(
    (a) => !a.isGroup && a.isActive && a.cashFlowGroup !== "CASH",
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="ترحيل حركة بنكية"
        description={`${line.amountMinor < 0 ? "سحب" : "إيداع"} بمبلغ ${money.fmt(Math.abs(line.amountMinor))} غير مسجل في الدفاتر (مثل عمولة بنكية أو فائدة). يُنشأ قيد ويُطابق.`}
      >
        <div className="space-y-3 px-5 pb-4">
          <Field label="الحساب المقابل">
            <Select
              value={accountId}
              onChange={setAccountId}
              options={accounts.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))}
              placeholder="مثال: عمولات بنكية"
            />
          </Field>
          <Field label="البيان">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            loading={m.isPending}
            disabled={!accountId}
            onClick={() => m.mutate({ statementLineId: line.id, accountId: accountId!, description })}
          >
            ترحيل ومطابقة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// سندات الصرف
// ---------------------------------------------------------------------

export function VouchersHome() {
  const db = trpc.finance.banking.vouchersDatabaseId.useQuery();
  return (
    <ModuleShell nav={financeNav("vouchers")} wide>
      {db.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض سندات الصرف" description={db.error.message} />
      ) : db.data ? (
        <DatabaseView databaseId={db.data} mode="page" />
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </ModuleShell>
  );
}

export function VoucherDetail({ id }: { id: string }) {
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const today = useToday();
  const { tenant } = useApp();
  const q = trpc.finance.banking.voucher.useQuery({ id });
  const utils = trpc.useUtils();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const onError = (e: { message: string }) => toast.error(e.message);
  const refresh = () =>
    Promise.all([utils.finance.banking.voucher.invalidate({ id }), utils.database.rows.invalidate()]);
  const pay = trpc.finance.banking.payVoucher.useMutation({
    onSuccess: () => (toast.success("صُرف السند ورُحّل قيده"), void refresh()),
    onError,
  });
  const cancel = trpc.finance.banking.cancelVoucher.useMutation({
    onSuccess: () => (toast.success("أُلغي السند"), setCancelling(false), void refresh()),
    onError,
  });
  const v = q.data;
  const nav = financeNav("vouchers");
  if (q.error) {
    return (
      <ModuleShell nav={nav} title="سند صرف">
        <EmptyState illustration="lock" title="لا يمكن عرض السند" description={q.error.message} />
      </ModuleShell>
    );
  }
  const title = v ? `سند صرف ${docNo(v.number, prefs.digits)}` : "سند صرف";
  const st = labelOf(VOUCHER_STATUS, v?.status);
  return (
    <ModuleShell
      nav={nav}
      title={title}
      crumbs={v ? [{ title }] : []}
      actions={
        v ? (
          <>
            <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
              طباعة
            </Button>
            {v.canPay ? (
              <Button
                size="sm"
                variant="primary"
                icon={<Wallet className="size-3.5" />}
                loading={pay.isPending}
                onClick={() => pay.mutate({ id, date: today })}
              >
                صرف
              </Button>
            ) : null}
            {v.canCancel ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger-700"
                icon={<Ban className="size-3.5" />}
                onClick={() => setCancelling(true)}
              >
                إلغاء
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {!v ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <article className="mx-auto max-w-[760px] rounded-lg bg-card p-8 shadow-card print:p-0 print:shadow-none">
          <header className="flex items-start justify-between border-b border-line pb-4">
            <div>
              <p className="text-[18px] font-bold">{tenant.name}</p>
              <p className="text-[13px] text-fg-3">سند صرف</p>
            </div>
            <div className="text-end text-[13px]">
              <p>
                الرقم: <b className="tabular">{docNo(v.number, prefs.digits)}</b>
              </p>
              <p>التاريخ: {fmtDate(v.date, "long")}</p>
              <Tag color={st.color}>{st.label}</Tag>
            </div>
          </header>
          <section className="py-5 text-[15px] leading-8">
            <p>
              اصرفوا إلى: <b>{v.payee}</b>
            </p>
            <p>البيان: {v.description}</p>
            <p>
              حساب المصروف:{" "}
              <bdi dir="ltr" className="tabular text-fg-3">
                {v.account?.code}
              </bdi>{" "}
              {v.account?.name}
              {v.costCenter ? ` · ${v.costCenter}` : ""}
            </p>
            <p>
              طريقة الدفع: {PAYMENT_METHOD[v.method].label}
              {v.bank ? ` — ${v.bank}` : ""}
            </p>
          </section>
          <dl className="ms-auto grid max-w-[300px] grid-cols-2 gap-y-1.5 text-[14px]">
            <dt className="text-fg-3">المبلغ</dt>
            <dd className={num}>{money.fmt(v.amountMinor)}</dd>
            <dt className="text-fg-3">ضريبة المدخلات</dt>
            <dd className={num}>{money.fmt(v.taxMinor)}</dd>
            <dt className="border-t border-line pt-1.5 font-bold">الإجمالي</dt>
            <dd className={cn(num, "border-t border-line pt-1.5 font-bold")}>{money.fmt(v.totalMinor)}</dd>
          </dl>
          {v.attachments.length ? (
            <div className="no-print mt-5 flex flex-wrap gap-2">
              {v.attachments.map((a) => (
                <a
                  key={a.id}
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-hover px-2 py-1 text-[13px] hover:bg-active"
                >
                  <Paperclip className="size-3.5 text-fg-3" />
                  {a.name}
                </a>
              ))}
            </div>
          ) : null}
          <footer className="mt-10 grid grid-cols-3 gap-4 text-[13px] text-fg-2">
            <p>أعدّه: {v.createdBy ?? "—"}</p>
            <p>
              اعتمده:{" "}
              {v.approval
                ? v.approval.steps.find((s) => s.status === "APPROVED")
                  ? "مدير المدرسة"
                  : "بانتظار الاعتماد"
                : "ضمن حد الصلاحية"}
            </p>
            <p className="text-end">المستلم: ....................</p>
          </footer>
          <div className="no-print mt-6 flex flex-wrap gap-4 border-t border-line pt-4 text-[13px]">
            {v.journalEntry ? (
              <Link
                href={`/finance/accounting/entries/${v.journalEntry.id}`}
                className="text-fg-2 underline decoration-line underline-offset-4"
              >
                القيد رقم {docNo(v.journalEntry.number, prefs.digits)}
              </Link>
            ) : null}
            {v.approvalRequestId ? (
              <Link href="/inbox" className="text-fg-2 underline decoration-line underline-offset-4">
                طلب الاعتماد
              </Link>
            ) : null}
          </div>
        </article>
      )}
      <Dialog open={cancelling} onOpenChange={setCancelling}>
        <DialogContent
          title="إلغاء سند الصرف"
          description={
            v?.status === "PAID" ? "السند مصروف: يُرحّل قيد عكسي بتاريخ اليوم." : "يُلغى السند دون قيد."
          }
        >
          <div className="px-5 pb-4">
            <Field label="السبب">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelling(false)}>
              تراجع
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => cancel.mutate({ id, reason })}
            >
              إلغاء السند
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleShell>
  );
}
