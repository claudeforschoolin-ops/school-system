"use client";
/**
 * نقطة البيع (متجر الزي والكتب، والمقصف): كتالوج بالبحث والباركود، سلة، طرق دفع (نقد، بطاقة، على حساب الطالب، المحفظة)،
 * إيصال مطبوع؛ تقارير المبيعات والهامش مع الإلغاء؛ ومحافظ الطلاب (شحن، حدود، أصناف ممنوعة، حركات) للموظفين وأولياء الأمور.
 */
import { Barcode, Minus, Plus, Printer, Search, ShoppingCart, Trash2, Wallet, XCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { StudentPicker, type PickedStudent } from "@/components/students/student-picker";
import { docNo, FinTable, MoneyInput, num, printPage, RangePicker, useFmtDate, useMoney, useToday } from "@/components/finance/common";
import { CANTEEN_TABS, INVENTORY_TABS, ITEM_CATEGORY, ModuleSettingsForm, opsNav, PAY_METHOD, WALLET_TX } from "./common";
import { ItemDialog } from "./inventory";

type Kind = "STORE" | "CANTEEN";
const navOf = (kind: Kind) => (kind === "STORE" ? opsNav("store") : opsNav("canteen"));
const tabsOf = (kind: Kind) => (kind === "STORE" ? INVENTORY_TABS : CANTEEN_TABS);

export function PosScreen({ kind }: { kind: Kind }) {
  const q = trpc.pos.catalog.useQuery({ kind });
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [method, setMethod] = useState<"CASH" | "CARD" | "STUDENT_ACCOUNT" | "WALLET">(kind === "CANTEEN" ? "WALLET" : "CASH");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [receipt, setReceipt] = useState<RouterOutputs["pos"]["sell"] | null>(null);
  const wallet = trpc.pos.wallet.useQuery({ studentId: student?.id ?? "" }, { enabled: Boolean(student && method === "WALLET") });
  const d = q.data;
  const wh = warehouseId || d?.warehouses[0]?.id || "";
  const items = useMemo(() => (d?.items ?? []).filter((i) => (!cat || i.category === cat) && (!search || i.name.includes(search) || i.sku.toLowerCase().includes(search.toLowerCase()) || i.barcode === search)), [d, cat, search]);
  const lines = Object.entries(cart).map(([id, quantity]) => ({ item: d?.items.find((i) => i.id === id), quantity })).filter((l) => l.item);
  const totals = lines.reduce((t, l) => {
    const net = l.item!.priceMinor * l.quantity;
    const tax = Math.floor((net * l.item!.taxBp + 5000) / 10000);
    return { net: t.net + net, tax: t.tax + tax };
  }, { net: 0, tax: 0 });
  const total = totals.net + totals.tax;
  const add = (id: string, delta = 1) => {
    const stock = d?.items.find((i) => i.id === id)?.stock[wh] ?? 0;
    const next = Math.max(0, (cart[id] ?? 0) + delta);
    if (next > stock) return toast.error("لا رصيد كافٍ في المستودع");
    setCart((c) => {
      const copy = { ...c };
      if (next) copy[id] = next;
      else delete copy[id];
      return copy;
    });
  };
  const sell = trpc.pos.sell.useMutation({
    onSuccess: (s) => {
      setReceipt(s);
      setCart({});
      void utils.pos.invalidate();
      void utils.inventory.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const onScan = (code: string) => {
    const it = d?.items.find((i) => i.barcode === code || i.sku === code.toUpperCase());
    if (it) {
      add(it.id);
      setSearch("");
    }
  };
  const needStudent = method === "WALLET" || method === "STUDENT_ACCOUNT";
  const insufficient = method === "WALLET" && wallet.data && wallet.data.wallet.balanceMinor < total;
  const methods = kind === "STORE" ? (["CASH", "CARD", "STUDENT_ACCOUNT"] as const) : (["WALLET", "CASH"] as const);
  return (
    <ModuleShell nav={navOf(kind)} tabs={tabsOf(kind)} wide>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن فتح نقطة البيع" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : !d.warehouses.length ? (
        <EmptyState illustration="table" title={kind === "STORE" ? "لا مستودع للمتجر" : "لا مستودع للمقصف"} description={`أنشئ مستودعاً من نوع «${kind === "STORE" ? "متجر الزي والكتب" : "مقصف"}» من المخزون ← المستودعات.`} action={<Link href="/inventory/warehouses"><Button variant="primary">المستودعات</Button></Link>} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
          <section>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute start-2.5 top-2 size-4 text-fg-3" />
                <Input className="w-64 ps-8" placeholder="بحث أو مسح الباركود" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onScan(search.trim())} aria-label="بحث عن صنف أو مسح الباركود" />
              </div>
              {d.warehouses.length > 1 ? <Select size="sm" className="w-44" value={wh} onChange={(w) => (setWarehouseId(w), setCart({}))} options={d.warehouses.map((w) => ({ value: w.id, label: w.name }))} /> : null}
              {kind === "STORE" ? (
                <div className="flex gap-1">
                  {["", "UNIFORM", "BOOK", "SUPPLY"].map((c) => (
                    <button key={c || "all"} type="button" onClick={() => setCat(c)} className={cn("rounded-full px-3 py-1 text-[12px]", cat === c ? "bg-navy-700 text-on-primary" : "bg-hover text-fg-2")}>{c ? ITEM_CATEGORY[c]?.label : "الكل"}</button>
                  ))}
                </div>
              ) : null}
            </div>
            {!items.length ? (
              <EmptyState compact illustration="search" title="لا أصناف" description="الأصناف القابلة للبيع تُعرّف من المخزون ← الأصناف." />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {items.map((i) => {
                  const stock = i.stock[wh] ?? 0;
                  return (
                    <button key={i.id} type="button" disabled={stock <= 0} onClick={() => add(i.id)} className={cn("rounded-lg bg-card p-3 text-start shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-card-hover disabled:opacity-50", cart[i.id] && "ring-2 ring-navy-600")}>
                      <span className="block truncate text-[14px] font-medium">{i.name}</span>
                      <span className="mt-1 block text-[15px] font-semibold tabular">{money.fmt(i.priceMinor + Math.floor((i.priceMinor * i.taxBp + 5000) / 10000))}</span>
                      <span className="mt-1 flex items-center justify-between text-[11px] text-fg-3">
                        <span>{stock > 0 ? `${formatNumber(stock, prefs.digits)} ${i.unit}` : "نفد"}</span>
                        {cart[i.id] ? <Tag color="navy">{formatNumber(cart[i.id]!, prefs.digits)}</Tag> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
          <aside className="h-fit rounded-lg bg-card p-4 shadow-card lg:sticky lg:top-4">
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold"><ShoppingCart className="size-4" />السلة</h2>
            {!lines.length ? <p className="py-6 text-center text-[13px] text-fg-3">اختر الأصناف أو امسح الباركود</p> : (
              <ul className="mb-3 space-y-2">
                {lines.map((l) => (
                  <li key={l.item!.id} className="flex items-center gap-2 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{l.item!.name}</span>
                    <Button size="icon-sm" variant="ghost" aria-label="إنقاص" onClick={() => add(l.item!.id, -1)}><Minus className="size-3.5" /></Button>
                    <span className="w-6 text-center tabular">{formatNumber(l.quantity, prefs.digits)}</span>
                    <Button size="icon-sm" variant="ghost" aria-label="زيادة" onClick={() => add(l.item!.id, 1)}><Plus className="size-3.5" /></Button>
                    <span className="w-20 text-end tabular">{money.fmt(l.item!.priceMinor * l.quantity, false)}</span>
                  </li>
                ))}
              </ul>
            )}
            <dl className="space-y-1 border-t border-line pt-3 text-[13px]">
              <div className="flex justify-between"><dt className="text-fg-3">قبل الضريبة</dt><dd className="tabular">{money.fmt(totals.net)}</dd></div>
              <div className="flex justify-between"><dt className="text-fg-3">الضريبة</dt><dd className="tabular">{money.fmt(totals.tax)}</dd></div>
              <div className="flex justify-between text-[16px] font-bold"><dt>الإجمالي</dt><dd className="tabular">{money.fmt(total)}</dd></div>
            </dl>
            <div className="mt-4 space-y-3">
              <Segmented value={method} onChange={(m) => setMethod(m)} options={methods.map((m) => ({ value: m, label: PAY_METHOD[m]!.label }))} />
              {needStudent ? <StudentPicker value={student} onChange={setStudent} /> : null}
              {method === "WALLET" && wallet.data ? (
                <p className={cn("rounded-md px-3 py-2 text-[13px]", insufficient ? "bg-danger-50 text-danger-700" : "bg-hover text-fg-2")}>
                  <Wallet className="me-1 inline size-3.5" />الرصيد {money.fmt(wallet.data.wallet.balanceMinor)} · صُرف اليوم {money.fmt(wallet.data.spentTodayMinor)}
                  {wallet.data.wallet.dailyLimitMinor ? ` من ${money.fmt(wallet.data.wallet.dailyLimitMinor)}` : ""}
                </p>
              ) : null}
              {method === "STUDENT_ACCOUNT" ? <p className="text-[12px] text-fg-3">تصدر فاتورة على حساب الطالب تظهر في كشف الأسرة وتُسدَّد من التحصيل.</p> : null}
              <Button variant="primary" className="w-full" size="lg" loading={sell.isPending} disabled={!lines.length || (needStudent && !student) || Boolean(insufficient)} onClick={() => sell.mutate({ kind, warehouseId: wh, paymentMethod: method, studentId: student?.id ?? null, lines: lines.map((l) => ({ itemId: l.item!.id, quantity: l.quantity })) })}>
                إتمام البيع {lines.length ? `· ${money.fmt(total)}` : ""}
              </Button>
              {lines.length ? <Button variant="ghost" className="w-full" icon={<Trash2 className="size-3.5" />} onClick={() => setCart({})}>تفريغ السلة</Button> : null}
            </div>
          </aside>
        </div>
      )}
      {receipt ? <ReceiptDialog saleId={receipt.id} onClose={() => (setReceipt(null), setStudent(null))} /> : null}
    </ModuleShell>
  );
}

function ReceiptDialog({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const q = trpc.pos.sale.useQuery({ id: saleId });
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const s = q.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تمت العملية" width={400}>
        {!s ? <SkeletonLines lines={5} /> : (
          <div className="print-area px-5 pb-4 text-[13px]">
            <p className="mb-2 text-center text-fg-3">{s.kind === "STORE" ? "المتجر المدرسي" : "المقصف"} · إيصال {docNo(s.number, prefs.digits)} · {fmtDate(s.date)}</p>
            {s.customerName ? <p className="mb-2 text-center font-medium">{s.customerName}</p> : null}
            <ul className="space-y-1 border-y border-dashed border-line py-2">
              {s.lines.map((l) => (
                <li key={l.id} className="flex justify-between"><span>{l.name} × {formatNumber(l.quantity, prefs.digits)}</span><span className="tabular">{money.fmt(l.totalMinor, false)}</span></li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between"><span className="text-fg-3">الضريبة</span><span className="tabular">{money.fmt(s.taxMinor)}</span></div>
            <div className="flex justify-between text-[15px] font-bold"><span>الإجمالي</span><span className="tabular">{money.fmt(s.totalMinor)}</span></div>
            <p className="mt-2 text-center"><Tag color={PAY_METHOD[s.paymentMethod]?.color}>{PAY_METHOD[s.paymentMethod]?.label}</Tag></p>
            {s.invoiceId ? <p className="mt-2 text-center"><Link className="underline" href={`/finance/invoices/${s.invoiceId}`}>فاتورة الطالب</Link></p> : null}
          </div>
        )}
        <DialogFooter>
          <Button icon={<Printer className="size-3.5" />} onClick={printPage}>طباعة</Button>
          <Button variant="primary" onClick={onClose}>عملية جديدة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SalesReport({ kind }: { kind: Kind }) {
  const today = useToday();
  const [range, setRange] = useState({ from: today, to: today });
  const q = trpc.pos.sales.useQuery({ kind, from: range.from, to: range.to });
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [voiding, setVoiding] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const v = trpc.pos.void.useMutation({ onSuccess: () => (toast.success("أُلغيت العملية وأُعيد المخزون"), setVoiding(null), setReason(""), void utils.pos.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  return (
    <ModuleShell nav={navOf(kind)} tabs={tabsOf(kind)} wide>
      <div className="mb-4"><RangePicker from={range.from} to={range.to} onChange={(r) => setRange(r)} /></div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض المبيعات" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="المبيعات" value={d.totals.salesMinor} format={money.whole} compact icon={<ShoppingCart className="size-4" />} hint={`${formatNumber(d.totals.count, prefs.digits)} عملية`} />
            <StatCard label="الضريبة المحصلة" value={d.totals.taxMinor} format={money.whole} compact icon={<ShoppingCart className="size-4" />} />
            <StatCard label="تكلفة البضاعة" value={d.totals.costMinor} format={money.whole} compact icon={<ShoppingCart className="size-4" />} />
            <StatCard label="مجمل الربح" value={d.totals.netMinor - d.totals.costMinor} format={money.whole} compact tone="success" icon={<ShoppingCart className="size-4" />} />
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <h2 className="mb-2 text-[15px] font-semibold">العمليات</h2>
              {!d.sales.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا مبيعات في الفترة.</p> : (
                <FinTable dense head={<tr><th>الرقم</th><th>الوقت</th><th>العميل</th><th>الدفع</th><th className="text-end">القطع</th><th className="text-end">الإجمالي</th><th /></tr>}>
                  {d.sales.map((s) => (
                    <tr key={s.id} className={s.status === "VOIDED" ? "text-fg-3 line-through" : ""}>
                      <td className="tabular">{docNo(s.number, prefs.digits)}</td>
                      <td className="tabular">{fmtDate(s.date)}</td>
                      <td>{s.customer ?? "—"}</td>
                      <td><Tag color={PAY_METHOD[s.paymentMethod]?.color}>{PAY_METHOD[s.paymentMethod]?.label}</Tag></td>
                      <td className={num}>{formatNumber(s.items, prefs.digits)}</td>
                      <td className={num}>{money.fmt(s.totalMinor, false)}</td>
                      <td className="text-end">{d.canVoid && s.status === "COMPLETED" && s.paymentMethod !== "STUDENT_ACCOUNT" ? <Button size="xs" variant="ghost" icon={<XCircle className="size-3.5" />} onClick={() => setVoiding(s.id)}>إلغاء</Button> : s.invoiceId ? <Link className="text-[12px] underline" href={`/finance/invoices/${s.invoiceId}`}>الفاتورة</Link> : null}</td>
                    </tr>
                  ))}
                </FinTable>
              )}
            </section>
            <section className="space-y-4">
              <div>
                <h2 className="mb-2 text-[15px] font-semibold">الأكثر مبيعاً</h2>
                <FinTable dense head={<tr><th>الصنف</th><th className="text-end">الكمية</th><th className="text-end">الهامش</th></tr>}>
                  {d.byItem.slice(0, 10).map((i) => (
                    <tr key={i.itemId}><td>{i.name}</td><td className={num}>{formatNumber(i.quantity, prefs.digits)}</td><td className={num}>{money.fmt(i.marginMinor, false)}</td></tr>
                  ))}
                  {!d.byItem.length ? <tr><td colSpan={3} className="text-fg-3">—</td></tr> : null}
                </FinTable>
              </div>
              <div>
                <h2 className="mb-2 text-[15px] font-semibold">حسب طريقة الدفع</h2>
                <ul className="space-y-1 rounded-lg bg-card p-3 text-[13px] shadow-card">
                  {Object.entries(d.byMethod).map(([k, val]) => <li key={k} className="flex justify-between"><span>{PAY_METHOD[k]?.label}</span><span className="tabular">{money.fmt(val)}</span></li>)}
                  {!Object.keys(d.byMethod).length ? <li className="text-fg-3">—</li> : null}
                </ul>
              </div>
            </section>
          </div>
        </>
      )}
      <Dialog open={Boolean(voiding)} onOpenChange={(o) => !o && setVoiding(null)}>
        <DialogContent title="إلغاء عملية البيع" description="يُعاد المخزون بتكلفته، ويُرحَّل قيد عكسي، ويُسترد رصيد المحفظة إن وُجد." width={420}>
          <div className="px-5 pb-4"><Field label="السبب"><Input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus /></Field></div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setVoiding(null)}>تراجع</Button>
            <Button variant="danger" loading={v.isPending} disabled={reason.trim().length < 3} onClick={() => v.mutate({ id: voiding!, reason })}>إلغاء العملية</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// المحافظ
// ---------------------------------------------------------------------

export function WalletsPage() {
  const [search, setSearch] = useState("");
  const q = trpc.pos.wallets.useQuery({ q: search || null });
  const money = useMoney();
  const prefs = usePrefs();
  const [topup, setTopup] = useState<string | null>(null);
  const d = q.data;
  return (
    <ModuleShell nav={navOf("CANTEEN")} tabs={CANTEEN_TABS} wide>
      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="أرصدة المحافظ (التزام على المدرسة)" value={d?.totalBalanceMinor} format={money.whole} compact icon={<Wallet className="size-4" />} />
        <StatCard label="محافظ مفعّلة" value={d?.wallets} icon={<Wallet className="size-4" />} />
      </section>
      <Input className="mb-3 w-72" placeholder="بحث باسم الطالب أو رقمه" value={search} onChange={(e) => setSearch(e.target.value)} />
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض المحافظ" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : !d.rows.length ? (
        <EmptyState illustration="search" title="لا طلاب مطابقون" />
      ) : (
        <FinTable head={<tr><th>الطالب</th><th>الرقم</th><th>الصف</th><th className="text-end">الرصيد</th><th className="text-end">الحد اليومي</th><th /></tr>}>
          {d.rows.map((r) => (
            <tr key={r.studentId}>
              <td><Link className="font-medium hover:underline" href={`/canteen/wallets/${r.studentId}`}>{r.name}</Link>{!r.isActive ? <Tag color="red" className="ms-2">موقوفة</Tag> : null}</td>
              <td className="tabular text-fg-3">{r.number}</td>
              <td>{r.grade}</td>
              <td className={cn(num, r.balanceMinor === 0 && "text-fg-3")}>{money.fmt(r.balanceMinor, false)}</td>
              <td className={num}>{r.dailyLimitMinor ? money.fmt(r.dailyLimitMinor, false) : "—"}</td>
              <td className="text-end">{d.canTopup ? <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setTopup(r.studentId)}>شحن</Button> : null}</td>
            </tr>
          ))}
        </FinTable>
      )}
      {topup ? <TopupDialog studentId={topup} methods={["CASH", "CARD"]} onClose={() => setTopup(null)} /> : null}
      <p className="mt-2 text-[12px] text-fg-3">{formatNumber(d?.rows.length ?? 0, prefs.digits)} طالباً معروضاً</p>
    </ModuleShell>
  );
}

function TopupDialog({ studentId, methods, creditMinor, onClose }: { studentId: string; methods: Array<"CASH" | "CARD" | "FROM_CREDIT">; creditMinor?: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const money = useMoney();
  const [v, setV] = useState({ amountMinor: null as number | null, method: methods[0]!, note: "" });
  const m = trpc.pos.topUp.useMutation({ onSuccess: (t) => (toast.success(`شُحنت المحفظة؛ الرصيد ${money.fmt(t.balanceAfterMinor)}`), void utils.pos.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const labels = { CASH: "نقداً", CARD: "بطاقة", FROM_CREDIT: "من رصيدي الدائن لدى المدرسة" };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="شحن المحفظة" description={v.method === "FROM_CREDIT" ? `يُخصم من رصيدك الدائن (${money.fmt(creditMinor ?? 0)}).` : "قيد: مدين الصندوق/البنك، دائن أرصدة محافظ الطلاب."} width={420}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="المبلغ"><MoneyInput value={v.amountMinor} onChange={(amountMinor) => setV({ ...v, amountMinor })} autoFocus /></Field>
          {methods.length > 1 ? <Field label="الطريقة"><Select value={v.method} onChange={(method) => setV({ ...v, method: method as "CASH" })} options={methods.map((x) => ({ value: x, label: labels[x] }))} /></Field> : null}
          <div className="col-span-2 flex flex-wrap gap-2">
            {[1000, 2000, 5000, 10000].map((a) => <Button key={a} size="xs" variant="subtle" onClick={() => setV({ ...v, amountMinor: a })}>{money.fmt(a)}</Button>)}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.amountMinor || (v.method === "FROM_CREDIT" && (creditMinor ?? 0) < (v.amountMinor ?? 0))} onClick={() => m.mutate({ studentId, amountMinor: v.amountMinor!, method: v.method, note: v.note || null })}>شحن</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WalletDetail({ studentId, family }: { studentId: string; family?: boolean }) {
  const q = trpc.pos.wallet.useQuery({ studentId });
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [dialog, setDialog] = useState<"cash" | "credit" | "withdraw" | null>(null);
  const d = q.data;
  const [limits, setLimits] = useState<{ daily: number | null; low: number | null; notify: boolean; blocked: string[] } | null>(null);
  const save = trpc.pos.setLimits.useMutation({ onSuccess: () => (toast.success("حُفظت حدود المحفظة"), setLimits(null), void utils.pos.invalidate()), onError: (e) => toast.error(e.message) });
  const [wd, setWd] = useState({ amount: null as number | null, reason: "" });
  const withdraw = trpc.pos.withdraw.useMutation({ onSuccess: () => (toast.success("سُحب الرصيد نقداً"), setDialog(null), void utils.pos.invalidate()), onError: (e) => toast.error(e.message) });
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض المحفظة" description={q.error.message} />;
  if (!d) return <SkeletonLines lines={8} />;
  const l = limits ?? { daily: d.wallet.dailyLimitMinor, low: d.wallet.lowBalanceMinor, notify: d.wallet.notifyPurchases, blocked: d.wallet.blockedCategories };
  const dirty = limits !== null;
  return (
    <div>
      {!family ? <h1 className="mb-1 text-[24px] font-bold">{d.student.fullName}</h1> : null}
      <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="الرصيد" value={d.wallet.balanceMinor} format={(n) => money.fmt(n)} compact icon={<Wallet className="size-4" />} tone={d.wallet.balanceMinor < (d.wallet.lowBalanceMinor ?? 0) ? "warning" : undefined} />
        <StatCard label="صُرف اليوم" value={d.spentTodayMinor} format={(n) => money.fmt(n)} compact icon={<ShoppingCart className="size-4" />} hint={d.wallet.dailyLimitMinor ? `الحد اليومي ${money.fmt(d.wallet.dailyLimitMinor)}` : "بلا حد يومي"} />
        {family ? <StatCard label="رصيدك الدائن لدى المدرسة" value={d.guardianCreditMinor} format={(n) => money.fmt(n)} compact icon={<Wallet className="size-4" />} /> : null}
      </section>
      <div className="mb-5 flex flex-wrap gap-2">
        {d.canTopupCash ? <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDialog("cash")}>شحن نقدي/بطاقة</Button> : null}
        {d.canTopupFromCredit ? <Button variant={family ? "primary" : "secondary"} icon={<Plus className="size-3.5" />} onClick={() => setDialog("credit")}>شحن من الرصيد الدائن</Button> : null}
        {d.canWithdraw && d.wallet.balanceMinor > 0 ? <Button variant="ghost" onClick={() => setDialog("withdraw")}>استرداد الرصيد نقداً</Button> : null}
        {family && !d.canTopupFromCredit ? <p className="text-[13px] text-fg-3">للشحن: ادفع لدى صندوق المدرسة أو المقصف، أو أضف رصيداً دائناً عبر التحصيل ثم اشحن منه هنا.</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <section className="rounded-lg bg-card p-4 shadow-card">
          <h2 className="mb-3 text-[14px] font-semibold">حدود الصرف</h2>
          <div className="space-y-3">
            <Field label="الحد اليومي" hint="فارغ = بلا حد"><MoneyInput disabled={!d.canEditLimits} value={l.daily} onChange={(daily) => setLimits({ ...l, daily })} /></Field>
            <Field label="تنبيه انخفاض الرصيد تحت"><MoneyInput disabled={!d.canEditLimits} value={l.low} onChange={(low) => setLimits({ ...l, low })} /></Field>
            <label className="flex items-center gap-2 text-[14px]"><Checkbox disabled={!d.canEditLimits} checked={l.notify} onChange={(notify) => setLimits({ ...l, notify })} /> إشعار بكل عملية شراء</label>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-fg-2">أصناف ممنوعة</span>
              <BlockedItems blocked={l.blocked} disabled={!d.canEditLimits} onChange={(blocked) => setLimits({ ...l, blocked })} />
            </div>
            {d.canEditLimits ? <Button variant="primary" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ studentId, dailyLimitMinor: l.daily, blockedCategories: l.blocked, notifyPurchases: l.notify, lowBalanceMinor: l.low })}>حفظ الحدود</Button> : null}
          </div>
        </section>
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-[15px] font-semibold">الحركات</h2>
          {!d.transactions.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا حركات بعد.</p> : (
            <FinTable dense head={<tr><th>التاريخ</th><th>الحركة</th><th>التفاصيل</th><th className="text-end">المبلغ</th><th className="text-end">الرصيد بعدها</th></tr>}>
              {d.transactions.map((t) => (
                <tr key={t.id}>
                  <td className="tabular">{fmtDate(t.createdAt)}</td>
                  <td><Tag color={WALLET_TX[t.kind]?.color}>{WALLET_TX[t.kind]?.label}</Tag></td>
                  <td className="max-w-[260px] truncate text-fg-2">{t.note ?? "—"}</td>
                  <td className={cn(num, t.amountMinor < 0 ? "text-danger-700" : "text-success-800")}>{money.fmt(t.amountMinor, false)}</td>
                  <td className={num}>{money.fmt(t.balanceAfterMinor, false)}</td>
                </tr>
              ))}
            </FinTable>
          )}
        </section>
      </div>
      {dialog === "cash" ? <TopupDialog studentId={studentId} methods={["CASH", "CARD"]} onClose={() => setDialog(null)} /> : null}
      {dialog === "credit" ? <TopupDialog studentId={studentId} methods={["FROM_CREDIT"]} creditMinor={d.guardianCreditMinor} onClose={() => setDialog(null)} /> : null}
      <Dialog open={dialog === "withdraw"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="استرداد رصيد المحفظة نقداً" width={420}>
          <div className="grid grid-cols-2 gap-3 px-5 pb-4">
            <Field label={`المبلغ (حتى ${money.fmt(d.wallet.balanceMinor)})`}><MoneyInput value={wd.amount} onChange={(amount) => setWd({ ...wd, amount })} /></Field>
            <Field label="السبب"><Input value={wd.reason} onChange={(e) => setWd({ ...wd, reason: e.target.value })} /></Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>إلغاء</Button>
            <Button variant="primary" loading={withdraw.isPending} disabled={!wd.amount || wd.reason.trim().length < 3} onClick={() => withdraw.mutate({ studentId, amountMinor: wd.amount!, reason: wd.reason })}>استرداد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <p className="sr-only">{formatNumber(d.transactions.length, prefs.digits)}</p>
    </div>
  );
}

/** منع أصناف مقصف بعينها (ولي الأمر) */
function BlockedItems({ blocked, disabled, onChange }: { blocked: string[]; disabled: boolean; onChange: (b: string[]) => void }) {
  const q = trpc.pos.menu.useQuery(undefined, { retry: false });
  const items = q.data ?? [];
  if (q.error) return <p className="text-[12px] text-fg-3">تعذر تحميل قائمة المقصف؛ الأصناف الممنوعة حالياً: {blocked.length}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((i) => {
        const on = blocked.includes(i.id);
        return (
          <button key={i.id} type="button" disabled={disabled} onClick={() => onChange(on ? blocked.filter((x) => x !== i.id) : [...blocked, i.id])} className={cn("rounded-full px-2.5 py-1 text-[12px]", on ? "bg-danger-50 text-danger-700 line-through" : "bg-hover text-fg-2")} aria-pressed={on}>
            {i.name}
          </button>
        );
      })}
      {!items.length ? <span className="text-[12px] text-fg-3">لا أصناف</span> : null}
    </div>
  );
}

export function WalletPage({ studentId }: { studentId: string }) {
  return (
    <ModuleShell nav={navOf("CANTEEN")} tabs={CANTEEN_TABS} wide crumbs={[{ title: "المحافظ", href: "/canteen/wallets" }, { title: "محفظة طالب" }]}>
      <WalletDetail studentId={studentId} />
    </ModuleShell>
  );
}

/** محفظة أبنائي (ولي الأمر/الطالب) */
export function FamilyWalletPage() {
  const q = trpc.pos.myWallets.useQuery();
  const money = useMoney();
  const [sel, setSel] = useState<string | null>(null);
  const kids = q.data ?? [];
  const current = sel ?? kids[0]?.studentId ?? null;
  return (
    <ModuleShell nav={opsNav("my-wallet")}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض المحافظ" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={8} />
      ) : !kids.length ? (
        <EmptyState title="لا أبناء مرتبطون بحسابك" />
      ) : (
        <>
          {kids.length > 1 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {kids.map((k) => (
                <button key={k.studentId} type="button" onClick={() => setSel(k.studentId)} className={cn("rounded-lg px-3 py-2 text-start text-[13px] shadow-card", current === k.studentId ? "bg-navy-700 text-on-primary" : "bg-card")}>
                  <span className="block font-medium">{k.name}</span>
                  <span className="tabular opacity-80">{money.fmt(k.balanceMinor)}</span>
                </button>
              ))}
            </div>
          ) : <h1 className="mb-3 text-[22px] font-bold">{kids[0]!.name}</h1>}
          {current ? <WalletDetail key={current} studentId={current} family /> : null}
        </>
      )}
    </ModuleShell>
  );
}

export function CanteenItemsPage() {
  const q = trpc.inventory.items.useQuery({ category: "CANTEEN" });
  const money = useMoney();
  const prefs = usePrefs();
  const [editing, setEditing] = useState<RouterOutputs["inventory"]["items"]["items"][number] | "new" | null>(null);
  return (
    <ModuleShell nav={navOf("CANTEEN")} tabs={CANTEEN_TABS} actions={q.data?.canEdit ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>صنف جديد</Button> : null}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض أصناف المقصف" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={8} />
      ) : !q.data.items.length ? (
        <EmptyState illustration="table" title="لا أصناف للمقصف" action={<Button variant="primary" onClick={() => setEditing("new")}>صنف جديد</Button>} />
      ) : (
        <FinTable head={<tr><th>الصنف</th><th className="text-end">السعر</th><th className="text-end">الرصيد</th><th className="text-end">التكلفة</th><th className="text-end">الهامش</th><th /></tr>}>
          {q.data.items.map((i) => (
            <tr key={i.id}>
              <td className="font-medium">{i.name}{i.barcode ? <Barcode className="ms-2 inline size-3.5 text-fg-3" /> : null}</td>
              <td className={num}>{i.salePriceMinor ? money.fmt(i.salePriceMinor, false) : "—"}</td>
              <td className={cn(num, i.low && "text-danger-700")}>{formatNumber(i.onHandQty, prefs.digits)}</td>
              <td className={num}>{money.fmt(i.avgCostMinor, false)}</td>
              <td className={num}>{i.salePriceMinor ? `${formatNumber(Math.round(((i.salePriceMinor - i.avgCostMinor) * 100) / i.salePriceMinor), prefs.digits)}٪` : "—"}</td>
              <td className="text-end">{q.data.canEdit ? <Button size="xs" variant="ghost" onClick={() => setEditing(i)}>تعديل</Button> : null}</td>
            </tr>
          ))}
        </FinTable>
      )}
      {editing ? <ItemDialog item={editing === "new" ? null : editing} defaultCategory="CANTEEN" onClose={() => setEditing(null)} /> : null}
    </ModuleShell>
  );
}

export function CanteenSettingsPage() {
  return (
    <ModuleShell nav={navOf("CANTEEN")} tabs={CANTEEN_TABS}>
      <ModuleSettingsForm<{ defaultDailyLimitMinor: number; lowBalanceMinor: number; notifyPurchases: boolean; allowTopupFromCredit: boolean }> settingsKey="canteen" title="المقصف والمحافظ" description="القيم الافتراضية للمحافظ الجديدة؛ ولي الأمر يعدّل حدود أبنائه.">
        {(v, set, canEdit) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الحد اليومي الافتراضي" hint="صفر = بلا حد"><MoneyInput disabled={!canEdit} value={v.defaultDailyLimitMinor} onChange={(a) => set({ defaultDailyLimitMinor: a ?? 0 })} /></Field>
            <Field label="تنبيه انخفاض الرصيد تحت"><MoneyInput disabled={!canEdit} value={v.lowBalanceMinor} onChange={(a) => set({ lowBalanceMinor: a ?? 0 })} /></Field>
            <label className="flex items-center gap-2 text-[14px]"><Checkbox disabled={!canEdit} checked={v.notifyPurchases} onChange={(notifyPurchases) => set({ notifyPurchases })} /> إشعار ولي الأمر بكل عملية شراء (افتراضياً)</label>
            <label className="flex items-center gap-2 text-[14px]"><Checkbox disabled={!canEdit} checked={v.allowTopupFromCredit} onChange={(allowTopupFromCredit) => set({ allowTopupFromCredit })} /> السماح لولي الأمر بالشحن من رصيده الدائن</label>
          </div>
        )}
      </ModuleSettingsForm>
    </ModuleShell>
  );
}
