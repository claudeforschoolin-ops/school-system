"use client";
/**
 * الفواتير: الصفحة الرئيسية (قاعدة بيانات بعروضها)، صفحة الفاتورة (طباعة ضريبية برمز QR، الأقساط،
 * المدفوعات، الإشعارات الدائنة/المدينة، الإلغاء)، ونافذة إصدار فاتورة بمعاينة حيّة.
 */
import { Ban, Banknote, BellOff, BellRing, FileMinus2, FilePlus2, FileText, Plus, Printer, Timer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { zatcaQrPayload } from "@/lib/finance/calc";
import { CREDIT_NOTE_KIND, INVOICE_STATUS, PAYMENT_METHOD } from "@/lib/finance/labels";
import { minorToDecimalString } from "@/lib/money";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { DatabaseView } from "@/components/database/database-view";
import { ModuleShell } from "@/components/modules/module-shell";
import { Meter } from "@/components/academic/common";
import type { CreateDialogProps } from "@/components/students/create-dialogs";
import { StudentPicker, type PickedStudent } from "@/components/students/student-picker";
import { docNo, financeNav, INVOICE_TABS, MoneyInput, num, useFmtDate, useMoney } from "./common";

type Invoice = RouterOutputs["finance"]["invoices"]["get"];

// ---------------------------------------------------------------------
// الصفحة الرئيسية
// ---------------------------------------------------------------------

export function InvoicesHome() {
  const { can } = useApp();
  const prefs = usePrefs();
  const db = trpc.finance.invoices.databaseId.useQuery();
  const utils = trpc.useUtils();
  const [lateOpen, setLateOpen] = useState(false);
  const late = trpc.finance.invoices.applyLateFees.useMutation({
    onSuccess: (r) => {
      setLateOpen(false);
      toast.success(r.created ? `صدرت ${formatNumber(r.created, prefs.digits)} فاتورة غرامة تأخير` : "لا فواتير تستحق غرامة اليوم");
      void utils.database.rows.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const actions = can("invoices", "create") ? (
    <>
      <Button size="sm" icon={<Timer className="size-3.5" />} onClick={() => setLateOpen(true)}>
        غرامات التأخير
      </Button>
      <Link href="/finance/invoices/bulk">
        <Button size="sm" icon={<FilePlus2 className="size-3.5" />}>
          فوترة جماعية
        </Button>
      </Link>
    </>
  ) : null;
  return (
    <ModuleShell nav={financeNav("invoices")} tabs={INVOICE_TABS} wide actions={actions}>
      {db.error ? <EmptyState illustration="lock" title="لا يمكن عرض الفواتير" description={db.error.message} /> : db.data ? <DatabaseView databaseId={db.data} mode="page" /> : <Skeleton className="h-64 w-full" />}
      <ConfirmDialog
        open={lateOpen}
        onOpenChange={setLateOpen}
        title="احتساب غرامات التأخير؟"
        description="تصدر فاتورة غرامة لكل قسط تجاوز فترة السماح حسب خطة الأقساط، مرة واحدة لكل قسط."
        confirmLabel="احتساب"
        loading={late.isPending}
        onConfirm={() => late.mutate({})}
      />
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// صفحة الفاتورة
// ---------------------------------------------------------------------

export function InvoiceDetail({ id }: { id: string }) {
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const q = trpc.finance.invoices.get.useQuery({ id });
  const utils = trpc.useUtils();
  const refresh = () => Promise.all([utils.finance.invoices.get.invalidate({ id }), utils.database.rows.invalidate()]);
  const onError = (e: { message: string }) => toast.error(e.message);
  const pause = trpc.finance.invoices.pauseReminders.useMutation({ onSuccess: () => void refresh(), onError });
  const [dialog, setDialog] = useState<null | "credit" | "debit" | "cancel">(null);
  const inv = q.data;
  const nav = financeNav("invoices");
  if (q.error) {
    return (
      <ModuleShell nav={nav} title="الفاتورة">
        <EmptyState illustration="lock" title="لا يمكن عرض الفاتورة" description={q.error.message} />
      </ModuleShell>
    );
  }
  const title = inv ? `فاتورة ${docNo(inv.number, prefs.digits)}` : "الفاتورة";
  const open = inv && (inv.status === "ISSUED" || inv.status === "PARTIAL");
  const actions = inv ? (
    <>
      <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
        طباعة
      </Button>
      {open && inv.permissions.canCollect && inv.guardian ? (
        <Link href={`/finance/collect?guardian=${inv.guardian.id}`}>
          <Button size="sm" variant="primary" icon={<Banknote className="size-3.5" />}>
            تحصيل
          </Button>
        </Link>
      ) : null}
    </>
  ) : null;
  return (
    <ModuleShell nav={nav} title={title} crumbs={inv ? [{ title }] : []} actions={actions} wide>
      {!inv ? <SkeletonLines lines={14} /> : null}
      {inv ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <InvoiceDocument inv={inv} />
          <aside className="no-print space-y-4">
            <section className="rounded-lg bg-card p-4 shadow-card">
              <div className="flex items-center justify-between">
                <Tag color={INVOICE_STATUS[inv.displayStatus].color}>{INVOICE_STATUS[inv.displayStatus].label}</Tag>
                <span className="text-[12px] text-fg-3">{inv.academicYear}</span>
              </div>
              <p className="mt-3 text-[12px] text-fg-3">المتبقي</p>
              <p className={cn("text-[26px] font-bold tabular", inv.balanceMinor > 0 && inv.displayStatus === "OVERDUE" && "text-danger-700")}>{money.fmt(inv.status === "CANCELLED" ? 0 : inv.balanceMinor)}</p>
              <Meter className="mt-2" value={inv.paidMinor + inv.creditedMinor} max={inv.totalMinor || 1} warnAt={2} />
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[13px]">
                <dt className="text-fg-3">الإجمالي</dt>
                <dd className={num}>{money.fmt(inv.totalMinor)}</dd>
                <dt className="text-fg-3">المدفوع</dt>
                <dd className={num}>{money.fmt(inv.paidMinor)}</dd>
                {inv.creditedMinor ? (
                  <>
                    <dt className="text-fg-3">إشعارات دائنة</dt>
                    <dd className={num}>{money.fmt(inv.creditedMinor)}</dd>
                  </>
                ) : null}
              </dl>
              {inv.guardian ? (
                <Link href={`/finance/families/${inv.guardian.id}`} className="mt-3 block text-[13px] text-fg-2 underline decoration-line underline-offset-4">
                  كشف حساب الأسرة
                </Link>
              ) : null}
              {inv.journalEntry ? (
                <Link href={`/finance/accounting/entries/${inv.journalEntry.id}`} className="mt-1 block text-[13px] text-fg-2 underline decoration-line underline-offset-4">
                  قيد الإصدار رقم {docNo(inv.journalEntry.number, prefs.digits)}
                </Link>
              ) : null}
            </section>

            {inv.permissions.canEdit && inv.status !== "CANCELLED" ? (
              <section className="rounded-lg bg-card p-2 shadow-card">
                {open ? (
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[14px] hover:bg-hover" onClick={() => setDialog("credit")}>
                    <FileMinus2 className="size-4 text-fg-3" /> إشعار دائن (تخفيض)
                  </button>
                ) : null}
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[14px] hover:bg-hover" onClick={() => setDialog("debit")}>
                  <FilePlus2 className="size-4 text-fg-3" /> إشعار مدين (رسوم إضافية)
                </button>
                {open ? (
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[14px] hover:bg-hover" onClick={() => pause.mutate({ id, paused: !inv.remindersPaused })}>
                    {inv.remindersPaused ? <BellRing className="size-4 text-fg-3" /> : <BellOff className="size-4 text-fg-3" />}
                    {inv.remindersPaused ? "استئناف التذكيرات" : "إيقاف التذكيرات مؤقتاً"}
                  </button>
                ) : null}
                {inv.paidMinor === 0 && inv.creditedMinor === 0 ? (
                  <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-[14px] text-danger-700 hover:bg-hover" onClick={() => setDialog("cancel")}>
                    <Ban className="size-4" /> إلغاء الفاتورة
                  </button>
                ) : null}
              </section>
            ) : null}
            {inv.status === "CANCELLED" ? <p className="rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">أُلغيت: {inv.cancelReason}</p> : null}

            <SideList title="الأقساط">
              {inv.installments.map((i) => (
                <li key={i.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="block">{i.label}</span>
                    <span className="block text-[12px] text-fg-3">{fmtDate(i.dueDate)}</span>
                  </span>
                  <span className="text-end">
                    <span className="block tabular">{money.fmt(i.amountMinor)}</span>
                    <span className={cn("block text-[11px]", i.paidMinor >= i.amountMinor ? "text-success-800" : "text-fg-3")}>{i.paidMinor >= i.amountMinor ? "مسدد" : i.paidMinor ? `مدفوع ${money.fmt(i.paidMinor)}` : "غير مسدد"}</span>
                  </span>
                </li>
              ))}
            </SideList>

            <SideList title="المدفوعات" empty="لا مدفوعات بعد">
              {inv.allocations.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                  {a.receipt ? (
                    <Link href={`/finance/receipts/${a.receipt.id}`} className="min-w-0 flex-1 hover:underline">
                      سند {docNo(a.receipt.number, prefs.digits)} · {PAYMENT_METHOD[a.receipt.method].label}
                      <span className="block text-[12px] text-fg-3">{fmtDate(a.receipt.date)}</span>
                    </Link>
                  ) : (
                    <span className="min-w-0 flex-1">
                      من الرصيد الدائن للأسرة
                      <span className="block text-[12px] text-fg-3">{fmtDate(a.createdAt)}</span>
                    </span>
                  )}
                  <span className="tabular">{money.fmt(a.amountMinor)}</span>
                </li>
              ))}
            </SideList>

            {inv.creditNotes.length ? (
              <SideList title="الإشعارات الدائنة">
                {inv.creditNotes.map((c) => (
                  <li key={c.id} className="py-1.5 text-[13px]">
                    <div className="flex items-center gap-2">
                      <span className="flex-1">
                        إشعار {docNo(c.number, prefs.digits)} <Tag size="sm" color={CREDIT_NOTE_KIND[c.kind as keyof typeof CREDIT_NOTE_KIND]?.color ?? "gray"}>{CREDIT_NOTE_KIND[c.kind as keyof typeof CREDIT_NOTE_KIND]?.label ?? c.kind}</Tag>
                      </span>
                      <span className="tabular">{money.fmt(c.totalMinor)}</span>
                    </div>
                    <p className="text-[12px] text-fg-3">{c.reason}</p>
                  </li>
                ))}
              </SideList>
            ) : null}
            {inv.lateFees.length ? (
              <SideList title="غرامات التأخير">
                {inv.lateFees.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 py-1.5 text-[13px]">
                    <Link href={`/finance/invoices/${l.id}`} className="flex-1 hover:underline">
                      فاتورة {docNo(l.number, prefs.digits)}
                    </Link>
                    <span className="tabular">{money.fmt(l.totalMinor)}</span>
                  </li>
                ))}
              </SideList>
            ) : null}
          </aside>
        </div>
      ) : null}
      {inv && dialog === "credit" ? <CreditNoteDialog inv={inv} onClose={() => setDialog(null)} onDone={refresh} /> : null}
      {inv && dialog === "debit" ? <DebitNoteDialog inv={inv} onClose={() => setDialog(null)} /> : null}
      {inv && dialog === "cancel" ? <CancelDialog inv={inv} onClose={() => setDialog(null)} onDone={refresh} /> : null}
    </ModuleShell>
  );
}

function SideList({ title, children, empty }: { title: string; children: React.ReactNode; empty?: string }) {
  const has = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="rounded-lg bg-card p-4 shadow-card">
      <h3 className="mb-1 text-[13px] font-semibold text-fg-2">{title}</h3>
      {has ? <ul className="divide-y divide-line/60">{children}</ul> : <p className="py-2 text-[13px] text-fg-3">{empty ?? "—"}</p>}
    </section>
  );
}

/** الفاتورة الضريبية المبسطة كما تُطبع */
function InvoiceDocument({ inv }: { inv: Invoice }) {
  const prefs = usePrefs();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const [qr, setQr] = useState<string | null>(null);
  const hasVat = Boolean(inv.seller.vatNumber);
  useEffect(() => {
    if (!hasVat) return;
    const payload = zatcaQrPayload({
      seller: inv.seller.name,
      vatNumber: inv.seller.vatNumber,
      timestamp: new Date(inv.createdAt).toISOString(),
      total: minorToDecimalString(inv.totalMinor, money.currency),
      vat: minorToDecimalString(inv.taxMinor, money.currency),
    });
    let alive = true;
    void import("qrcode").then((QR) => QR.toDataURL(payload, { margin: 0, width: 220, errorCorrectionLevel: "M" })).then((url) => alive && setQr(url));
    return () => {
      alive = false;
    };
  }, [hasVat, inv.seller.name, inv.seller.vatNumber, inv.createdAt, inv.totalMinor, inv.taxMinor, money.currency]);
  return (
    <article className="rounded-lg bg-card p-6 shadow-card print:p-0 print:shadow-none md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <p className="text-[18px] font-bold">{inv.seller.name}</p>
          {inv.seller.address ? <p className="text-[13px] text-fg-3">{inv.seller.address}</p> : null}
          <p className="mt-1 text-[13px] text-fg-2">
            {hasVat ? (
              <>
                الرقم الضريبي: <bdi dir="ltr" className="tabular">{inv.seller.vatNumber}</bdi>
              </>
            ) : (
              <span className="no-print text-warning-700">لم يُضبط الرقم الضريبي في إعدادات المالية</span>
            )}
            {inv.seller.crNumber ? (
              <>
                {" · "}السجل التجاري: <bdi dir="ltr" className="tabular">{inv.seller.crNumber}</bdi>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex items-start gap-4">
          <div className="text-end text-[13px]">
            <p className="text-[16px] font-bold">فاتورة ضريبية مبسطة</p>
            <p>
              الرقم: <b className="tabular">{docNo(inv.number, prefs.digits)}</b>
            </p>
            <p>تاريخ الإصدار: {fmtDate(inv.issueDate)}</p>
            <p>الاستحقاق: {fmtDate(inv.dueDate)}</p>
          </div>
          {hasVat ? qr ? <img src={qr} alt="رمز الاستجابة السريعة للفاتورة الضريبية" className="size-[92px]" /> : <Skeleton className="size-[92px]" /> : null}
        </div>
      </header>

      <section className="grid gap-3 border-b border-line py-4 text-[13px] sm:grid-cols-2">
        <div>
          <p className="text-fg-3">الطالب</p>
          <Link href={`/students/${inv.student.id}`} className="text-[15px] font-medium hover:underline">
            {inv.student.fullName}
          </Link>
          <p className="text-fg-2">
            <bdi className="tabular">{inv.student.academicNumber}</bdi> · {inv.student.grade.name}
            {inv.student.section ? ` · ${inv.student.section.name}` : ""} · {inv.student.branch.name}
          </p>
        </div>
        <div>
          <p className="text-fg-3">ولي الأمر</p>
          <p className="text-[15px] font-medium">{inv.guardian?.name ?? "—"}</p>
          {inv.guardian?.phone ? (
            <p className="text-fg-2">
              <bdi dir="ltr" className="tabular">
                {inv.guardian.phone}
              </bdi>
            </p>
          ) : null}
        </div>
      </section>

      <div className="overflow-x-auto thin-scroll">
        <table className="mt-4 w-full min-w-[560px] text-[13px]">
          <thead className="text-fg-3">
            <tr className="border-b border-line [&_th]:py-2 [&_th]:font-medium">
              <th className="text-start">البيان</th>
              <th className={num}>المبلغ</th>
              <th className={num}>الخصم</th>
              <th className={num}>الضريبة</th>
              <th className={num}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l) => {
              const detail = (Array.isArray(l.discountDetail) ? l.discountDetail : []) as Array<{ name: string; amountMinor: number }>;
              return (
                <tr key={l.id} className="border-b border-line/60 align-top [&_td]:py-2">
                  <td>
                    {l.description}
                    {l.quantity > 1 ? <span className="text-fg-3"> × {formatNumber(l.quantity, prefs.digits)}</span> : null}
                    {detail.length ? <span className="block text-[12px] text-fg-3">{detail.map((d) => d.name).join("، ")}</span> : null}
                    {l.deferred ? <span className="no-print block text-[11px] text-fg-3">إيراد مؤجل يُعترف به شهرياً</span> : null}
                  </td>
                  <td className={num}>{money.fmt(l.amountMinor, false)}</td>
                  <td className={num}>{l.discountMinor ? `(${money.fmt(l.discountMinor, false)})` : "—"}</td>
                  <td className={num}>
                    {money.fmt(l.taxMinor, false)}
                    <span className="block text-[11px] text-fg-3">{formatPercent(l.taxRateBp / 10000, prefs.digits)}</span>
                  </td>
                  <td className={cn(num, "font-medium")}>{money.fmt(l.totalMinor, false)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="mt-4 flex justify-end">
        <dl className="grid w-full max-w-[300px] grid-cols-2 gap-y-1.5 text-[13px]">
          <dt className="text-fg-3">المجموع قبل الخصم</dt>
          <dd className={num}>{money.fmt(inv.subtotalMinor)}</dd>
          <dt className="text-fg-3">الخصومات</dt>
          <dd className={num}>{inv.discountMinor ? `(${money.fmt(inv.discountMinor)})` : "—"}</dd>
          <dt className="text-fg-3">الإجمالي الخاضع للضريبة</dt>
          <dd className={num}>{money.fmt(inv.subtotalMinor - inv.discountMinor)}</dd>
          <dt className="text-fg-3">ضريبة القيمة المضافة</dt>
          <dd className={num}>{money.fmt(inv.taxMinor)}</dd>
          <dt className="border-t border-line pt-1.5 text-[15px] font-bold">الإجمالي شامل الضريبة</dt>
          <dd className={cn(num, "border-t border-line pt-1.5 text-[15px] font-bold")}>{money.fmt(inv.totalMinor)}</dd>
        </dl>
      </section>

      {inv.installments.length > 1 ? (
        <section className="mt-6">
          <h3 className="mb-2 text-[13px] font-semibold">جدول الأقساط</h3>
          <table className="w-full text-[13px]">
            <tbody>
              {inv.installments.map((i) => (
                <tr key={i.id} className="border-b border-line/60 [&_td]:py-1.5">
                  <td>{i.label}</td>
                  <td>{fmtDate(i.dueDate)}</td>
                  <td className={num}>{money.fmt(i.amountMinor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {inv.notes ? <p className="mt-5 whitespace-pre-line text-[13px] text-fg-2">{inv.notes}</p> : null}
      <p className="mt-6 text-[11px] text-fg-3">جميع المبالغ بالريال السعودي. الرسوم الدراسية والتسجيل والنقل للطلاب المواطنين بنسبة صفر وفق قرار وزارة المالية، وبقية البنود خاضعة للنسبة الأساسية.</p>
    </article>
  );
}

function CreditNoteDialog({ inv, onClose, onDone }: { inv: Invoice; onClose: () => void; onDone: () => Promise<unknown> }) {
  const money = useMoney();
  const [amount, setAmount] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [kind, setKind] = useState<"ADJUSTMENT" | "DISCOUNT">("ADJUSTMENT");
  const m = trpc.finance.invoices.creditNote.useMutation({
    onSuccess: async () => {
      toast.success("صدر الإشعار الدائن وقيده");
      await onDone();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const over = amount !== null && amount > inv.balanceMinor;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="إشعار دائن" description={`يخفّض المتبقي على الفاتورة ويعكس الإيراد والضريبة بنسبها. المتبقي حالياً ${money.fmt(inv.balanceMinor)}.`}>
        <div className="space-y-3 px-5 pb-4">
          <Segmented value={kind} onChange={setKind} options={[{ value: "ADJUSTMENT", label: "تعديل/إعفاء" }, { value: "DISCOUNT", label: "خصم لاحق" }]} />
          <Field label="المبلغ شامل الضريبة" error={over ? "أكبر من المتبقي على الفاتورة" : null}>
            <MoneyInput value={amount} onChange={setAmount} autoFocus />
          </Field>
          <Button size="xs" variant="ghost" onClick={() => setAmount(inv.balanceMinor)}>
            كامل المتبقي
          </Button>
          <Field label="السبب">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: إعفاء جزئي بقرار لجنة المنح" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!amount || over || reason.trim().length < 3} onClick={() => m.mutate({ invoiceId: inv.id, totalMinor: amount!, reason, kind })}>
            إصدار الإشعار
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DebitNoteDialog({ inv, onClose }: { inv: Invoice; onClose: () => void }) {
  const setup = trpc.finance.setup.get.useQuery();
  const router = useRouter();
  const [lines, setLines] = useState<Array<{ feeItemId: string | null; description: string; unitMinor: number | null }>>([{ feeItemId: null, description: "", unitMinor: null }]);
  const [reason, setReason] = useState("");
  const m = trpc.finance.invoices.debitNote.useMutation({
    onSuccess: (r) => {
      toast.success("صدر الإشعار المدين كفاتورة مرتبطة");
      onClose();
      router.push(`/finance/invoices/${r.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const items = (setup.data?.items ?? []).filter((i) => i.isActive);
  const valid = lines.every((l) => l.feeItemId && l.unitMinor) && reason.trim().length >= 3;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="إشعار مدين" description="رسوم إضافية على الطالب نفسه تصدر كفاتورة مرتبطة بهذه الفاتورة، بضريبتها حسب البند." width={620}>
        <div className="space-y-2 px-5 pb-4">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_120px_28px] items-start gap-2">
              <Select value={l.feeItemId ?? undefined} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, feeItemId: v, description: x.description || items.find((it) => it.id === v)?.name || "" } : x)))} options={items.map((it) => ({ value: it.id, label: it.name }))} placeholder="البند" />
              <Input value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} placeholder="البيان" />
              <MoneyInput value={l.unitMinor} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, unitMinor: v } : x)))} aria-label="المبلغ" />
              <Button size="icon" variant="ghost" aria-label="حذف السطر" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
          <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setLines([...lines, { feeItemId: null, description: "", unitMinor: null }])}>
            سطر
          </Button>
          <Field label="السبب">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: رسوم رحلة إضافية" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!valid} onClick={() => m.mutate({ invoiceId: inv.id, reason, lines: lines.map((l) => ({ feeItemId: l.feeItemId, description: l.description, unitMinor: l.unitMinor! })) })}>
            إصدار
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ inv, onClose, onDone }: { inv: Invoice; onClose: () => void; onDone: () => Promise<unknown> }) {
  const [reason, setReason] = useState("");
  const m = trpc.finance.invoices.cancel.useMutation({
    onSuccess: async () => {
      toast.success("أُلغيت الفاتورة بإشعار دائن كامل");
      await onDone();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="إلغاء الفاتورة" description="لا تُحذف الفاتورة؛ يصدر إشعار دائن بكامل قيمتها ويُعكس قيدها، ويبقى الرقم في التسلسل.">
        <div className="px-5 pb-4">
          <Field label="سبب الإلغاء">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            تراجع
          </Button>
          <Button variant="danger" loading={m.isPending} disabled={reason.trim().length < 3} onClick={() => m.mutate({ id: inv.id, reason })}>
            إلغاء الفاتورة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
