"use client";
/**
 * التحصيل: سند قبض سريع بلوحة المفاتيح (بحث ← اختيار ← مبلغ ← Ctrl+Enter)، سجل السندات،
 * الشيكات تحت التحصيل، وردية الصندوق، وصفحة السند المطبوعة.
 */
import { Ban, Banknote, CheckCircle2, CircleSlash, Landmark, Lock, Printer, RotateCcw, Search, Unlock } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CHEQUE_STATUS, INVOICE_STATUS, PAYMENT_METHOD, type PaymentMethodKey } from "@/lib/finance/labels";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { COLLECT_TABS, Figure, FinTable, financeNav, MoneyInput, num, RangePicker, monthStart, useFmtDate, useMoney, useToday, docNo } from "./common";

type Family = RouterOutputs["finance"]["receipts"]["family"];
const METHODS = Object.keys(PAYMENT_METHOD) as PaymentMethodKey[];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

// ---------------------------------------------------------------------
// سند قبض سريع
// ---------------------------------------------------------------------

export function QuickReceipt() {
  const params = useSearchParams();
  const router = useRouter();
  const guardianId = params.get("guardian");
  const setGuardian = (id: string | null) => router.replace(id ? `/finance/collect?guardian=${id}` : "/finance/collect");
  const [done, setDone] = useState<{ id: string; number: number; amount: number } | null>(null);
  return (
    <ModuleShell nav={financeNav("collect")} tabs={COLLECT_TABS} wide>
      <CashSessionBar />
      {done ? (
        <ReceiptDone done={done} onNew={() => (setDone(null), setGuardian(null))} onSameFamily={() => setDone(null)} />
      ) : guardianId ? (
        <FamilyCollect guardianId={guardianId} onChange={() => setGuardian(null)} onDone={setDone} />
      ) : (
        <PayerSearch onPick={setGuardian} />
      )}
    </ModuleShell>
  );
}

