"use client";
/**
 * المشتريات: طلبات الشراء (إنشاء، رفع للاعتماد، مسار الموافقات)، أوامر الشراء (إصدار، استلام جزئي/كلي، فوترة مطابقة)،
 * فواتير الموردين (مطابقة ثلاثية أو مباشرة) وسدادها، والموردون وتقييمهم.
 */
import { CheckCircle2, FileText, PackageCheck, Plus, Receipt, Send, Star, Trash2, Truck, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { docNo, FinTable, MoneyInput, num, PercentInput, useFmtDate, useMoney, useToday } from "@/components/finance/common";
import { ApprovalTimeline, BILL_STATUS, INVENTORY_TABS, MATCH_STATUS, opsNav, PO_STATUS, PR_STATUS } from "./common";

const nav = () => opsNav("inventory");

function SubTabs({ active }: { active: "requests" | "orders" }) {
  return (
    <div className="mb-4 inline-flex rounded-md bg-hover p-0.5 text-[13px]">
      {([["requests", "طلبات الشراء", "/inventory/purchasing"], ["orders", "أوامر الشراء", "/inventory/purchasing/orders"]] as const).map(([k, label, href]) => (
        <Link key={k} href={href} className={cn("rounded px-3 py-1 font-medium", active === k ? "bg-card text-fg shadow-card" : "text-fg-3 hover:text-fg")}>
          {label}
        </Link>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// طلبات الشراء
// ---------------------------------------------------------------------

export function RequestsPage() {
  const q = trpc.procurement.requests.useQuery();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} wide actions={<Link href="/inventory/purchasing/requests/new"><Button size="sm" variant="primary" icon={<Plus className="size-3.5" />}>طلب شراء</Button></Link>}>
      <SubTabs active="requests" />
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض طلبات الشراء" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : !d.requests.length ? (
        <EmptyState illustration="table" title="لا طلبات شراء" description="أنشئ طلباً ببنوده وكمياته وقيمته التقديرية، ثم ارفعه للاعتماد." action={<Link href="/inventory/purchasing/requests/new"><Button variant="primary">طلب شراء</Button></Link>} />
      ) : (
        <FinTable head={<tr><th>الرقم</th><th>العنوان</th><th>مقدم الطلب</th><th>التاريخ</th><th className="text-end">البنود</th><th className="text-end">القيمة التقديرية</th><th>الحالة</th></tr>}>
          {d.requests.map((r) => (
            <tr key={r.id}>
              <td><Link className="tabular underline underline-offset-4" href={`/inventory/purchasing/requests/${r.id}`}>{docNo(r.number, prefs.digits)}</Link></td>
              <td className="font-medium">{r.title}</td>
              <td>{r.requestedBy}</td>
              <td className="tabular">{fmtDate(r.createdAt)}</td>
              <td className={num}>{formatNumber(r.lines.length, prefs.digits)}</td>
              <td className={num}>{money.fmt(r.estimatedTotalMinor, false)}</td>
              <td><Tag color={PR_STATUS[r.status]?.color}>{PR_STATUS[r.status]?.label}</Tag></td>
            </tr>
          ))}
        </FinTable>
      )}
    </ModuleShell>
  );
}

type ReqLine = { itemId: string | null; description: string; quantity: number; estUnitMinor: number | null };

export function RequestEditor({ id }: { id?: string }) {
  const params = useSearchParams();
  const existing = trpc.procurement.request.useQuery({ id: id! }, { enabled: Boolean(id) });
  const items = trpc.inventory.items.useQuery({ lowOnly: !id && params.get("low") === "1" }, { retry: false });
  if (id && !existing.data) return <ModuleShell nav={nav()} tabs={INVENTORY_TABS}>{existing.error ? <EmptyState illustration="lock" title="لا يمكن عرض الطلب" description={existing.error.message} /> : <SkeletonLines lines={8} />}</ModuleShell>;
  const lowPrefill: ReqLine[] = !id && params.get("low") === "1" && items.data ? items.data.items.map((i) => ({ itemId: i.id, description: i.name, quantity: Math.max(1, i.reorderQty || i.minQty * 2 - i.onHandQty), estUnitMinor: i.avgCostMinor || null })) : [];
  if (!id && params.get("low") === "1" && !items.data && !items.error) return <ModuleShell nav={nav()} tabs={INVENTORY_TABS}><SkeletonLines lines={8} /></ModuleShell>;
  const r = existing.data?.request;
  return (
    <RequestForm
      key={r?.id ?? "new"}
      id={id}
      items={items.data?.items ?? []}
      initial={{ title: r?.title ?? (lowPrefill.length ? "إعادة تموين النواقص" : ""), branchId: r?.branchId ?? "", neededBy: r?.neededBy ? new Date(r.neededBy).toISOString().slice(0, 10) : "", justification: r?.justification ?? "", lines: r ? r.lines.map((l) => ({ itemId: l.itemId, description: l.description, quantity: l.quantity, estUnitMinor: l.estUnitMinor })) : lowPrefill.length ? lowPrefill : [{ itemId: null, description: "", quantity: 1, estUnitMinor: null }] }}
    />
  );
}

function RequestForm({ id, items, initial }: { id?: string; items: RouterOutputs["inventory"]["items"]["items"]; initial: { title: string; branchId: string; neededBy: string; justification: string; lines: ReqLine[] } }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const money = useMoney();
  const lk = trpc.ops.lookups.useQuery(undefined, { retry: false });
  const [v, setV] = useState(initial);
  const save = trpc.procurement.saveRequest.useMutation({ onSuccess: (r) => (toast.success("حُفظ الطلب"), void utils.procurement.invalidate(), router.push(`/inventory/purchasing/requests/${r.id}`)), onError: (e) => toast.error(e.message) });
  const total = v.lines.reduce((s, l) => s + l.quantity * (l.estUnitMinor ?? 0), 0);
  const setLine = (i: number, patch: Partial<ReqLine>) => setV({ ...v, lines: v.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const ok = v.title.trim().length >= 3 && v.lines.length > 0 && v.lines.every((l) => l.description.trim() && l.quantity > 0);
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} title={id ? "تعديل طلب شراء" : "طلب شراء جديد"} crumbs={[{ title: "طلبات الشراء", href: "/inventory/purchasing" }, { title: id ? "تعديل" : "جديد" }]}>
      <div className="rounded-lg bg-card p-5 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="العنوان" className="sm:col-span-2"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="مثال: مستلزمات مختبر العلوم للفصل الثاني" autoFocus /></Field>
          <Field label="الفرع"><Select value={v.branchId || "NONE"} onChange={(b) => setV({ ...v, branchId: b === "NONE" ? "" : b })} options={[{ value: "NONE", label: "عام" }, ...(lk.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></Field>
          <Field label="مطلوب قبل"><Input type="date" value={v.neededBy} onChange={(e) => setV({ ...v, neededBy: e.target.value })} /></Field>
          <Field label="المبرر" className="sm:col-span-2"><Textarea rows={2} value={v.justification} onChange={(e) => setV({ ...v, justification: e.target.value })} /></Field>
        </div>
        <h3 className="mb-2 mt-5 text-[14px] font-semibold">البنود</h3>
        <div className="space-y-2">
          {v.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[200px_1fr_90px_130px_36px]">
              <Field label="صنف مخزني (اختياري)">
                <Select value={l.itemId ?? "NONE"} onChange={(itemId) => { const it = items.find((x) => x.id === itemId); setLine(i, { itemId: itemId === "NONE" ? null : itemId, ...(it ? { description: it.name, estUnitMinor: l.estUnitMinor ?? (it.avgCostMinor || null) } : {}) }); }} options={[{ value: "NONE", label: "خدمة/بند غير مخزني" }, ...items.map((x) => ({ value: x.id, label: x.name }))]} />
              </Field>
              <Field label="الوصف"><Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></Field>
              <Field label="الكمية"><Input type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} /></Field>
              <Field label="سعر تقديري"><MoneyInput value={l.estUnitMinor} onChange={(estUnitMinor) => setLine(i, { estUnitMinor })} /></Field>
              <Button variant="ghost" size="sm" aria-label="حذف البند" disabled={v.lines.length === 1} onClick={() => setV({ ...v, lines: v.lines.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setV({ ...v, lines: [...v.lines, { itemId: null, description: "", quantity: 1, estUnitMinor: null }] })}>بند</Button>
          <span className="text-[14px] font-semibold">الإجمالي التقديري {money.fmt(total)}</span>
        </div>
        <div className="mt-5 flex justify-end gap-2 border-t border-line pt-4">
          <Button variant="ghost" onClick={() => router.back()}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} disabled={!ok} onClick={() => save.mutate({ id: id ?? null, title: v.title, branchId: v.branchId || null, neededBy: v.neededBy || null, justification: v.justification || null, lines: v.lines.map((l) => ({ itemId: l.itemId, description: l.description, quantity: l.quantity, estUnitMinor: l.estUnitMinor ?? 0 })) })}>حفظ كمسودة</Button>
        </div>
      </div>
    </ModuleShell>
  );
}

export function RequestDetail({ id }: { id: string }) {
  const q = trpc.procurement.request.useQuery({ id });
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [ordering, setOrdering] = useState(false);
  const submit = trpc.procurement.submitRequest.useMutation({ onSuccess: () => (toast.success("رُفع الطلب للاعتماد"), void utils.procurement.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  return (
    <ModuleShell
      nav={nav()}
      tabs={INVENTORY_TABS}
      wide
      title={d ? `طلب شراء ${d.request.number}` : undefined}
      crumbs={d ? [{ title: "طلبات الشراء", href: "/inventory/purchasing" }, { title: docNo(d.request.number, prefs.digits) }] : undefined}
      actions={d ? (
        <>
          {d.canEdit ? <Link href={`/inventory/purchasing/requests/${id}/edit`}><Button size="sm">تعديل</Button></Link> : null}
          {d.canEdit ? <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} loading={submit.isPending} onClick={() => submit.mutate({ id })}>رفع للاعتماد</Button> : null}
          {d.canOrder ? <Button size="sm" variant="primary" icon={<FileText className="size-3.5" />} onClick={() => setOrdering(true)}>إصدار أمر شراء</Button> : null}
        </>
      ) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الطلب" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <header>
              <h1 className="text-[24px] font-bold">{d.request.title}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
                <Tag color={PR_STATUS[d.request.status]?.color}>{PR_STATUS[d.request.status]?.label}</Tag>
                <span>{d.request.requestedBy}</span>·<span className="tabular">{fmtDate(d.request.createdAt)}</span>
                {d.request.neededBy ? <span>· مطلوب قبل {fmtDate(d.request.neededBy)}</span> : null}
              </p>
              {d.request.justification ? <p className="mt-3 whitespace-pre-line text-[14px] text-fg-2">{d.request.justification}</p> : null}
            </header>
            <FinTable head={<tr><th>البند</th><th className="text-end">الكمية</th><th className="text-end">سعر تقديري</th><th className="text-end">الإجمالي</th></tr>} foot={<tr><td colSpan={3}>الإجمالي التقديري</td><td className={num}>{money.fmt(d.request.estimatedTotalMinor, false)}</td></tr>}>
              {d.request.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}{l.itemId ? <Tag color="slate" className="ms-2">مخزني</Tag> : null}</td>
                  <td className={num}>{formatNumber(l.quantity, prefs.digits)}</td>
                  <td className={num}>{money.fmt(l.estUnitMinor, false)}</td>
                  <td className={num}>{money.fmt(l.quantity * l.estUnitMinor, false)}</td>
                </tr>
              ))}
            </FinTable>
            {d.orders.length ? (
              <section>
                <h2 className="mb-2 text-[15px] font-semibold">أوامر الشراء</h2>
                <ul className="space-y-1 text-[14px]">
                  {d.orders.map((o) => (
                    <li key={o.id}><Link className="underline underline-offset-4" href={`/inventory/purchasing/orders/${o.id}`}>أمر {docNo(o.number, prefs.digits)}</Link> · <Tag color={PO_STATUS[o.status]?.color}>{PO_STATUS[o.status]?.label}</Tag> · {money.fmt(o.totalMinor)}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          <aside className="rounded-lg bg-card p-4 shadow-card">
            <h2 className="mb-3 text-[14px] font-semibold">مسار الاعتماد</h2>
            <ApprovalTimeline approval={d.approval} />
          </aside>
        </div>
      )}
      {ordering && d ? <OrderDialog request={d.request} onClose={() => setOrdering(false)} /> : null}
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// أوامر الشراء
// ---------------------------------------------------------------------

type OrderLine = { itemId: string | null; expenseAccountId: string | null; description: string; quantity: number; unitMinor: number | null; taxBp: number };

/** أمر شراء من طلب معتمد أو مباشر */
export function OrderDialog({ request, onClose }: { request?: RouterOutputs["procurement"]["request"]["request"]; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const today = useToday();
  const money = useMoney();
  const lk = trpc.ops.lookups.useQuery();
  const sup = trpc.procurement.suppliers.useQuery({});
  const items = trpc.inventory.items.useQuery({});
  const defaultTax = lk.data?.taxCodes[0]?.rateBp ?? 0;
  const [v, setV] = useState<{ supplierId: string; warehouseId: string; orderDate: string; expectedDate: string; notes: string; lines: OrderLine[] }>({
    supplierId: "",
    warehouseId: "",
    orderDate: today,
    expectedDate: "",
    notes: "",
    lines: request ? request.lines.map((l) => ({ itemId: l.itemId, expenseAccountId: null, description: l.description, quantity: l.quantity, unitMinor: l.estUnitMinor || null, taxBp: 1500 })) : [{ itemId: null, expenseAccountId: null, description: "", quantity: 1, unitMinor: null, taxBp: 1500 }],
  });
  const m = trpc.procurement.createOrder.useMutation({ onSuccess: (o) => (toast.success("أُنشئ أمر الشراء"), void utils.procurement.invalidate(), router.push(`/inventory/purchasing/orders/${o.id}`)), onError: (e) => toast.error(e.message) });
  const expenseAccounts = (lk.data?.accounts ?? []).filter((a) => a.type === "EXPENSE");
  const setLine = (i: number, patch: Partial<OrderLine>) => setV({ ...v, lines: v.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const net = v.lines.reduce((s, l) => s + l.quantity * (l.unitMinor ?? 0), 0);
  const tax = v.lines.reduce((s, l) => s + Math.floor((l.quantity * (l.unitMinor ?? 0) * l.taxBp + 5000) / 10000), 0);
  void defaultTax;
  const ok = v.supplierId && v.warehouseId && v.lines.every((l) => l.description.trim() && l.unitMinor !== null && (l.itemId || l.expenseAccountId));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={request ? `أمر شراء من الطلب ${request.number}` : "أمر شراء مباشر"} description={request ? "حدد المورد والأسعار المتفق عليها." : "الأمر المباشر (دون طلب معتمد) لمن يملك صلاحية الاعتماد."} width={860}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-2 sm:grid-cols-4">
          <Field label="المورد" className="sm:col-span-2"><Select value={v.supplierId || undefined} onChange={(supplierId) => setV({ ...v, supplierId })} options={(sup.data?.suppliers ?? []).filter((s) => s.isActive).map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label="مستودع الاستلام"><Select value={v.warehouseId || undefined} onChange={(warehouseId) => setV({ ...v, warehouseId })} options={(lk.data?.warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))} /></Field>
          <Field label="التوريد المتوقع"><Input type="date" value={v.expectedDate} onChange={(e) => setV({ ...v, expectedDate: e.target.value })} /></Field>
        </div>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto px-5 pb-2">
          {v.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[170px_1fr_80px_120px_90px_32px]">
              <Field label="صنف أو حساب مصروف">
                <Select
                  value={l.itemId ? `i:${l.itemId}` : l.expenseAccountId ? `a:${l.expenseAccountId}` : undefined}
                  onChange={(x) => { const [k, idv] = x.split(":"); const it = (items.data?.items ?? []).find((y) => y.id === idv); setLine(i, k === "i" ? { itemId: idv!, expenseAccountId: null, description: l.description || it?.name || "" } : { itemId: null, expenseAccountId: idv! }); }}
                  options={[...(items.data?.items ?? []).map((x) => ({ value: `i:${x.id}`, label: `صنف: ${x.name}` })), ...expenseAccounts.map((a) => ({ value: `a:${a.id}`, label: `خدمة: ${a.code} ${a.name}` }))]}
                />
              </Field>
              <Field label="الوصف"><Input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></Field>
              <Field label="الكمية"><Input type="number" min={1} value={l.quantity} onChange={(e) => setLine(i, { quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} /></Field>
              <Field label="السعر (قبل الضريبة)"><MoneyInput value={l.unitMinor} onChange={(unitMinor) => setLine(i, { unitMinor })} /></Field>
              <Field label="الضريبة ٪"><PercentInput bp={l.taxBp} onChange={(taxBp) => setLine(i, { taxBp })} /></Field>
              <Button variant="ghost" size="sm" aria-label="حذف" disabled={v.lines.length === 1} onClick={() => setV({ ...v, lines: v.lines.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setV({ ...v, lines: [...v.lines, { itemId: null, expenseAccountId: null, description: "", quantity: 1, unitMinor: null, taxBp: 1500 }] })}>بند</Button>
        </div>
        <p className="px-5 pb-3 text-end text-[14px]">قبل الضريبة {money.fmt(net)} · الضريبة {money.fmt(tax)} · <b>الإجمالي {money.fmt(net + tax)}</b></p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!ok} onClick={() => m.mutate({ supplierId: v.supplierId, requestId: request?.id ?? null, warehouseId: v.warehouseId, orderDate: v.orderDate, expectedDate: v.expectedDate || null, notes: v.notes || null, lines: v.lines.map((l) => ({ itemId: l.itemId, expenseAccountId: l.expenseAccountId, description: l.description, quantity: l.quantity, unitMinor: l.unitMinor!, taxBp: l.taxBp })) })}>إنشاء الأمر</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrdersPage() {
  const [status, setStatus] = useState("");
  const q = trpc.procurement.orders.useQuery({ status: status || null });
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [direct, setDirect] = useState(false);
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} wide actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDirect(true)}>أمر شراء مباشر</Button>}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SubTabs active="orders" />
        <Select size="sm" className="mb-4 w-48" value={status || "ALL"} onChange={(s) => setStatus(s === "ALL" ? "" : s)} options={[{ value: "ALL", label: "كل الحالات" }, ...Object.entries(PO_STATUS).map(([value, x]) => ({ value, label: x.label }))]} />
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض أوامر الشراء" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={8} />
      ) : !q.data.length ? (
        <EmptyState illustration="table" title="لا أوامر شراء" description="تُنشأ من طلب شراء معتمد، أو مباشرة لمن يملك الاعتماد." />
      ) : (
        <FinTable head={<tr><th>الرقم</th><th>المورد</th><th>التاريخ</th><th>التوريد المتوقع</th><th className="text-end">الإجمالي</th><th className="text-end">المستلم</th><th>الحالة</th></tr>}>
          {q.data.map((o) => (
            <tr key={o.id}>
              <td><Link className="tabular underline underline-offset-4" href={`/inventory/purchasing/orders/${o.id}`}>{docNo(o.number, prefs.digits)}</Link></td>
              <td className="font-medium">{o.supplier}</td>
              <td className="tabular">{fmtDate(o.orderDate)}</td>
              <td className="tabular">{o.expectedDate ? fmtDate(o.expectedDate) : "—"}</td>
              <td className={num}>{money.fmt(o.totalMinor, false)}</td>
              <td className={num}>{formatNumber(o.receivedPct, prefs.digits)}٪</td>
              <td><Tag color={PO_STATUS[o.status]?.color}>{PO_STATUS[o.status]?.label}</Tag></td>
            </tr>
          ))}
        </FinTable>
      )}
      {direct ? <OrderDialog onClose={() => setDirect(false)} /> : null}
    </ModuleShell>
  );
}

export function OrderDetail({ id }: { id: string }) {
  const q = trpc.procurement.order.useQuery({ id });
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [dialog, setDialog] = useState<"receive" | "bill" | "rate" | "cancel" | null>(null);
  const issue = trpc.procurement.issueOrder.useMutation({ onSuccess: () => (toast.success("صدر أمر الشراء للمورد"), void utils.procurement.invalidate()), onError: (e) => toast.error(e.message) });
  const cancel = trpc.procurement.cancelOrder.useMutation({ onSuccess: () => (toast.success("أُلغي الأمر"), setDialog(null), void utils.procurement.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  return (
    <ModuleShell
      nav={nav()}
      tabs={INVENTORY_TABS}
      wide
      title={d ? `أمر شراء ${d.order.number}` : undefined}
      crumbs={d ? [{ title: "أوامر الشراء", href: "/inventory/purchasing/orders" }, { title: docNo(d.order.number, prefs.digits) }] : undefined}
      actions={d ? (
        <>
          {d.canIssue ? <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} loading={issue.isPending} onClick={() => issue.mutate({ id })}>إصدار للمورد</Button> : null}
          {d.canReceive ? <Button size="sm" variant="primary" icon={<PackageCheck className="size-3.5" />} onClick={() => setDialog("receive")}>استلام</Button> : null}
          {d.canBill ? <Button size="sm" icon={<Receipt className="size-3.5" />} onClick={() => setDialog("bill")}>فاتورة المورد</Button> : null}
          {["RECEIVED", "CLOSED", "PARTIAL"].includes(d.order.status) ? <Button size="sm" variant="ghost" icon={<Star className="size-3.5" />} onClick={() => setDialog("rate")}>تقييم المورد</Button> : null}
          {["DRAFT", "ISSUED"].includes(d.order.status) ? <Button size="sm" variant="ghost" icon={<XCircle className="size-3.5" />} onClick={() => setDialog("cancel")}>إلغاء</Button> : null}
        </>
      ) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض أمر الشراء" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <header className="mb-4">
            <h1 className="text-[24px] font-bold">{d.order.supplier}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
              <Tag color={PO_STATUS[d.order.status]?.color}>{PO_STATUS[d.order.status]?.label}</Tag>
              <span className="tabular">{fmtDate(d.order.orderDate)}</span>· مستودع {d.order.warehouse}
              {d.order.requestId ? <Link className="underline" href={`/inventory/purchasing/requests/${d.order.requestId}`}>طلب الشراء</Link> : <span>أمر مباشر</span>}
              <Link className="underline" href={`/inventory/suppliers/${d.order.supplierId}`}>ملف المورد</Link>
            </p>
          </header>
          <FinTable
            head={<tr><th>البند</th><th className="text-end">المطلوب</th><th className="text-end">المستلم</th><th className="text-end">المفوتر</th><th className="text-end">السعر</th><th className="text-end">الضريبة</th><th className="text-end">الإجمالي</th></tr>}
            foot={<tr><td colSpan={6}>الإجمالي شامل الضريبة</td><td className={num}>{money.fmt(d.order.totalMinor, false)}</td></tr>}
          >
            {d.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description} {l.item ? <Tag color="slate" className="ms-1">مخزني</Tag> : l.account ? <Tag color="gold" className="ms-1">{l.account.name}</Tag> : null}</td>
                <td className={num}>{formatNumber(l.quantity, prefs.digits)}</td>
                <td className={cn(num, l.receivedQty >= l.quantity ? "text-success-800" : "")}>{formatNumber(l.receivedQty, prefs.digits)}</td>
                <td className={num}>{formatNumber(l.billedQty, prefs.digits)}</td>
                <td className={num}>{money.fmt(l.unitMinor, false)}</td>
                <td className={num}>{formatNumber(l.taxBp / 100, prefs.digits)}٪</td>
                <td className={num}>{money.fmt(l.netMinor, false)}</td>
              </tr>
            ))}
          </FinTable>
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Truck className="size-4 text-fg-3" />سندات الاستلام</h2>
              {!d.receipts.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لم يُستلم شيء بعد.</p> : (
                <FinTable dense head={<tr><th>الرقم</th><th>التاريخ</th><th className="text-end">الكميات</th><th>القيد</th></tr>}>
                  {d.receipts.map((r) => (
                    <tr key={r.id}>
                      <td className="tabular">{docNo(r.number, prefs.digits)}</td>
                      <td className="tabular">{fmtDate(r.date)}</td>
                      <td className={num}>{formatNumber(r.lines.reduce((s, x) => s + x.quantity, 0), prefs.digits)}</td>
                      <td>{r.journalEntryId ? <Link className="underline" href={`/finance/accounting/entries/${r.journalEntryId}`}>عرض</Link> : "—"}</td>
                    </tr>
                  ))}
                </FinTable>
              )}
            </section>
            <section>
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold"><Receipt className="size-4 text-fg-3" />فواتير المورد</h2>
              {!d.bills.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا فواتير بعد.</p> : (
                <FinTable dense head={<tr><th>رقم المورد</th><th>التاريخ</th><th className="text-end">الإجمالي</th><th>المطابقة</th><th>الحالة</th></tr>}>
                  {d.bills.map((b) => (
                    <tr key={b.id}>
                      <td><Link className="underline" href={`/inventory/bills/${b.id}`}>{b.supplierRef}</Link></td>
                      <td className="tabular">{fmtDate(b.billDate)}</td>
                      <td className={num}>{money.fmt(b.totalMinor, false)}</td>
                      <td><Tag color={MATCH_STATUS[b.matchStatus]?.color}>{MATCH_STATUS[b.matchStatus]?.label}</Tag></td>
                      <td><Tag color={BILL_STATUS[b.status]?.color}>{BILL_STATUS[b.status]?.label}</Tag></td>
                    </tr>
                  ))}
                </FinTable>
              )}
            </section>
          </div>
          {dialog === "receive" ? <ReceiveDialog order={d} onClose={() => setDialog(null)} /> : null}
          {dialog === "bill" ? <BillDialog supplierId={d.order.supplierId} order={d} onClose={() => setDialog(null)} /> : null}
          {dialog === "rate" ? <RateDialog supplierId={d.order.supplierId} orderId={d.order.id} onClose={() => setDialog(null)} /> : null}
          <ConfirmDialog open={dialog === "cancel"} onOpenChange={(o) => !o && setDialog(null)} title="إلغاء أمر الشراء؟" confirmLabel="إلغاء الأمر" danger loading={cancel.isPending} onConfirm={() => cancel.mutate({ id })} />
        </>
      )}
    </ModuleShell>
  );
}

function ReceiveDialog({ order, onClose }: { order: RouterOutputs["procurement"]["order"]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const prefs = usePrefs();
  const open = order.lines.filter((l) => l.receivedQty < l.quantity);
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(open.map((l) => [l.id, l.quantity - l.receivedQty])));
  const [date, setDate] = useState(today);
  const m = trpc.procurement.receive.useMutation({
    onSuccess: (r) => {
      toast.success(r.status === "RECEIVED" ? "اكتمل الاستلام" : "سُجل استلام جزئي");
      for (const w of r.warnings) toast.error(w);
      void utils.procurement.invalidate();
      void utils.inventory.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="استلام بضاعة" description="الأصناف تدخل المستودع بسعر أمر الشراء، والخدمات تُثبت مصروفاً، ويُقيد المقابل على «مشتريات مستلمة لم تصل فواتيرها»." width={620}>
        <div className="px-5 pb-4">
          <Field label="تاريخ الاستلام" className="mb-3 w-48"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <FinTable dense head={<tr><th>البند</th><th className="text-end">المتبقي</th><th className="text-end">المستلم الآن</th></tr>}>
            {open.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className={num}>{formatNumber(l.quantity - l.receivedQty, prefs.digits)}</td>
                <td className="w-28"><Input aria-label={`المستلم — ${l.description}`} type="number" min={0} max={l.quantity - l.receivedQty} className="h-7 text-end" value={qty[l.id] ?? 0} onChange={(e) => setQty({ ...qty, [l.id]: Math.max(0, Math.min(l.quantity - l.receivedQty, Math.trunc(Number(e.target.value) || 0))) })} /></td>
              </tr>
            ))}
          </FinTable>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!Object.values(qty).some((x) => x > 0)} onClick={() => m.mutate({ orderId: order.order.id, date, lines: Object.entries(qty).map(([orderLineId, quantity]) => ({ orderLineId, quantity })) })}>تسجيل الاستلام</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** فاتورة مورد: مطابقة لأمر شراء (الكميات المستلمة غير المفوترة) أو مباشرة بحسابات مصروف */
export function BillDialog({ supplierId, order, onClose }: { supplierId?: string; order?: RouterOutputs["procurement"]["order"]; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const today = useToday();
  const money = useMoney();
  const prefs = usePrefs();
  const lk = trpc.ops.lookups.useQuery();
  const sup = trpc.procurement.suppliers.useQuery({}, { enabled: !supplierId });
  const openLines = useMemo(() => (order ? order.lines.filter((l) => l.receivedQty > l.billedQty) : []), [order]);
  const [v, setV] = useState({ supplierId: supplierId ?? "", supplierRef: "", billDate: today, dueDate: "", branchId: "" });
  const [ol, setOl] = useState<Record<string, { quantity: number; unitMinor: number | null }>>(Object.fromEntries(openLines.map((l) => [l.id, { quantity: l.receivedQty - l.billedQty, unitMinor: l.unitMinor }])));
  const [direct, setDirect] = useState<Array<{ accountId: string; description: string; quantity: number; unitMinor: number | null; taxBp: number }>>(order ? [] : [{ accountId: "", description: "", quantity: 1, unitMinor: null, taxBp: 1500 }]);
  const m = trpc.procurement.createBill.useMutation({
    onSuccess: (r) => {
      toast.success("سُجلت فاتورة المورد بقيدها");
      for (const w of r.warnings) toast.error(w);
      void utils.procurement.invalidate();
      router.push(`/inventory/bills/${r.bill.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const orderNet = openLines.reduce((s, l) => s + (ol[l.id]?.quantity ?? 0) * (ol[l.id]?.unitMinor ?? 0), 0);
  const variance = openLines.reduce((s, l) => s + (ol[l.id]?.quantity ?? 0) * ((ol[l.id]?.unitMinor ?? 0) - l.unitMinor), 0);
  const directNet = direct.reduce((s, l) => s + l.quantity * (l.unitMinor ?? 0), 0);
  const expense = (lk.data?.accounts ?? []).filter((a) => a.type === "EXPENSE" || a.type === "ASSET");
  const ok = v.supplierId && v.supplierRef.trim() && (orderNet > 0 || (direct.length && direct.every((l) => l.accountId && l.description.trim() && l.unitMinor !== null)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={order ? `فاتورة المورد لأمر ${order.order.number}` : "فاتورة مورد مباشرة"} description={order ? "لا تُفوتر إلا الكميات المستلمة؛ فرق السعر عن الأمر يُقيد في «فروقات أسعار المشتريات»." : "للخدمات والمصروفات دون أمر شراء (كهرباء، صيانة خارجية…)."} width={760}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-2 sm:grid-cols-4">
          {!supplierId ? <Field label="المورد" className="col-span-2"><Select value={v.supplierId || undefined} onChange={(s) => setV({ ...v, supplierId: s })} options={(sup.data?.suppliers ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field> : null}
          <Field label="رقم فاتورة المورد"><Input dir="ltr" value={v.supplierRef} onChange={(e) => setV({ ...v, supplierRef: e.target.value })} /></Field>
          <Field label="تاريخ الفاتورة"><Input type="date" value={v.billDate} onChange={(e) => setV({ ...v, billDate: e.target.value })} /></Field>
          <Field label="الاستحقاق" hint="فارغ = حسب شروط المورد"><Input type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} /></Field>
          {!order ? <Field label="الفرع (مركز التكلفة)"><Select value={v.branchId || "NONE"} onChange={(b) => setV({ ...v, branchId: b === "NONE" ? "" : b })} options={[{ value: "NONE", label: "عام" }, ...(lk.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></Field> : null}
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5 pb-2">
          {order ? (
            <FinTable dense head={<tr><th>البند</th><th className="text-end">مستلم غير مفوتر</th><th className="text-end">الكمية</th><th className="text-end">سعر الأمر</th><th className="text-end">سعر الفاتورة</th></tr>}>
              {openLines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}</td>
                  <td className={num}>{formatNumber(l.receivedQty - l.billedQty, prefs.digits)}</td>
                  <td className="w-24"><Input aria-label="الكمية" type="number" min={0} className="h-7 text-end" value={ol[l.id]?.quantity ?? 0} onChange={(e) => setOl({ ...ol, [l.id]: { ...ol[l.id]!, quantity: Math.max(0, Math.trunc(Number(e.target.value) || 0)) } })} /></td>
                  <td className={num}>{money.fmt(l.unitMinor, false)}</td>
                  <td className="w-32"><MoneyInput value={ol[l.id]?.unitMinor ?? null} onChange={(unitMinor) => setOl({ ...ol, [l.id]: { ...ol[l.id]!, unitMinor } })} /></td>
                </tr>
              ))}
            </FinTable>
          ) : (
            <div className="space-y-2">
              {direct.map((l, i) => (
                <div key={i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[200px_1fr_70px_120px_80px_32px]">
                  <Field label="الحساب"><Select value={l.accountId || undefined} onChange={(accountId) => setDirect(direct.map((x, j) => (j === i ? { ...x, accountId } : x)))} options={expense.map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }))} /></Field>
                  <Field label="الوصف"><Input value={l.description} onChange={(e) => setDirect(direct.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} /></Field>
                  <Field label="الكمية"><Input type="number" min={1} value={l.quantity} onChange={(e) => setDirect(direct.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) } : x)))} /></Field>
                  <Field label="السعر"><MoneyInput value={l.unitMinor} onChange={(unitMinor) => setDirect(direct.map((x, j) => (j === i ? { ...x, unitMinor } : x)))} /></Field>
                  <Field label="الضريبة ٪"><PercentInput bp={l.taxBp} onChange={(taxBp) => setDirect(direct.map((x, j) => (j === i ? { ...x, taxBp } : x)))} /></Field>
                  <Button variant="ghost" size="sm" aria-label="حذف" disabled={direct.length === 1} onClick={() => setDirect(direct.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
                </div>
              ))}
              <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setDirect([...direct, { accountId: "", description: "", quantity: 1, unitMinor: null, taxBp: 1500 }])}>بند</Button>
            </div>
          )}
        </div>
        <p className="px-5 pb-3 text-end text-[14px]">
          قبل الضريبة {money.fmt(orderNet + directNet)}
          {variance ? <span className={cn("ms-2", variance > 0 ? "text-danger-700" : "text-success-800")}>· فرق السعر {money.fmt(variance)}</span> : null}
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!ok} onClick={() => m.mutate({ supplierId: v.supplierId, orderId: order?.order.id ?? null, supplierRef: v.supplierRef, billDate: v.billDate, dueDate: v.dueDate || null, branchId: v.branchId || null, orderLines: order ? Object.entries(ol).map(([orderLineId, x]) => ({ orderLineId, quantity: x.quantity, unitMinor: x.unitMinor ?? 0 })) : undefined, directLines: order ? undefined : direct.map((l) => ({ accountId: l.accountId, description: l.description, quantity: l.quantity, unitMinor: l.unitMinor!, taxBp: l.taxBp })) })}>تسجيل الفاتورة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StarsInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[14px]">{label}</span>
      <span className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n}`} onClick={() => onChange(n)}>
            <Star className={cn("size-5", n <= value ? "fill-[var(--tag-gold-dot)] text-[var(--tag-gold-dot)]" : "text-fg-4")} />
          </button>
        ))}
      </span>
    </div>
  );
}

function RateDialog({ supplierId, orderId, onClose }: { supplierId: string; orderId?: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ quality: 4, delivery: 4, price: 4, comment: "" });
  const m = trpc.procurement.rate.useMutation({ onSuccess: () => (toast.success("سُجل التقييم"), void utils.procurement.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تقييم المورد" width={420}>
        <div className="space-y-3 px-5 pb-4">
          <StarsInput label="الجودة" value={v.quality} onChange={(quality) => setV({ ...v, quality })} />
          <StarsInput label="الالتزام بالتوريد" value={v.delivery} onChange={(delivery) => setV({ ...v, delivery })} />
          <StarsInput label="السعر" value={v.price} onChange={(price) => setV({ ...v, price })} />
          <Field label="ملاحظة"><Textarea rows={2} value={v.comment} onChange={(e) => setV({ ...v, comment: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate({ supplierId, orderId: orderId ?? null, ...v, comment: v.comment || null })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// فواتير الموردين
// ---------------------------------------------------------------------

export function BillsPage() {
  const [status, setStatus] = useState("");
  const q = trpc.procurement.bills.useQuery({ status: status || null });
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [direct, setDirect] = useState(false);
  const rows = q.data ?? [];
  const open = rows.filter((b) => ["OPEN", "PARTIAL"].includes(b.status));
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} wide actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDirect(true)}>فاتورة مباشرة</Button>}>
      <section className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="المستحق للموردين" value={q.data ? open.reduce((s, b) => s + b.totalMinor - b.paidMinor, 0) : undefined} format={money.whole} compact icon={<Receipt className="size-4" />} />
        <StatCard label="متأخر السداد" value={q.data ? open.filter((b) => b.overdue).reduce((s, b) => s + b.totalMinor - b.paidMinor, 0) : undefined} format={money.whole} compact tone="danger" icon={<Receipt className="size-4" />} />
        <StatCard label="فواتير بفرق سعر" value={q.data ? rows.filter((b) => b.matchStatus === "PRICE_VARIANCE").length : undefined} icon={<CheckCircle2 className="size-4" />} />
      </section>
      <Select size="sm" className="mb-3 w-48" value={status || "ALL"} onChange={(s) => setStatus(s === "ALL" ? "" : s)} options={[{ value: "ALL", label: "كل الحالات" }, ...Object.entries(BILL_STATUS).map(([value, x]) => ({ value, label: x.label }))]} />
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض فواتير الموردين" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={8} />
      ) : !rows.length ? (
        <EmptyState illustration="table" title="لا فواتير موردين" />
      ) : (
        <FinTable head={<tr><th>الرقم</th><th>المورد</th><th>رقم فاتورة المورد</th><th>التاريخ</th><th>الاستحقاق</th><th className="text-end">الإجمالي</th><th className="text-end">المتبقي</th><th>المطابقة</th><th>الحالة</th></tr>}>
          {rows.map((b) => (
            <tr key={b.id}>
              <td><Link className="tabular underline underline-offset-4" href={`/inventory/bills/${b.id}`}>{docNo(b.number, prefs.digits)}</Link></td>
              <td className="font-medium">{b.supplier}</td>
              <td className="tabular" dir="ltr">{b.supplierRef}</td>
              <td className="tabular">{fmtDate(b.billDate)}</td>
              <td className={cn("tabular", b.overdue && "font-semibold text-danger-700")}>{fmtDate(b.dueDate)}</td>
              <td className={num}>{money.fmt(b.totalMinor, false)}</td>
              <td className={num}>{money.fmt(b.totalMinor - b.paidMinor, false)}</td>
              <td><Tag color={MATCH_STATUS[b.matchStatus]?.color}>{MATCH_STATUS[b.matchStatus]?.label}</Tag></td>
              <td><Tag color={BILL_STATUS[b.status]?.color}>{BILL_STATUS[b.status]?.label}</Tag></td>
            </tr>
          ))}
        </FinTable>
      )}
      {direct ? <BillDialog onClose={() => setDirect(false)} /> : null}
    </ModuleShell>
  );
}

export function BillDetail({ id }: { id: string }) {
  const q = trpc.procurement.bill.useQuery({ id });
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [pay, setPay] = useState(false);
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} wide title={d ? `فاتورة ${d.bill.supplierRef}` : undefined} crumbs={d ? [{ title: "فواتير الموردين", href: "/inventory/bills" }, { title: d.bill.supplierRef }] : undefined} actions={d?.canPay ? <Button size="sm" variant="primary" onClick={() => setPay(true)}>سداد</Button> : null}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الفاتورة" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <header>
              <h1 className="text-[24px] font-bold">{d.bill.supplier}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
                <Tag color={BILL_STATUS[d.bill.status]?.color}>{BILL_STATUS[d.bill.status]?.label}</Tag>
                <Tag color={MATCH_STATUS[d.bill.matchStatus]?.color}>{MATCH_STATUS[d.bill.matchStatus]?.label}</Tag>
                <span className="tabular">{fmtDate(d.bill.billDate)}</span>· يستحق {fmtDate(d.bill.dueDate)}
                {d.order ? <Link className="underline" href={`/inventory/purchasing/orders/${d.order.id}`}>أمر الشراء {docNo(d.order.number, prefs.digits)}</Link> : null}
                {d.bill.journalEntryId ? <Link className="underline" href={`/finance/accounting/entries/${d.bill.journalEntryId}`}>القيد</Link> : null}
              </p>
            </header>
            <FinTable head={<tr><th>البند</th><th className="text-end">الكمية</th><th className="text-end">السعر</th><th className="text-end">الضريبة</th><th className="text-end">الصافي</th></tr>}
              foot={<>
                <tr><td colSpan={4}>قبل الضريبة</td><td className={num}>{money.fmt(d.bill.subtotalMinor, false)}</td></tr>
                <tr><td colSpan={4}>الضريبة</td><td className={num}>{money.fmt(d.bill.taxMinor, false)}</td></tr>
                <tr><td colSpan={4}>الإجمالي</td><td className={num}>{money.fmt(d.bill.totalMinor, false)}</td></tr>
              </>}
            >
              {d.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.description}{l.account ? <span className="ms-2 text-[12px] text-fg-3">{l.account.code} {l.account.name}</span> : null}</td>
                  <td className={num}>{formatNumber(l.quantity, prefs.digits)}</td>
                  <td className={num}>{money.fmt(l.unitMinor, false)}</td>
                  <td className={num}>{formatNumber(l.taxBp / 100, prefs.digits)}٪</td>
                  <td className={num}>{money.fmt(l.quantity * l.unitMinor, false)}</td>
                </tr>
              ))}
            </FinTable>
            {d.bill.varianceMinor ? <p className="text-[13px] text-fg-2">فرق السعر عن أمر الشراء: <b className={d.bill.varianceMinor > 0 ? "text-danger-700" : "text-success-800"}>{money.fmt(d.bill.varianceMinor)}</b> (قُيّد في «فروقات أسعار المشتريات»)</p> : null}
          </div>
          <aside className="space-y-3 rounded-lg bg-card p-4 shadow-card">
            <h2 className="text-[14px] font-semibold">السداد</h2>
            <p className="text-[13px]">المسدد {money.fmt(d.bill.paidMinor)} من {money.fmt(d.bill.totalMinor)}</p>
            {!d.payments.length ? <p className="text-[13px] text-fg-3">لا دفعات.</p> : (
              <ul className="space-y-1.5 text-[13px]">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex justify-between"><span className="tabular">{fmtDate(p.date)} · {p.method === "CASH" ? "نقداً" : p.method === "CHEQUE" ? "شيك" : "تحويل"}</span><span className="tabular">{money.fmt(p.amountMinor)}</span></li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
      {pay && d ? <PayBillDialog bill={d} onClose={() => setPay(false)} /> : null}
    </ModuleShell>
  );
}

function PayBillDialog({ bill, onClose }: { bill: RouterOutputs["procurement"]["bill"]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const [v, setV] = useState({ amountMinor: bill.bill.totalMinor - bill.bill.paidMinor as number | null, date: today, method: "BANK_TRANSFER" as "CASH" | "BANK_TRANSFER" | "CHEQUE", bankAccountId: bill.banks[0]?.id ?? "", reference: "" });
  const m = trpc.procurement.pay.useMutation({ onSuccess: () => (toast.success("سُجل السداد بقيده"), void utils.procurement.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`سداد ${bill.bill.supplier}`} description="قيد: مدين الموردين، دائن البنك أو الصندوق.">
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="المبلغ"><MoneyInput value={v.amountMinor} onChange={(amountMinor) => setV({ ...v, amountMinor })} /></Field>
          <Field label="التاريخ"><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
          <Field label="الطريقة"><Select value={v.method} onChange={(method) => setV({ ...v, method: method as "CASH" })} options={[{ value: "BANK_TRANSFER", label: "تحويل بنكي" }, { value: "CHEQUE", label: "شيك" }, { value: "CASH", label: "نقداً" }]} /></Field>
          {v.method !== "CASH" ? <Field label="الحساب البنكي"><Select value={v.bankAccountId || undefined} onChange={(bankAccountId) => setV({ ...v, bankAccountId })} options={bill.banks.map((b) => ({ value: b.id, label: b.name }))} /></Field> : null}
          <Field label="المرجع" className="col-span-2"><Input value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.amountMinor || (v.method !== "CASH" && !v.bankAccountId)} onClick={() => m.mutate({ billId: bill.bill.id, amountMinor: v.amountMinor!, date: v.date, method: v.method, bankAccountId: v.method === "CASH" ? null : v.bankAccountId, reference: v.reference || null })}>سداد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// الموردون
// ---------------------------------------------------------------------

type SupplierRow = RouterOutputs["procurement"]["suppliers"]["suppliers"][number];

export function SuppliersPage() {
  const [search, setSearch] = useState("");
  const q = trpc.procurement.suppliers.useQuery({ q: search || null });
  const money = useMoney();
  const prefs = usePrefs();
  const [editing, setEditing] = useState<SupplierRow | "new" | null>(null);
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} wide actions={d?.canEdit ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>مورد جديد</Button> : null}>
      <Input className="mb-3 w-64" placeholder="بحث بالاسم أو الجوال أو الرقم الضريبي" value={search} onChange={(e) => setSearch(e.target.value)} />
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الموردين" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : !d.suppliers.length ? (
        <EmptyState illustration="table" title="لا موردين" action={d.canEdit ? <Button variant="primary" onClick={() => setEditing("new")}>مورد جديد</Button> : undefined} />
      ) : (
        <FinTable head={<tr><th>المورد</th><th>التصنيف</th><th>الجوال</th><th className="text-end">شروط الدفع</th><th className="text-end">الرصيد المستحق</th><th className="text-end">المتأخر</th><th>التقييم</th></tr>}>
          {d.suppliers.map((s) => (
            <tr key={s.id}>
              <td><Link className="font-medium hover:underline" href={`/inventory/suppliers/${s.id}`}>{s.name}</Link>{!s.isActive ? <Tag color="gray" className="ms-2">موقوف</Tag> : null}</td>
              <td>{s.category ?? "—"}</td>
              <td className="tabular" dir="ltr">{s.phone ?? "—"}</td>
              <td className={num}>{formatNumber(s.paymentTermsDays, prefs.digits)} يوماً</td>
              <td className={num}>{money.fmt(s.balanceMinor, false)}</td>
              <td className={cn(num, s.overdueMinor && "text-danger-700")}>{money.fmt(s.overdueMinor, false)}</td>
              <td>{s.ratingTenths !== null ? <span className="flex items-center gap-1 tabular"><Star className="size-3.5 fill-[var(--tag-gold-dot)] text-[var(--tag-gold-dot)]" />{formatNumber(s.ratingTenths / 10, prefs.digits)} <span className="text-fg-3">({formatNumber(s.ratings, prefs.digits)})</span></span> : <span className="text-fg-3">—</span>}</td>
            </tr>
          ))}
        </FinTable>
      )}
      {editing ? <SupplierDialog s={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </ModuleShell>
  );
}

type SupplierEditable = { id: string; name: string; taxNumber?: string | null; crNumber?: string | null; contactName?: string | null; phone?: string | null; email?: string | null; address?: string | null; iban?: string | null; paymentTermsDays?: number; category?: string | null; notes?: string | null; isActive?: boolean };

function SupplierDialog({ s, onClose }: { s: SupplierEditable | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ name: s?.name ?? "", taxNumber: s?.taxNumber ?? "", crNumber: s?.crNumber ?? "", contactName: s?.contactName ?? "", phone: s?.phone ?? "", email: s?.email ?? "", address: s?.address ?? "", iban: s?.iban ?? "", paymentTermsDays: s?.paymentTermsDays ?? 30, category: s?.category ?? "", notes: s?.notes ?? "", isActive: s?.isActive ?? true });
  const m = trpc.procurement.saveSupplier.useMutation({ onSuccess: () => (toast.success("حُفظ المورد"), void utils.procurement.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const n = (x: string) => x.trim() || null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={s ? `تعديل ${s.name}` : "مورد جديد"} width={640}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 sm:grid-cols-3">
          <Field label="الاسم" className="col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus /></Field>
          <Field label="التصنيف"><Input value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} placeholder="قرطاسية، أغذية…" /></Field>
          <Field label="الرقم الضريبي"><Input dir="ltr" value={v.taxNumber} onChange={(e) => setV({ ...v, taxNumber: e.target.value })} /></Field>
          <Field label="السجل التجاري"><Input dir="ltr" value={v.crNumber} onChange={(e) => setV({ ...v, crNumber: e.target.value })} /></Field>
          <Field label="شروط الدفع (يوم)"><Input type="number" min={0} value={v.paymentTermsDays} onChange={(e) => setV({ ...v, paymentTermsDays: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></Field>
          <Field label="مسؤول التواصل"><Input value={v.contactName} onChange={(e) => setV({ ...v, contactName: e.target.value })} /></Field>
          <Field label="الجوال"><Input dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
          <Field label="البريد"><Input dir="ltr" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
          <Field label="الآيبان" className="col-span-2"><Input dir="ltr" value={v.iban} onChange={(e) => setV({ ...v, iban: e.target.value.toUpperCase() })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]"><Checkbox checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} /> نشط</label>
          <Field label="العنوان" className="col-span-2 sm:col-span-3"><Input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.name.trim().length < 2} onClick={() => m.mutate({ id: s?.id ?? null, name: v.name, taxNumber: n(v.taxNumber), crNumber: n(v.crNumber), contactName: n(v.contactName), phone: n(v.phone), email: n(v.email), address: n(v.address), iban: n(v.iban), paymentTermsDays: v.paymentTermsDays, category: n(v.category), notes: n(v.notes), isActive: v.isActive })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SupplierDetail({ id }: { id: string }) {
  const q = trpc.procurement.supplier.useQuery({ id });
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [dialog, setDialog] = useState<"edit" | "bill" | "rate" | null>(null);
  const d = q.data;
  const avg = d && d.supplier.ratings.length ? d.supplier.ratings.reduce((s, r) => s + r.quality + r.delivery + r.price, 0) / (d.supplier.ratings.length * 3) : null;
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} wide title={d?.supplier.name} crumbs={d ? [{ title: "الموردون", href: "/inventory/suppliers" }, { title: d.supplier.name }] : undefined}
      actions={d?.canEdit ? (<><Button size="sm" onClick={() => setDialog("edit")}>تعديل</Button><Button size="sm" icon={<Receipt className="size-3.5" />} onClick={() => setDialog("bill")}>فاتورة مباشرة</Button><Button size="sm" variant="ghost" icon={<Star className="size-3.5" />} onClick={() => setDialog("rate")}>تقييم</Button></>) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض المورد" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <header className="mb-4">
            <h1 className="text-[26px] font-bold">{d.supplier.name}</h1>
            <p className="mt-1 text-[13px] text-fg-3">{[d.supplier.category, d.supplier.contactName, d.supplier.phone, d.supplier.taxNumber ? `ضريبي ${d.supplier.taxNumber}` : null].filter(Boolean).join(" · ")}</p>
          </header>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="الرصيد المستحق" value={d.balanceMinor} format={money.whole} compact icon={<Receipt className="size-4" />} />
            <StatCard label="أوامر الشراء" value={d.orders.length} icon={<FileText className="size-4" />} />
            <StatCard label="الدفعات" value={d.payments.reduce((s, p) => s + p.amountMinor, 0)} format={money.whole} compact icon={<CheckCircle2 className="size-4" />} />
            <StatCard label="متوسط التقييم" value={avg === null ? null : Math.round(avg * 10) / 10} format={(n) => `${formatNumber(n, prefs.digits)} من ٥`} compact icon={<Star className="size-4" />} />
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">الفواتير</h2>
              {!d.bills.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا فواتير.</p> : (
                <FinTable dense head={<tr><th>الفاتورة</th><th>التاريخ</th><th className="text-end">الإجمالي</th><th className="text-end">المتبقي</th><th>الحالة</th></tr>}>
                  {d.bills.map((b) => (
                    <tr key={b.id}>
                      <td><Link className="underline" href={`/inventory/bills/${b.id}`}>{b.supplierRef}</Link></td>
                      <td className="tabular">{fmtDate(b.billDate)}</td>
                      <td className={num}>{money.fmt(b.totalMinor, false)}</td>
                      <td className={num}>{money.fmt(b.totalMinor - b.paidMinor, false)}</td>
                      <td><Tag color={BILL_STATUS[b.status]?.color}>{BILL_STATUS[b.status]?.label}</Tag></td>
                    </tr>
                  ))}
                </FinTable>
              )}
            </section>
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">التقييمات</h2>
              {!d.supplier.ratings.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا تقييمات بعد.</p> : (
                <ul className="space-y-2">
                  {d.supplier.ratings.map((r) => (
                    <li key={r.id} className="rounded-lg bg-card px-4 py-2.5 text-[13px] shadow-card">
                      <span className="tabular">جودة {formatNumber(r.quality, prefs.digits)} · توريد {formatNumber(r.delivery, prefs.digits)} · سعر {formatNumber(r.price, prefs.digits)}</span>
                      <span className="ms-2 text-fg-3">{fmtDate(r.createdAt)}</span>
                      {r.comment ? <p className="mt-1 text-fg-2">{r.comment}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          {dialog === "edit" ? <SupplierDialog s={d.supplier} onClose={() => setDialog(null)} /> : null}
          {dialog === "bill" ? <BillDialog supplierId={d.supplier.id} onClose={() => setDialog(null)} /> : null}
          {dialog === "rate" ? <RateDialog supplierId={d.supplier.id} onClose={() => setDialog(null)} /> : null}
        </>
      )}
    </ModuleShell>
  );
}