function PayerSearch({ onPick }: { onPick: (guardianId: string) => void }) {
  const prefs = usePrefs();
  const money = useMoney();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const q = useDebounced(query, 180);
  const res = trpc.finance.receipts.search.useQuery({ q }, { enabled: q.trim().length >= 2, placeholderData: (p) => p });
  const rows = (q.trim().length >= 2 ? res.data : []) ?? [];
  const pick = (i: number) => {
    const r = rows[i];
    if (r?.guardian) onPick(r.guardian.id);
    else if (r) toast.error("الطالب غير مرتبط بولي أمر؛ أضف ولي الأمر من ملف الطالب");
  };
  return (
    <section className="mx-auto max-w-2xl">
      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-5 -translate-y-1/2 text-fg-3" />
        <Input
          autoFocus
          aria-label="بحث عن الطالب أو ولي الأمر"
          className="h-12 ps-10 text-[16px]"
          placeholder="اسم الطالب، الرقم الأكاديمي، آخر ٤ أرقام من الهوية، أو جوال ولي الأمر"
          value={query}
          onChange={(e) => (setQuery(e.target.value), setActive(0))}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") (e.preventDefault(), setActive((a) => Math.min(rows.length - 1, a + 1)));
            if (e.key === "ArrowUp") (e.preventDefault(), setActive((a) => Math.max(0, a - 1)));
            if (e.key === "Enter") (e.preventDefault(), pick(active));
          }}
        />
        {res.isFetching ? <Spinner className="absolute end-3 top-1/2 -translate-y-1/2" /> : null}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd> للتنقل · <Kbd>Enter</Kbd> للاختيار · ثم أدخل المبلغ و<Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> للحفظ
      </p>
      {q.trim().length >= 2 ? (
        rows.length ? (
          <ul className="mt-4 overflow-hidden rounded-lg bg-card shadow-card" role="listbox">
            {rows.map((r, i) => (
              <li key={r.studentId} role="option" aria-selected={i === active}>
                <button className={cn("flex w-full items-center gap-3 px-4 py-3 text-start", i === active ? "bg-active" : "hover:bg-hover")} onMouseEnter={() => setActive(i)} onClick={() => pick(i)}>
                  <Avatar name={r.fullName} size={32} src={r.photoUrl ?? undefined} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{r.fullName}</span>
                    <span className="block truncate text-[12px] text-fg-3">
                      <bdi className="tabular">{r.academicNumber}</bdi> · {r.grade}
                      {r.section ? ` · ${r.section}` : ""} · {r.guardian?.name ?? "بلا ولي أمر"}
                      {r.guardian?.phone ? (
                        <>
                          {" · "}
                          <bdi dir="ltr" className="tabular">
                            {r.guardian.phone}
                          </bdi>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className="text-end">
                    <span className={cn("block text-[14px] font-semibold tabular", r.familyDue ? "text-fg" : "text-fg-3")}>{money.fmt(r.familyDue)}</span>
                    <span className="block text-[11px] text-fg-3">مستحق على الأسرة</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : res.isFetching ? null : (
          <EmptyState compact illustration="search" title="لا نتائج" description={`لا طالب أو ولي أمر يطابق «${query}».`} />
        )
      ) : (
        <EmptyState compact illustration="search" title="ابدأ بالبحث" description="يعرض سند القبض فواتير الأسرة كلها، ويوزّع المبلغ على الأقدم استحقاقاً تلقائياً." />
      )}
    </section>
  );
}

function FamilyCollect({ guardianId, onChange, onDone }: { guardianId: string; onChange: () => void; onDone: (d: { id: string; number: number; amount: number }) => void }) {
  const q = trpc.finance.receipts.family.useQuery({ guardianId });
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن فتح حساب الأسرة" description={q.error.message} action={<Button onClick={onChange}>بحث جديد</Button>} />;
  if (!q.data) return <SkeletonLines lines={10} />;
  return <CollectForm key={guardianId} family={q.data} onChange={onChange} onDone={onDone} />;
}

function CollectForm({ family, onChange, onDone }: { family: Family; onChange: () => void; onDone: (d: { id: string; number: number; amount: number }) => void }) {
  const { can, data } = useApp();
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const today = useToday();
  const utils = trpc.useUtils();
  const [amount, setAmount] = useState<number | null>(family.totals.due || null);
  const [method, setMethod] = useState<PaymentMethodKey>("CASH");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [cheque, setCheque] = useState({ number: "", bank: "", date: today });
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [alloc, setAlloc] = useState<Record<string, number | null>>({});
  const [notify, setNotify] = useState(true);
  const [notes, setNotes] = useState("");
  const banks = trpc.finance.banking.accounts.useQuery(undefined, { enabled: can("banking", "view") });
  const session = trpc.finance.receipts.cashSession.useQuery();
  const amountRef = useRef<HTMLDivElement>(null);
  const create = trpc.finance.receipts.create.useMutation({
    onSuccess: (r) => {
      void utils.finance.invalidate();
      void utils.database.rows.invalidate();
      toast.success(`سند قبض رقم ${docNo(r.number, prefs.digits)}`);
      onDone({ id: r.id, number: r.number, amount: r.amountMinor });
    },
    onError: (e) => toast.error(e.message),
  });
  const applyCredit = trpc.finance.receipts.applyCredit.useMutation({
    onSuccess: (r) => {
      toast.success(`سُوّي ${money.fmt(r.used)} من الرصيد الدائن على الفواتير`);
      void utils.finance.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  // التوزيع التلقائي المتوقع (الأقدم استحقاقاً أولاً)
  const auto: Record<string, number> = {};
  let left = amount ?? 0;
  for (const i of family.openInvoices) {
    const take = Math.min(left, i.balanceMinor);
    auto[i.id] = Math.max(0, take);
    left -= Math.max(0, take);
  }
  const manualTotal = Object.values(alloc).reduce<number>((s, v) => s + (v ?? 0), 0);
  const allocation = manual ? alloc : auto;
  const excess = (amount ?? 0) - (manual ? manualTotal : (amount ?? 0) - Math.max(0, left));
  const needsSession = method === "CASH" && !session.data?.open && data.roles.some((r) => r.key === "CASHIER");
  const valid =
    Boolean(amount && amount > 0) &&
    (!manual || manualTotal <= (amount ?? 0)) &&
    (method !== "CHEQUE" || (cheque.number.trim() && cheque.bank.trim())) &&
    ((method !== "BANK_TRANSFER" && method !== "SADAD") || reference.trim()) &&
    !needsSession;
  const submit = () => {
    if (!valid || create.isPending) return;
    create.mutate({
      guardianId: family.guardian.id,
      amountMinor: amount!,
      method,
      date,
      reference: reference.trim() || null,
      bankAccountId: method === "BANK_TRANSFER" || method === "CARD" || method === "SADAD" ? bankAccountId : null,
      chequeNumber: method === "CHEQUE" ? cheque.number : null,
      chequeBank: method === "CHEQUE" ? cheque.bank : null,
      chequeDate: method === "CHEQUE" ? cheque.date : null,
      allocations: manual ? Object.entries(alloc).filter(([, v]) => v && v > 0).map(([invoiceId, v]) => ({ invoiceId, amountMinor: v! })) : undefined,
      notes: notes.trim() || null,
      notify,
    });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submit();
      }
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) onChange();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-card p-4 shadow-card">
          <Avatar name={family.guardian.name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-[17px] font-semibold">{family.guardian.name}</p>
            <p className="text-[13px] text-fg-3">
              {family.guardian.phone ? (
                <bdi dir="ltr" className="tabular">
                  {family.guardian.phone}
                </bdi>
              ) : null}
              {" · "}
              {family.students.map((s) => s.fullName.split(" ")[0]).join("، ")}
            </p>
          </div>
          <Link href={`/finance/families/${family.guardian.id}`} className="text-[13px] text-fg-2 underline decoration-line underline-offset-4">
            كشف الحساب
          </Link>
          <Button size="sm" variant="ghost" icon={<Search className="size-3.5" />} onClick={onChange}>
            أسرة أخرى <Kbd>Esc</Kbd>
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Figure label="المستحق" value={money.fmt(family.totals.due)} />
          <Figure label="المتأخر" value={money.fmt(family.totals.overdue)} tone={family.totals.overdue ? "danger" : undefined} />
          <Figure
            label="رصيد دائن"
            value={money.fmt(family.creditBalance)}
            tone={family.creditBalance ? "success" : undefined}
            hint={
              family.creditBalance > 0 && family.openInvoices.length && can("collections", "update") ? (
                <button className="underline" disabled={applyCredit.isPending} onClick={() => applyCredit.mutate({ guardianId: family.guardian.id })}>
                  تسويته على الفواتير
                </button>
              ) : undefined
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <h3 className="text-[14px] font-semibold">الفواتير المفتوحة</h3>
          {family.openInvoices.length ? (
            <label className="flex items-center gap-2 text-[13px] text-fg-2">
              تخصيص يدوي
              <Switch checked={manual} onChange={(on) => (setManual(on), setAlloc(on ? { ...auto } : {}))} />
            </label>
          ) : null}
        </div>
        {family.openInvoices.length ? (
          <FinTable
            head={
              <tr>
                <th>الفاتورة</th>
                <th>الطالب</th>
                <th>الاستحقاق</th>
                <th className={num}>المتبقي</th>
                <th className={num}>يُخصص</th>
              </tr>
            }
          >
            {family.openInvoices.map((i) => (
              <tr key={i.id}>
                <td>
                  <Link href={`/finance/invoices/${i.id}`} className="tabular hover:underline">
                    {docNo(i.number, prefs.digits)}
                  </Link>
                  <Tag size="sm" color={INVOICE_STATUS[i.status].color} className="ms-2">
                    {INVOICE_STATUS[i.status].label}
                  </Tag>
                </td>
                <td>{i.student}</td>
                <td className={cn("whitespace-nowrap", i.status === "OVERDUE" && "text-danger-700")}>{fmtDate(i.installments.find((x) => x.paidMinor < x.amountMinor)?.dueDate ?? i.dueDate)}</td>
                <td className={num}>{money.fmt(i.balanceMinor, false)}</td>
                <td className="w-[140px]">
                  {manual ? (
                    <MoneyInput value={alloc[i.id] ?? null} onChange={(v) => setAlloc({ ...alloc, [i.id]: v })} aria-label={`تخصيص الفاتورة ${i.number}`} />
                  ) : (
                    <span className={cn("block text-end tabular", allocation[i.id] ? "font-medium" : "text-fg-3")}>{allocation[i.id] ? money.fmt(allocation[i.id]!, false) : "—"}</span>
                  )}
                </td>
              </tr>
            ))}
          </FinTable>
        ) : (
          <p className="rounded-lg bg-card p-6 text-center text-[14px] text-fg-3 shadow-card">لا فواتير مفتوحة. أي مبلغ يُستلم يصبح رصيداً دائناً للأسرة.</p>
        )}
      </section>

      <section className="space-y-3 rounded-lg bg-card p-5 shadow-card lg:sticky lg:top-14 lg:self-start" ref={amountRef}>
        <h3 className="text-[15px] font-semibold">سند القبض</h3>
        <Field label="المبلغ المستلم">
          <MoneyInput value={amount} onChange={setAmount} autoFocus className="[&_input]:h-11 [&_input]:text-[20px]" onEnter={submit} aria-label="المبلغ المستلم" />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {family.totals.overdue && family.totals.overdue !== family.totals.due ? (
            <Button size="xs" variant="subtle" onClick={() => setAmount(family.totals.overdue)}>
              المتأخر فقط
            </Button>
          ) : null}
          {family.totals.due ? (
            <Button size="xs" variant="subtle" onClick={() => setAmount(family.totals.due)}>
              كامل المستحق
            </Button>
          ) : null}
        </div>
        <Field label="طريقة الدفع">
          <div className="grid grid-cols-3 gap-1.5">
            {METHODS.map((m) => (
              <button key={m} onClick={() => setMethod(m)} className={cn("h-8 rounded-md px-2 text-[13px] shadow-[0_0_0_1px_var(--border)]", method === m ? "bg-navy-700 font-medium text-on-primary shadow-none" : "hover:bg-hover")}>
                {PAYMENT_METHOD[m].label.split(" ")[0]}
              </button>
            ))}
          </div>
        </Field>
        {needsSession ? <p className="rounded-md bg-warning-50 px-3 py-2 text-[13px] text-warning-700">افتح وردية الصندوق أعلى الصفحة قبل استلام النقد.</p> : null}
        {method === "CHEQUE" ? (
          <div className="grid grid-cols-2 gap-2">
            <Field label="رقم الشيك">
              <Input dir="ltr" value={cheque.number} onChange={(e) => setCheque({ ...cheque, number: e.target.value })} />
            </Field>
            <Field label="تاريخ الشيك">
              <Input type="date" value={cheque.date} onChange={(e) => setCheque({ ...cheque, date: e.target.value })} />
            </Field>
            <Field label="البنك المسحوب عليه" className="col-span-2">
              <Input value={cheque.bank} onChange={(e) => setCheque({ ...cheque, bank: e.target.value })} placeholder="مثال: مصرف الراجحي" />
            </Field>
          </div>
        ) : null}
        {method === "BANK_TRANSFER" || method === "SADAD" || method === "CARD" ? (
          <>
            <Field label={method === "CARD" ? "رقم العملية (اختياري)" : "رقم المرجع"}>
              <Input dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            {banks.data?.banks.length ? (
              <Field label="الحساب البنكي المستلم">
                <Select value={bankAccountId ?? "default"} onChange={(v) => setBankAccountId(v === "default" ? null : v)} options={[{ value: "default", label: "الحساب الافتراضي" }, ...banks.data.banks.filter((b) => b.isActive).map((b) => ({ value: b.id, label: b.name }))]} />
              </Field>
            ) : null}
          </>
        ) : null}
        <Field label="التاريخ">
          <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <Field label="ملاحظة (اختياري)">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <label className="flex items-center justify-between text-[13px] text-fg-2">
          إرسال السند لولي الأمر
          <Switch checked={notify} onChange={setNotify} />
        </label>
        {amount ? (
          <p className={cn("rounded-md px-3 py-2 text-[13px]", excess > 0 ? "bg-teal-50 text-teal-700" : "bg-hover text-fg-2")}>
            {manual && manualTotal > amount ? <span className="text-danger-700">مجموع التخصيص أكبر من المبلغ.</span> : excess > 0 ? `يُضاف ${money.fmt(excess)} رصيداً دائناً للأسرة.` : "يُوزَّع كامل المبلغ على الفواتير."}
          </p>
        ) : null}
        <Button variant="primary" size="lg" className="w-full justify-center" icon={<Banknote className="size-4" />} loading={create.isPending} disabled={!valid} onClick={submit}>
          حفظ السند <Kbd className="ms-1 bg-white/15 text-on-primary">Ctrl+Enter</Kbd>
        </Button>
      </section>
    </div>
  );
}

function ReceiptDone({ done, onNew, onSameFamily }: { done: { id: string; number: number; amount: number }; onNew: () => void; onSameFamily: () => void }) {
  const prefs = usePrefs();
  const money = useMoney();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") (e.preventDefault(), onNew());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNew]);
  return (
    <section className="mx-auto max-w-lg rounded-lg bg-card p-8 text-center shadow-card">
      <CheckCircle2 className="mx-auto size-10 text-success-800" />
      <h2 className="mt-3 text-[20px] font-bold">سند قبض رقم {docNo(done.number, prefs.digits)}</h2>
      <p className="mt-1 text-[24px] font-bold tabular">{money.fmt(done.amount)}</p>
      <p className="mt-1 text-[13px] text-fg-3">رُحّل القيد تلقائياً وحُدّثت الفواتير.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onNew}>
          سند جديد <Kbd className="ms-1 bg-white/15 text-on-primary">Enter</Kbd>
        </Button>
        <Link href={`/finance/receipts/${done.id}`}>
          <Button icon={<Printer className="size-3.5" />}>عرض وطباعة</Button>
        </Link>
        <Button variant="ghost" onClick={onSameFamily}>
          سند آخر للأسرة نفسها
        </Button>
      </div>
    </section>
  );
}

/** شريط الوردية أعلى التحصيل */
function CashSessionBar() {
  const money = useMoney();
  const fmtDate = useFmtDate();
  const q = trpc.finance.receipts.cashSession.useQuery(undefined, { retry: false });
  if (q.error || !q.data) return null;
  const s = q.data.open;
  return (
    <div className={cn("mb-5 flex flex-wrap items-center gap-3 rounded-lg px-4 py-2.5 text-[13px]", s ? "bg-success-50 text-success-800" : "bg-hover text-fg-2")}>
      {s ? <Unlock className="size-4" /> : <Lock className="size-4" />}
      {s ? (
        <span className="flex-1">
          ورديتك مفتوحة منذ {fmtDate(s.openedAt)} · نقد مستلم {money.fmt(s.collectedMinor)} في {s.count} سند · المتوقع في الدرج {money.fmt(s.expectedMinor)}
        </span>
      ) : (
        <span className="flex-1">لا وردية مفتوحة. النقد يحتاج وردية لأمين الصندوق.</span>
      )}
      <Link href="/finance/collect/session" className="font-medium underline underline-offset-4">
        {s ? "إغلاق الوردية" : "فتح وردية"}
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------
// وردية الصندوق
// ---------------------------------------------------------------------

export function CashSessionPage() {
  const money = useMoney();
  const fmtDate = useFmtDate();
  const q = trpc.finance.receipts.cashSession.useQuery();
  const utils = trpc.useUtils();
  const [float, setFloat] = useState<number | null>(0);
  const [counted, setCounted] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const onError = (e: { message: string }) => toast.error(e.message);
  const open = trpc.finance.receipts.openSession.useMutation({ onSuccess: () => (toast.success("فُتحت الوردية"), void utils.finance.receipts.cashSession.invalidate()), onError });
  const close = trpc.finance.receipts.closeSession.useMutation({
    onSuccess: (s) => {
      toast.success(s.differenceMinor ? `أُغلقت الوردية بفرق ${money.fmt(s.differenceMinor!)} وقُيّد الفرق` : "أُغلقت الوردية مطابقة");
      setCounted(null);
      void utils.finance.receipts.cashSession.invalidate();
    },
    onError,
  });
  const s = q.data?.open;
  return (
    <ModuleShell nav={financeNav("collect")} tabs={COLLECT_TABS}>
      {q.error ? <EmptyState illustration="lock" title="الوردية لأمناء الصندوق" description={q.error.message} /> : null}
      {!q.data && !q.error ? <SkeletonLines lines={8} /> : null}
      {q.data ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-lg bg-card p-5 shadow-card">
            {s ? (
              <>
                <h2 className="flex items-center gap-2 text-[16px] font-semibold">
                  <Unlock className="size-4 text-success-800" /> وردية مفتوحة
                </h2>
                <dl className="mt-4 grid grid-cols-2 gap-y-2 text-[14px]">
                  <dt className="text-fg-3">فُتحت</dt>
                  <dd>{fmtDate(s.openedAt, "long")}</dd>
                  <dt className="text-fg-3">عهدة الافتتاح</dt>
                  <dd className="tabular">{money.fmt(s.openingFloatMinor)}</dd>
                  <dt className="text-fg-3">نقد مستلم</dt>
                  <dd className="tabular">
                    {money.fmt(s.collectedMinor)} ({s.count} سند)
                  </dd>
                  <dt className="font-semibold">المتوقع في الدرج</dt>
                  <dd className="font-semibold tabular">{money.fmt(s.expectedMinor)}</dd>
                </dl>
                <div className="mt-5 space-y-3 border-t border-line pt-4">
                  <Field label="النقد المعدود فعلياً">
                    <MoneyInput value={counted} onChange={setCounted} />
                  </Field>
                  {counted !== null ? (
                    <p className={cn("rounded-md px-3 py-2 text-[13px]", counted === s.expectedMinor ? "bg-success-50 text-success-800" : "bg-warning-50 text-warning-700")}>
                      {counted === s.expectedMinor ? "مطابق." : counted < s.expectedMinor ? `عجز ${money.fmt(s.expectedMinor - counted)} يُقيَّد على فروقات الصندوق.` : `زيادة ${money.fmt(counted - s.expectedMinor)} تُقيَّد على فروقات الصندوق.`}
                    </p>
                  ) : null}
                  <Field label="ملاحظة">
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                  <Button variant="primary" icon={<Lock className="size-3.5" />} loading={close.isPending} disabled={counted === null} onClick={() => close.mutate({ countedMinor: counted!, note: note || null })}>
                    إغلاق الوردية
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2 className="flex items-center gap-2 text-[16px] font-semibold">
                  <Lock className="size-4 text-fg-3" /> لا وردية مفتوحة
                </h2>
                <p className="mt-1 text-[13px] text-fg-3">افتح وردية بعهدة الدرج؛ كل سند نقدي يُسجل عليها، وعند الإغلاق يُطابق المعدود مع المتوقع.</p>
                <div className="mt-4 space-y-3">
                  <Field label="عهدة الافتتاح">
                    <MoneyInput value={float} onChange={setFloat} />
                  </Field>
                  <Button variant="primary" icon={<Unlock className="size-3.5" />} loading={open.isPending} onClick={() => open.mutate({ openingFloatMinor: float ?? 0 })}>
                    فتح وردية
                  </Button>
                </div>
              </>
            )}
          </section>
          <section>
            <h3 className="mb-2 text-[14px] font-semibold">الورديات السابقة</h3>
            {q.data.recent.filter((r) => r.status === "CLOSED").length ? (
              <FinTable
                dense
                head={
                  <tr>
                    <th>التاريخ</th>
                    <th className={num}>المتوقع</th>
                    <th className={num}>المعدود</th>
                    <th className={num}>الفرق</th>
                  </tr>
                }
              >
                {q.data.recent
                  .filter((r) => r.status === "CLOSED")
                  .map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDate(r.openedAt)}</td>
                      <td className={num}>{money.fmt(r.expectedMinor ?? 0, false)}</td>
                      <td className={num}>{money.fmt(r.countedMinor ?? 0, false)}</td>
                      <td className={cn(num, r.differenceMinor ? "text-warning-700" : "text-fg-3")}>{r.differenceMinor ? money.fmt(r.differenceMinor, false) : "مطابق"}</td>
                    </tr>
                  ))}
              </FinTable>
            ) : (
              <p className="text-[13px] text-fg-3">لا ورديات مغلقة بعد.</p>
            )}
          </section>
        </div>
      ) : null}
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// سجل السندات والشيكات
// ---------------------------------------------------------------------

export function ReceiptsList() {
  const today = useToday();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [range, setRange] = useState({ from: monthStart(today), to: today });
  const [method, setMethod] = useState<PaymentMethodKey | "all">("all");
  const [search, setSearch] = useState("");
  const q = useDebounced(search, 250);
  const list = trpc.finance.receipts.list.useQuery({ ...range, method: method === "all" ? null : method, q: q || null });
  const rows = list.data ?? [];
  const posted = rows.filter((r) => r.status === "POSTED" && r.chequeStatus !== "BOUNCED");
  return (
    <ModuleShell nav={financeNav("collect")} tabs={COLLECT_TABS} wide>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <RangePicker from={range.from} to={range.to} onChange={setRange} />
        <Select size="sm" className="w-44" value={method} onChange={(v) => setMethod(v as PaymentMethodKey | "all")} options={[{ value: "all", label: "كل الطرق" }, ...METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD[m].label }))]} />
        <Input className="h-7 w-56 text-[13px]" placeholder="رقم السند، الدافع، المرجع" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <section className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="إجمالي المحصّل" value={money.fmt(posted.reduce((s, r) => s + r.amountMinor, 0))} hint={`${formatNumber(posted.length, prefs.digits)} سند`} />
        {METHODS.filter((m) => posted.some((r) => r.method === m))
          .slice(0, 3)
          .map((m) => (
            <Figure key={m} label={PAYMENT_METHOD[m].label} value={money.fmt(posted.filter((r) => r.method === m).reduce((s, r) => s + r.amountMinor, 0))} />
          ))}
      </section>
      {!list.data ? (
        <SkeletonLines lines={10} />
      ) : list.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض السندات" description={list.error.message} />
      ) : rows.length ? (
        <FinTable
          head={
            <tr>
              <th>الرقم</th>
              <th>التاريخ</th>
              <th>الدافع</th>
              <th>الطريقة</th>
              <th>المرجع</th>
              <th>أمين الصندوق</th>
              <th className={num}>المبلغ</th>
            </tr>
          }
        >
          {rows.map((r) => (
            <tr key={r.id} className={cn(r.status === "VOID" && "text-fg-3 line-through")}>
              <td>
                <Link href={`/finance/receipts/${r.id}`} className="tabular hover:underline">
                  {docNo(r.number, prefs.digits)}
                </Link>
              </td>
              <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
              <td>{r.payerName}</td>
              <td>
                <Tag size="sm" color={PAYMENT_METHOD[r.method].color}>
                  {PAYMENT_METHOD[r.method].label}
                </Tag>
                {r.chequeStatus ? (
                  <Tag size="sm" color={CHEQUE_STATUS[r.chequeStatus as keyof typeof CHEQUE_STATUS].color} className="ms-1">
                    {CHEQUE_STATUS[r.chequeStatus as keyof typeof CHEQUE_STATUS].label}
                  </Tag>
                ) : null}
              </td>
              <td>
                <bdi dir="ltr" className="tabular text-fg-2">
                  {r.chequeNumber ?? r.reference ?? ""}
                </bdi>
              </td>
              <td className="text-fg-2">{r.cashier ?? "—"}</td>
              <td className={num}>{money.fmt(r.amountMinor, false)}</td>
            </tr>
          ))}
        </FinTable>
      ) : (
        <EmptyState compact illustration="table" title="لا سندات في هذه الفترة" action={<Link href="/finance/collect"><Button variant="primary">سند قبض جديد</Button></Link>} />
      )}
    </ModuleShell>
  );
}

export function ChequesPage() {
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const { can } = useApp();
  const list = trpc.finance.receipts.list.useQuery({ method: "CHEQUE" });
  const [status, setStatus] = useState<"PENDING" | "CLEARED" | "BOUNCED">("PENDING");
  const [acting, setActing] = useState<{ id: string; action: "CLEAR" | "BOUNCE" } | null>(null);
  const rows = (list.data ?? []).filter((r) => r.chequeStatus === status && (status !== "PENDING" || r.status === "POSTED"));
  const counts = (s: string) => (list.data ?? []).filter((r) => r.chequeStatus === s && (s !== "PENDING" || r.status === "POSTED")).length;
  return (
    <ModuleShell nav={financeNav("collect")} tabs={COLLECT_TABS} wide>
      <div className="mb-4">
        <Segmented
          value={status}
          onChange={setStatus}
          options={(["PENDING", "CLEARED", "BOUNCED"] as const).map((s) => ({ value: s, label: `${CHEQUE_STATUS[s].label} (${formatNumber(counts(s), prefs.digits)})` }))}
        />
      </div>
      {!list.data ? (
        <SkeletonLines lines={8} />
      ) : rows.length ? (
        <FinTable
          head={
            <tr>
              <th>السند</th>
              <th>رقم الشيك</th>
              <th>البنك</th>
              <th>تاريخ الشيك</th>
              <th>الدافع</th>
              <th className={num}>المبلغ</th>
              {status === "PENDING" && can("collections", "update") ? <th /> : null}
            </tr>
          }
        >
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <Link href={`/finance/receipts/${r.id}`} className="tabular hover:underline">
                  {docNo(r.number, prefs.digits)}
                </Link>
              </td>
              <td>
                <bdi dir="ltr" className="tabular">
                  {r.chequeNumber}
                </bdi>
              </td>
              <td>{r.chequeBank}</td>
              <td className={cn("whitespace-nowrap", status === "PENDING" && r.chequeDate && new Date(r.chequeDate) < new Date() && "text-warning-700")}>{fmtDate(r.chequeDate)}</td>
              <td>{r.payerName}</td>
              <td className={num}>{money.fmt(r.amountMinor, false)}</td>
              {status === "PENDING" && can("collections", "update") ? (
                <td className="whitespace-nowrap text-end">
                  <Button size="xs" variant="subtle" icon={<Landmark className="size-3" />} onClick={() => setActing({ id: r.id, action: "CLEAR" })}>
                    تحصيل
                  </Button>{" "}
                  <Button size="xs" variant="ghost" className="text-danger-700" icon={<CircleSlash className="size-3" />} onClick={() => setActing({ id: r.id, action: "BOUNCE" })}>
                    ارتداد
                  </Button>
                </td>
              ) : null}
            </tr>
          ))}
        </FinTable>
      ) : (
        <EmptyState compact illustration="table" title={status === "PENDING" ? "لا شيكات تحت التحصيل" : "لا شيكات بهذه الحالة"} />
      )}
      {acting ? <ChequeDialog receiptId={acting.id} action={acting.action} onClose={() => setActing(null)} /> : null}
    </ModuleShell>
  );
}

function ChequeDialog({ receiptId, action, onClose }: { receiptId: string; action: "CLEAR" | "BOUNCE"; onClose: () => void }) {
  const today = useToday();
  const { can } = useApp();
  const utils = trpc.useUtils();
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [bank, setBank] = useState<string | null>(null);
  const banks = trpc.finance.banking.accounts.useQuery(undefined, { enabled: action === "CLEAR" && can("banking", "view") });
  const m = trpc.finance.receipts.cheque.useMutation({
    onSuccess: () => {
      toast.success(action === "CLEAR" ? "حُصّل الشيك وأُودع في البنك" : "سُجل ارتداد الشيك وعاد الدين على الأسرة");
      void utils.finance.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={action === "CLEAR" ? "تحصيل الشيك" : "ارتداد الشيك"} description={action === "CLEAR" ? "يُنقل المبلغ من «شيكات تحت التحصيل» إلى الحساب البنكي." : "تُعكس تخصيصات السند وتعود الفواتير مستحقة، ويُبلَّغ ولي الأمر في التذكير القادم."}>
        <div className="space-y-3 px-5 pb-4">
          <Field label="التاريخ">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          {action === "CLEAR" && banks.data?.banks.length ? (
            <Field label="أُودع في">
              <Select value={bank ?? "default"} onChange={(v) => setBank(v === "default" ? null : v)} options={[{ value: "default", label: "الحساب الافتراضي" }, ...banks.data.banks.map((b) => ({ value: b.id, label: b.name }))]} />
            </Field>
          ) : null}
          {action === "BOUNCE" ? (
            <Field label="سبب الارتداد">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: رصيد غير كافٍ" />
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant={action === "CLEAR" ? "primary" : "danger"} loading={m.isPending} onClick={() => m.mutate({ receiptId, action, date, bankAccountId: bank, note: note || null })}>
            {action === "CLEAR" ? "تحصيل" : "تسجيل الارتداد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// صفحة السند
// ---------------------------------------------------------------------

export function ReceiptDetail({ id }: { id: string }) {
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const { tenant } = useApp();
  const q = trpc.finance.receipts.get.useQuery({ id });
  const utils = trpc.useUtils();
  const [voiding, setVoiding] = useState(false);
  const [acting, setActing] = useState<"CLEAR" | "BOUNCE" | null>(null);
  const [reason, setReason] = useState("");
  const voidM = trpc.finance.receipts.void.useMutation({
    onSuccess: () => {
      toast.success("أُلغي السند بقيد عكسي");
      setVoiding(false);
      void utils.finance.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const r = q.data;
  const nav = financeNav("collect");
  if (q.error) {
    return (
      <ModuleShell nav={nav} title="سند قبض">
        <EmptyState illustration="lock" title="لا يمكن عرض السند" description={q.error.message} />
      </ModuleShell>
    );
  }
  const title = r ? `سند قبض ${docNo(r.number, prefs.digits)}` : "سند قبض";
  return (
    <ModuleShell
      nav={nav}
      title={title}
      crumbs={r ? [{ title }] : []}
      actions={
        r ? (
          <>
            <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
              طباعة
            </Button>
            {r.canManage && r.status === "POSTED" && r.chequeStatus === "PENDING" ? (
              <>
                <Button size="sm" icon={<Landmark className="size-3.5" />} onClick={() => setActing("CLEAR")}>
                  تحصيل الشيك
                </Button>
                <Button size="sm" variant="ghost" icon={<RotateCcw className="size-3.5" />} onClick={() => setActing("BOUNCE")}>
                  ارتداد
                </Button>
              </>
            ) : null}
            {r.canManage && r.status === "POSTED" && (!r.chequeStatus || r.chequeStatus === "PENDING") ? (
              <Button size="sm" variant="ghost" className="text-danger-700" icon={<Ban className="size-3.5" />} onClick={() => setVoiding(true)}>
                إلغاء السند
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {!r ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <article className="mx-auto max-w-[760px] rounded-lg bg-card p-8 shadow-card print:p-0 print:shadow-none">
          <header className="flex items-start justify-between border-b border-line pb-4">
            <div>
              <p className="text-[18px] font-bold">{tenant.name}</p>
              <p className="text-[13px] text-fg-3">سند قبض</p>
            </div>
            <div className="text-end text-[13px]">
              <p>
                الرقم: <b className="tabular">{docNo(r.number, prefs.digits)}</b>
              </p>
              <p>التاريخ: {fmtDate(r.date, "long")}</p>
              {r.status === "VOID" ? <Tag color="red">ملغى</Tag> : r.chequeStatus ? <Tag color={CHEQUE_STATUS[r.chequeStatus as keyof typeof CHEQUE_STATUS].color}>{CHEQUE_STATUS[r.chequeStatus as keyof typeof CHEQUE_STATUS].label}</Tag> : null}
            </div>
          </header>
          <section className="py-5 text-[15px] leading-8">
            <p>
              استلمنا من: <b>{r.payerName}</b>
              {r.student ? (
                <>
                  {" "}
                  عن الطالب/ة <b>{r.student.fullName}</b> (<bdi className="tabular">{r.student.academicNumber}</bdi>)
                </>
              ) : null}
            </p>
            <p>
              مبلغاً وقدره: <b className="text-[18px] tabular">{money.fmt(r.amountMinor)}</b>
            </p>
            <p>
              طريقة الدفع: {PAYMENT_METHOD[r.method].label}
              {r.chequeNumber ? (
                <>
                  {" "}
                  — شيك رقم <bdi dir="ltr">{r.chequeNumber}</bdi> على {r.chequeBank} بتاريخ {fmtDate(r.chequeDate)}
                </>
              ) : null}
              {r.reference && !r.chequeNumber ? (
                <>
                  {" "}
                  — مرجع <bdi dir="ltr">{r.reference}</bdi>
                </>
              ) : null}
              {r.bankName ? ` — ${r.bankName}` : ""}
            </p>
            {r.notes ? <p className="text-[14px] text-fg-2">{r.notes}</p> : null}
          </section>
          <h3 className="mb-2 text-[13px] font-semibold">وذلك سداداً لـ</h3>
          <table className="w-full text-[13px]">
            <tbody>
              {r.allocations.map((a) => (
                <tr key={a.id} className={cn("border-b border-line/60 [&_td]:py-1.5", a.reversedAt && "text-fg-3 line-through")}>
                  <td>
                    <Link href={`/finance/invoices/${a.invoice.id}`} className="hover:underline">
                      فاتورة {docNo(a.invoice.number, prefs.digits)}
                    </Link>{" "}
                    — {a.invoice.student.fullName}
                  </td>
                  <td className={num}>{money.fmt(a.amountMinor)}</td>
                </tr>
              ))}
              {r.unappliedMinor ? (
                <tr className="border-b border-line/60 [&_td]:py-1.5">
                  <td>رصيد دائن لحساب الأسرة</td>
                  <td className={num}>{money.fmt(r.unappliedMinor)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <footer className="mt-10 grid grid-cols-2 gap-6 text-[13px] text-fg-2">
            <p>أمين الصندوق: {r.cashier ?? "—"}</p>
            <p className="text-end">التوقيع: ....................</p>
          </footer>
          <div className="no-print mt-6 flex flex-wrap gap-4 border-t border-line pt-4 text-[13px]">
            {r.journalEntry ? (
              <Link href={`/finance/accounting/entries/${r.journalEntry.id}`} className="text-fg-2 underline decoration-line underline-offset-4">
                القيد رقم {docNo(r.journalEntry.number, prefs.digits)}
              </Link>
            ) : null}
            {r.guardian ? (
              <Link href={`/finance/families/${r.guardian.id}`} className="text-fg-2 underline decoration-line underline-offset-4">
                كشف حساب الأسرة
              </Link>
            ) : null}
            {r.voidReason ? <span className="text-danger-700">السبب: {r.voidReason}</span> : null}
          </div>
        </article>
      )}
      <Dialog open={voiding} onOpenChange={setVoiding}>
        <DialogContent title="إلغاء السند" description="يُعكس القيد وتعود الفواتير مستحقة. يبقى السند برقمه في السجل بحالة «ملغى».">
          <div className="px-5 pb-4">
            <Field label="السبب">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoiding(false)}>
              تراجع
            </Button>
            <Button variant="danger" loading={voidM.isPending} disabled={reason.trim().length < 3} onClick={() => voidM.mutate({ id, reason })}>
              إلغاء السند
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {acting ? <ChequeDialog receiptId={id} action={acting} onClose={() => setActing(null)} /> : null}
    </ModuleShell>
  );
}

