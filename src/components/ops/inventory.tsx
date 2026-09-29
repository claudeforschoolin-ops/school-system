"use client";
/**
 * المخزون: النظرة العامة (القيمة والنواقص والمستحق للموردين)، الأصناف وأرصدتها في المستودعات، بطاقة الصنف
 * بحركاته، الرصيد الافتتاحي، الصرف للأقسام والتحويل، المستودعات، والجرد الدوري بالعدّ والاعتماد.
 */
import { AlertTriangle, ArrowLeftRight, Boxes, ClipboardCheck, PackageMinus, PackagePlus, Plus, Receipt, ShoppingCart, Trash2, Warehouse as WarehouseIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { docNo, FinTable, MoneyInput, num, PercentInput, useFmtDate, useMoney, useToday } from "@/components/finance/common";
import { INVENTORY_TABS, ITEM_CATEGORY, ModuleSettingsForm, MOVE_KIND, opsNav, options, WAREHOUSE_KIND } from "./common";

type Item = RouterOutputs["inventory"]["items"]["items"][number];
const nav = () => opsNav("inventory");

export function InventoryHome() {
  const q = trpc.inventory.dashboard.useQuery();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [dialog, setDialog] = useState<"issue" | "transfer" | null>(null);
  const d = q.data;
  return (
    <ModuleShell
      nav={nav()}
      tabs={INVENTORY_TABS}
      wide
      actions={
        <>
          <Button size="sm" icon={<PackageMinus className="size-3.5" />} onClick={() => setDialog("issue")}>
            صرف لقسم
          </Button>
          <Button size="sm" icon={<ArrowLeftRight className="size-3.5" />} onClick={() => setDialog("transfer")}>
            تحويل
          </Button>
        </>
      }
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض المخزون" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="قيمة المخزون" value={d.stockValueMinor} format={money.whole} compact icon={<Boxes className="size-4" />} href="/inventory/items" />
            <StatCard label="أصناف تحت الحد الأدنى" value={d.low.length} tone={d.low.length ? "warning" : undefined} icon={<AlertTriangle className="size-4" />} href="/inventory/items?low=1" />
            <StatCard label="طلبات شراء بانتظار الاعتماد" value={d.pendingRequests} icon={<ShoppingCart className="size-4" />} href="/inventory/purchasing" />
            <StatCard label="أوامر شراء مفتوحة" value={d.openOrders} icon={<ClipboardCheck className="size-4" />} href="/inventory/purchasing/orders" />
            <StatCard label="مستحق للموردين" value={d.payableMinor} format={money.whole} compact tone={d.overdueMinor ? "danger" : undefined} hint={d.overdueMinor ? `متأخر ${money.whole(d.overdueMinor)}` : "لا متأخرات"} icon={<Receipt className="size-4" />} href="/inventory/bills" />
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">النواقص (تحت الحد الأدنى)</h2>
              {!d.low.length ? (
                <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">كل الأصناف فوق حدها الأدنى.</p>
              ) : (
                <FinTable dense head={<tr><th>الصنف</th><th className="text-end">الرصيد</th><th className="text-end">الحد الأدنى</th><th className="text-end">كمية إعادة الطلب</th></tr>}>
                  {d.low.map((i) => (
                    <tr key={i.id}>
                      <td><Link className="font-medium hover:underline" href={`/inventory/items/${i.id}`}>{i.name}</Link></td>
                      <td className={`${num} text-danger-700`}>{formatNumber(i.onHandQty, prefs.digits)} {i.unit}</td>
                      <td className={num}>{formatNumber(i.minQty, prefs.digits)}</td>
                      <td className={num}>{formatNumber(i.reorderQty, prefs.digits)}</td>
                    </tr>
                  ))}
                </FinTable>
              )}
              {d.low.length ? (
                <Link href={`/inventory/purchasing/requests/new?low=1`} className="mt-2 inline-block text-[13px] text-navy-700 underline underline-offset-4">
                  إنشاء طلب شراء للنواقص
                </Link>
              ) : null}
            </section>
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">آخر الحركات</h2>
              {!d.recent.length ? (
                <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا حركات بعد.</p>
              ) : (
                <FinTable dense head={<tr><th>التاريخ</th><th>الصنف</th><th>الحركة</th><th className="text-end">الكمية</th><th className="text-end">القيمة</th></tr>}>
                  {d.recent.map((m) => (
                    <tr key={m.id}>
                      <td className="tabular">{fmtDate(m.date)}</td>
                      <td>{m.item}</td>
                      <td><Tag color={MOVE_KIND[m.kind]?.color}>{MOVE_KIND[m.kind]?.label}</Tag></td>
                      <td className={num}>{formatNumber(m.quantity, prefs.digits)}</td>
                      <td className={num}>{money.fmt(m.valueMinor, false)}</td>
                    </tr>
                  ))}
                </FinTable>
              )}
            </section>
          </div>
        </>
      )}
      {dialog === "issue" ? <IssueDialog onClose={() => setDialog(null)} /> : null}
      {dialog === "transfer" ? <TransferDialog onClose={() => setDialog(null)} /> : null}
    </ModuleShell>
  );
}

export function ItemsPage({ lowOnly }: { lowOnly?: boolean }) {
  const [filter, setFilter] = useState({ category: "", q: "", warehouseId: "", low: Boolean(lowOnly) });
  const q = trpc.inventory.items.useQuery({ category: filter.category || null, q: filter.q || null, warehouseId: filter.warehouseId || null, lowOnly: filter.low });
  const whs = trpc.inventory.warehouses.useQuery();
  const money = useMoney();
  const prefs = usePrefs();
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [opening, setOpening] = useState<Item | null>(null);
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} wide actions={d?.canEdit ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>صنف جديد</Button> : null}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="w-56" placeholder="بحث بالاسم أو الرمز أو الباركود" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <Select size="sm" className="w-40" value={filter.category || "ALL"} onChange={(c) => setFilter({ ...filter, category: c === "ALL" ? "" : c })} options={[{ value: "ALL", label: "كل الفئات" }, ...options(ITEM_CATEGORY)]} />
        <Select size="sm" className="w-44" value={filter.warehouseId || "ALL"} onChange={(w) => setFilter({ ...filter, warehouseId: w === "ALL" ? "" : w })} options={[{ value: "ALL", label: "كل المستودعات" }, ...(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))]} />
        <label className="flex items-center gap-2 text-[13px]">
          <Checkbox checked={filter.low} onChange={(low) => setFilter({ ...filter, low })} /> النواقص فقط
        </label>
        {d ? <span className="ms-auto text-[13px] text-fg-3">{formatNumber(d.totals.count, prefs.digits)} صنفاً · القيمة {money.fmt(d.totals.value)}</span> : null}
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الأصناف" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : !d.items.length ? (
        <EmptyState illustration="table" title="لا أصناف مطابقة" description="أضف الأصناف ثم أدخل أرصدتها الافتتاحية أو استلمها من أوامر الشراء." action={d.canEdit ? <Button variant="primary" onClick={() => setEditing("new")}>صنف جديد</Button> : undefined} />
      ) : (
        <FinTable head={<tr><th>الرمز</th><th>الصنف</th><th>الفئة</th><th className="text-end">الرصيد</th><th className="text-end">متوسط التكلفة</th><th className="text-end">القيمة</th><th className="text-end">سعر البيع</th><th /></tr>}>
          {d.items.map((i) => (
            <tr key={i.id}>
              <td className="tabular text-fg-3">{i.sku}</td>
              <td>
                <Link className="font-medium hover:underline" href={`/inventory/items/${i.id}`}>{i.name}</Link>
                {!i.isActive ? <Tag color="gray" className="ms-2">موقوف</Tag> : null}
              </td>
              <td><Tag color={ITEM_CATEGORY[i.category]?.color}>{ITEM_CATEGORY[i.category]?.label}</Tag></td>
              <td className={`${num} ${i.low ? "font-semibold text-danger-700" : ""}`}>{formatNumber(i.onHandQty, prefs.digits)} <span className="text-fg-3">{i.unit}</span></td>
              <td className={num}>{money.fmt(i.avgCostMinor, false)}</td>
              <td className={num}>{money.fmt(i.stockValueMinor, false)}</td>
              <td className={num}>{i.sellable && i.salePriceMinor ? money.fmt(i.salePriceMinor, false) : "—"}</td>
              <td className="whitespace-nowrap text-end">
                {d.canEdit ? (
                  <>
                    <Button size="xs" variant="ghost" onClick={() => setOpening(i)}>رصيد افتتاحي</Button>
                    <Button size="xs" variant="ghost" onClick={() => setEditing(i)}>تعديل</Button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </FinTable>
      )}
      {editing ? <ItemDialog item={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      {opening ? <OpeningDialog item={opening} onClose={() => setOpening(null)} /> : null}
    </ModuleShell>
  );
}

export function ItemDialog({ item, onClose, defaultCategory }: { item: Item | null; onClose: () => void; defaultCategory?: string }) {
  const utils = trpc.useUtils();
  const lk = trpc.ops.lookups.useQuery();
  const [v, setV] = useState({ sku: item?.sku ?? "", barcode: item?.barcode ?? "", name: item?.name ?? "", category: item?.category ?? defaultCategory ?? "SUPPLY", unit: item?.unit ?? "حبة", minQty: item?.minQty ?? 0, reorderQty: item?.reorderQty ?? 0, sellable: item?.sellable ?? defaultCategory === "CANTEEN", salePriceMinor: item?.salePriceMinor ?? null, taxCodeId: item?.taxCodeId ?? "", isActive: item?.isActive ?? true });
  const m = trpc.inventory.saveItem.useMutation({ onSuccess: () => (toast.success(item ? "حُفظ الصنف" : "أُضيف الصنف"), void utils.inventory.invalidate(), void utils.pos.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const taxCodes = lk.data?.taxCodes ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={item ? `تعديل ${item.name}` : "صنف جديد"} description="الحسابات المحاسبية (المخزون، التكلفة، الإيراد، المصروف) تُحدد تلقائياً من الفئة." width={620}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 sm:grid-cols-3">
          <Field label="الرمز (SKU)"><Input dir="ltr" value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} autoFocus /></Field>
          <Field label="الاسم" className="sm:col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="الفئة"><Select value={v.category} onChange={(category) => setV({ ...v, category })} options={options(ITEM_CATEGORY)} /></Field>
          <Field label="الوحدة"><Input value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} /></Field>
          <Field label="الباركود"><Input dir="ltr" value={v.barcode} onChange={(e) => setV({ ...v, barcode: e.target.value })} /></Field>
          <Field label="الحد الأدنى (تنبيه)"><Input type="number" min={0} value={v.minQty} onChange={(e) => setV({ ...v, minQty: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></Field>
          <Field label="كمية إعادة الطلب"><Input type="number" min={0} value={v.reorderQty} onChange={(e) => setV({ ...v, reorderQty: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]"><Checkbox checked={v.sellable} onChange={(sellable) => setV({ ...v, sellable })} /> يُباع في نقطة البيع</label>
          {v.sellable ? (
            <>
              <Field label="سعر البيع (قبل الضريبة)"><MoneyInput value={v.salePriceMinor} onChange={(salePriceMinor) => setV({ ...v, salePriceMinor })} /></Field>
              <Field label="الضريبة"><Select value={v.taxCodeId || "NONE"} onChange={(t) => setV({ ...v, taxCodeId: t === "NONE" ? "" : t })} options={[{ value: "NONE", label: "بلا ضريبة" }, ...taxCodes.map((t) => ({ value: t.id, label: t.name }))]} /></Field>
            </>
          ) : null}
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]"><Checkbox checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} /> نشط</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.sku.trim() || v.name.trim().length < 2} onClick={() => m.mutate({ id: item?.id ?? null, sku: v.sku, barcode: v.barcode || null, name: v.name, category: v.category as "SUPPLY", unit: v.unit, minQty: v.minQty, reorderQty: v.reorderQty, sellable: v.sellable, salePriceMinor: v.sellable ? v.salePriceMinor : null, taxCodeId: v.sellable ? v.taxCodeId || null : null, isActive: v.isActive })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OpeningDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const whs = trpc.inventory.warehouses.useQuery();
  const [v, setV] = useState({ warehouseId: "", quantity: 1, unitCostMinor: null as number | null, date: today });
  const m = trpc.inventory.opening.useMutation({ onSuccess: () => (toast.success("سُجل الرصيد الافتتاحي بقيد"), void utils.inventory.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`رصيد افتتاحي: ${item.name}`} description="يُرحَّل بقيد: مدين المخزون، دائن الأرصدة الافتتاحية.">
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="المستودع" className="col-span-2"><Select value={v.warehouseId || undefined} onChange={(warehouseId) => setV({ ...v, warehouseId })} options={(whs.data ?? []).filter((w) => w.isActive).map((w) => ({ value: w.id, label: w.name }))} /></Field>
          <Field label={`الكمية (${item.unit})`}><Input type="number" min={1} value={v.quantity} onChange={(e) => setV({ ...v, quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} /></Field>
          <Field label="تكلفة الوحدة"><MoneyInput value={v.unitCostMinor} onChange={(unitCostMinor) => setV({ ...v, unitCostMinor })} /></Field>
          <Field label="التاريخ"><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.warehouseId || v.unitCostMinor === null} onClick={() => m.mutate({ itemId: item.id, warehouseId: v.warehouseId, quantity: v.quantity, unitCostMinor: v.unitCostMinor!, date: v.date })}>تسجيل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ItemDetail({ id }: { id: string }) {
  const q = trpc.inventory.item.useQuery({ id });
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [edit, setEdit] = useState(false);
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} wide title={d?.item.name} crumbs={d ? [{ title: "الأصناف", href: "/inventory/items" }, { title: d.item.name }] : undefined} actions={d?.canEdit ? <Button size="sm" onClick={() => setEdit(true)}>تعديل</Button> : null}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الصنف" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <header className="mb-5">
            <h1 className="text-[26px] font-bold">{d.item.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
              <span className="tabular">{d.item.sku}</span>
              <Tag color={ITEM_CATEGORY[d.item.category]?.color}>{ITEM_CATEGORY[d.item.category]?.label}</Tag>
              {d.item.barcode ? <span className="tabular">باركود {d.item.barcode}</span> : null}
            </p>
          </header>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="الرصيد" value={d.item.onHandQty} icon={<Boxes className="size-4" />} hint={d.item.unit} tone={d.item.minQty && d.item.onHandQty <= d.item.minQty ? "warning" : undefined} />
            <StatCard label="متوسط التكلفة" value={d.item.avgCostMinor} format={(n) => money.fmt(n)} compact icon={<PackagePlus className="size-4" />} />
            <StatCard label="قيمة الرصيد" value={d.item.stockValueMinor} format={money.whole} compact icon={<Boxes className="size-4" />} />
            <StatCard label="سعر البيع" value={d.item.sellable ? d.item.salePriceMinor : null} format={(n) => money.fmt(n)} compact icon={<ShoppingCart className="size-4" />} />
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">الرصيد حسب المستودع</h2>
              <FinTable dense head={<tr><th>المستودع</th><th className="text-end">الكمية</th></tr>}>
                {d.item.levels.length ? d.item.levels.map((l) => (
                  <tr key={l.id}><td>{l.warehouse.name}</td><td className={num}>{formatNumber(l.quantity, prefs.digits)}</td></tr>
                )) : <tr><td colSpan={2} className="text-fg-3">لا رصيد</td></tr>}
              </FinTable>
            </section>
            <section className="lg:col-span-2">
              <h2 className="mb-2 text-[15px] font-semibold">بطاقة الصنف (الحركات)</h2>
              {!d.movements.length ? (
                <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا حركات.</p>
              ) : (
                <FinTable dense head={<tr><th>الرقم</th><th>التاريخ</th><th>الحركة</th><th>المستودع</th><th>المرجع</th><th className="text-end">الكمية</th><th className="text-end">تكلفة الوحدة</th><th className="text-end">القيمة</th></tr>}>
                  {d.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="tabular text-fg-3">{docNo(m.number, prefs.digits)}</td>
                      <td className="tabular">{fmtDate(m.date)}</td>
                      <td><Tag color={MOVE_KIND[m.kind]?.color}>{MOVE_KIND[m.kind]?.label}</Tag></td>
                      <td>{m.warehouse}</td>
                      <td className="text-fg-2">{m.journalEntryId ? <Link className="hover:underline" href={`/finance/accounting/entries/${m.journalEntryId}`}>{m.reference ?? "قيد"}</Link> : m.reference ?? "—"}</td>
                      <td className={`${num} ${m.quantity < 0 ? "text-danger-700" : "text-success-800"}`}>{formatNumber(m.quantity, prefs.digits)}</td>
                      <td className={num}>{money.fmt(m.unitCostMinor, false)}</td>
                      <td className={num}>{money.fmt(m.valueMinor, false)}</td>
                    </tr>
                  ))}
                </FinTable>
              )}
            </section>
          </div>
          {edit ? <ItemDialog item={{ ...d.item, totalQty: d.item.onHandQty, low: false, levels: [] } as unknown as Item} onClose={() => setEdit(false)} /> : null}
        </>
      )}
    </ModuleShell>
  );
}

/** سطور أصناف (صرف، تحويل، طلب شراء) */
function LinesEditor({ lines, setLines, items, warehouseId }: { lines: Array<{ itemId: string; quantity: number }>; setLines: (l: Array<{ itemId: string; quantity: number }>) => void; items: Item[]; warehouseId?: string }) {
  const prefs = usePrefs();
  return (
    <div className="space-y-2">
      {lines.map((l, i) => {
        const it = items.find((x) => x.id === l.itemId);
        const avail = it ? (warehouseId ? (it.levels.find((x) => x.warehouseId === warehouseId)?.quantity ?? 0) : it.totalQty) : null;
        return (
          <div key={i} className="grid grid-cols-[1fr_110px_36px] items-end gap-2">
            <Field label={i === 0 ? "الصنف" : " "}>
              <Select value={l.itemId || undefined} onChange={(itemId) => setLines(lines.map((x, j) => (j === i ? { ...x, itemId } : x)))} options={items.filter((x) => x.isActive).map((x) => ({ value: x.id, label: `${x.name} (${x.sku})` }))} />
            </Field>
            <Field label={i === 0 ? "الكمية" : " "} hint={avail !== null ? `المتاح ${formatNumber(avail, prefs.digits)}` : undefined}>
              <Input type="number" min={1} value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) } : x)))} />
            </Field>
            <Button variant="ghost" size="sm" aria-label="حذف السطر" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        );
      })}
      <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setLines([...lines, { itemId: "", quantity: 1 }])}>سطر</Button>
    </div>
  );
}

function IssueDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const money = useMoney();
  const whs = trpc.inventory.warehouses.useQuery();
  const items = trpc.inventory.items.useQuery({});
  const lk = trpc.ops.lookups.useQuery();
  const [v, setV] = useState({ warehouseId: "", date: today, branchId: "", requestedBy: "", purpose: "", lines: [{ itemId: "", quantity: 1 }] });
  const m = trpc.inventory.issue.useMutation({ onSuccess: (r) => (toast.success(`صُرف بتكلفة ${money.fmt(r.totalCostMinor)} وقُيّد على المصروف`), void utils.inventory.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const ok = v.warehouseId && v.purpose.trim().length >= 3 && v.lines.every((l) => l.itemId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="صرف مخزون لقسم" description="يُخرج بالمتوسط المرجّح ويُقيد مصروفاً على مركز تكلفة الفرع." width={620}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-2">
          <Field label="المستودع"><Select value={v.warehouseId || undefined} onChange={(warehouseId) => setV({ ...v, warehouseId })} options={(whs.data ?? []).filter((w) => w.isActive).map((w) => ({ value: w.id, label: w.name }))} /></Field>
          <Field label="التاريخ"><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
          <Field label="الفرع"><Select value={v.branchId || "NONE"} onChange={(b) => setV({ ...v, branchId: b === "NONE" ? "" : b })} options={[{ value: "NONE", label: "فرع المستودع" }, ...(lk.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></Field>
          <Field label="المستلم"><Input value={v.requestedBy} onChange={(e) => setV({ ...v, requestedBy: e.target.value })} placeholder="اسم المستلم أو القسم" /></Field>
          <Field label="الغرض" className="col-span-2"><Input value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} placeholder="مثال: قسم العلوم — مستلزمات المختبر" /></Field>
        </div>
        <div className="px-5 pb-4">
          <LinesEditor lines={v.lines} setLines={(lines) => setV({ ...v, lines })} items={items.data?.items ?? []} warehouseId={v.warehouseId} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!ok} onClick={() => m.mutate({ warehouseId: v.warehouseId, date: v.date, branchId: v.branchId || null, requestedBy: v.requestedBy || null, purpose: v.purpose, lines: v.lines })}>صرف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const whs = trpc.inventory.warehouses.useQuery();
  const items = trpc.inventory.items.useQuery({});
  const [v, setV] = useState({ fromId: "", toId: "", date: today, notes: "", lines: [{ itemId: "", quantity: 1 }] });
  const m = trpc.inventory.transfer.useMutation({ onSuccess: (r) => (toast.success(`تم ${r.reference}`), void utils.inventory.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const wopts = (whs.data ?? []).filter((w) => w.isActive).map((w) => ({ value: w.id, label: w.name }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تحويل بين المستودعات" description="ينقل الكمية بتكلفتها دون أثر على الأستاذ العام." width={620}>
        <div className="grid grid-cols-3 gap-3 px-5 pb-2">
          <Field label="من"><Select value={v.fromId || undefined} onChange={(fromId) => setV({ ...v, fromId })} options={wopts} /></Field>
          <Field label="إلى"><Select value={v.toId || undefined} onChange={(toId) => setV({ ...v, toId })} options={wopts.filter((w) => w.value !== v.fromId)} /></Field>
          <Field label="التاريخ"><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        </div>
        <div className="px-5 pb-4">
          <LinesEditor lines={v.lines} setLines={(lines) => setV({ ...v, lines })} items={items.data?.items ?? []} warehouseId={v.fromId} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.fromId || !v.toId || v.lines.some((l) => !l.itemId)} onClick={() => m.mutate({ fromId: v.fromId, toId: v.toId, date: v.date, notes: v.notes || null, lines: v.lines })}>تحويل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WarehousesPage() {
  const q = trpc.inventory.warehouses.useQuery();
  const money = useMoney();
  const prefs = usePrefs();
  const [editing, setEditing] = useState<RouterOutputs["inventory"]["warehouses"][number] | "new" | null>(null);
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>مستودع جديد</Button>}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض المستودعات" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={6} />
      ) : !q.data.length ? (
        <EmptyState illustration="table" title="لا مستودعات" description="أنشئ مستودعاً للمستلزمات وآخر للمتجر والمقصف." action={<Button variant="primary" onClick={() => setEditing("new")}>مستودع جديد</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {q.data.map((w) => (
            <button key={w.id} type="button" onClick={() => setEditing(w)} className="rounded-lg bg-card p-4 text-start shadow-card transition-shadow hover:shadow-card-hover">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[15px] font-semibold"><WarehouseIcon className="size-4 text-fg-3" />{w.name}</span>
                <Tag color={WAREHOUSE_KIND[w.kind]?.color}>{WAREHOUSE_KIND[w.kind]?.label}</Tag>
              </div>
              <p className="mt-1 text-[12px] text-fg-3">{w.code}{w.branch ? ` · ${w.branch}` : ""}{!w.isActive ? " · موقوف" : ""}</p>
              <p className="mt-3 text-[13px] text-fg-2">{formatNumber(w.items, prefs.digits)} صنفاً · {money.fmt(w.valueMinor)}</p>
            </button>
          ))}
        </div>
      )}
      {editing ? <WarehouseDialog w={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </ModuleShell>
  );
}

function WarehouseDialog({ w, onClose }: { w: RouterOutputs["inventory"]["warehouses"][number] | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const lk = trpc.ops.lookups.useQuery();
  const [v, setV] = useState({ code: w?.code ?? "", name: w?.name ?? "", kind: w?.kind ?? "SUPPLIES", branchId: w?.branchId ?? "", isActive: w?.isActive ?? true });
  const m = trpc.inventory.saveWarehouse.useMutation({ onSuccess: () => (toast.success("حُفظ المستودع"), void utils.inventory.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={w ? `تعديل ${w.name}` : "مستودع جديد"}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الرمز"><Input dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field>
          <Field label="الاسم"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="النوع"><Select value={v.kind} onChange={(kind) => setV({ ...v, kind })} options={options(WAREHOUSE_KIND)} /></Field>
          <Field label="الفرع"><Select value={v.branchId || "NONE"} onChange={(b) => setV({ ...v, branchId: b === "NONE" ? "" : b })} options={[{ value: "NONE", label: "كل الفروع" }, ...(lk.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></Field>
          <label className="flex items-center gap-2 text-[14px]"><Checkbox checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} /> نشط</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.code.trim() || v.name.trim().length < 2} onClick={() => m.mutate({ id: w?.id ?? null, code: v.code, name: v.name, kind: v.kind as "SUPPLIES", branchId: v.branchId || null, isActive: v.isActive })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CountsPage() {
  const q = trpc.inventory.counts.useQuery();
  const whs = trpc.inventory.warehouses.useQuery();
  const utils = trpc.useUtils();
  const router = useRouter();
  const today = useToday();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const money = useMoney();
  const [wh, setWh] = useState("");
  const start = trpc.inventory.startCount.useMutation({ onSuccess: (c) => (void utils.inventory.counts.invalidate(), router.push(`/inventory/counts/${c.id}`)), onError: (e) => toast.error(e.message) });
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS}>
      <div className="mb-4 flex flex-wrap items-end gap-2 rounded-lg bg-card p-4 shadow-card">
        <Field label="بدء جرد لمستودع" className="w-64">
          <Select value={wh || undefined} onChange={setWh} options={(whs.data ?? []).filter((w) => w.isActive).map((w) => ({ value: w.id, label: w.name }))} />
        </Field>
        <Button variant="primary" disabled={!wh} loading={start.isPending} onClick={() => start.mutate({ warehouseId: wh, date: today })}>بدء الجرد</Button>
        <p className="text-[12px] text-fg-3">يأخذ لقطة بأرصدة النظام، ثم تُدخل الكميات المعدودة، وعند الاعتماد تُسوّى الفروقات بقيد عجز/زيادة.</p>
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الجرد" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={5} />
      ) : !q.data.length ? (
        <EmptyState illustration="table" title="لا عمليات جرد بعد" />
      ) : (
        <FinTable head={<tr><th>الرقم</th><th>المستودع</th><th>التاريخ</th><th className="text-end">الأصناف</th><th className="text-end">صافي الفرق</th><th>الحالة</th></tr>}>
          {q.data.map((c) => (
            <tr key={c.id}>
              <td><Link className="tabular underline underline-offset-4" href={`/inventory/counts/${c.id}`}>{docNo(c.number, prefs.digits)}</Link></td>
              <td>{c.warehouse}</td>
              <td className="tabular">{fmtDate(c.date)}</td>
              <td className={num}>{formatNumber(c.lines, prefs.digits)}</td>
              <td className={`${num} ${c.varianceMinor < 0 ? "text-danger-700" : ""}`}>{c.status === "POSTED" ? money.fmt(c.varianceMinor, false) : "—"}</td>
              <td><Tag color={c.status === "POSTED" ? "green" : "gold"}>{c.status === "POSTED" ? "معتمد ومسوّى" : "مفتوح"}</Tag></td>
            </tr>
          ))}
        </FinTable>
      )}
    </ModuleShell>
  );
}

export function CountDetail({ id }: { id: string }) {
  const q = trpc.inventory.count.useQuery({ id });
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const [counted, setCounted] = useState<Record<string, number | null>>({});
  const [confirm, setConfirm] = useState(false);
  const save = trpc.inventory.setCountLines.useMutation({ onSuccess: () => (toast.success("حُفظ العد"), setCounted({}), void utils.inventory.count.invalidate({ id })), onError: (e) => toast.error(e.message) });
  const post = trpc.inventory.postCount.useMutation({ onSuccess: () => (toast.success("اعتُمد الجرد وسُوّيت الفروقات"), setConfirm(false), void utils.inventory.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  const dirty = Object.keys(counted).length > 0;
  const lines = d?.lines.map((l) => {
    const c = l.id in counted ? counted[l.id]! : l.countedQty;
    const diff = c === null ? null : c - l.systemQty;
    return { ...l, c, diff };
  });
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS} wide title={d ? `جرد ${d.count.number}` : undefined} crumbs={d ? [{ title: "الجرد", href: "/inventory/counts" }, { title: `${d.count.warehouse} — ${docNo(d.count.number, prefs.digits)}` }] : undefined}
      actions={d?.canEdit ? (
        <>
          <Button size="sm" disabled={!dirty} loading={save.isPending} onClick={() => save.mutate({ countId: id, lines: Object.entries(counted).map(([lid, countedQty]) => ({ id: lid, countedQty })) })}>حفظ العد</Button>
          <Button size="sm" variant="primary" disabled={dirty} onClick={() => setConfirm(true)}>اعتماد وتسوية</Button>
        </>
      ) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الجرد" description={q.error.message} />
      ) : !d || !lines ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <p className="mb-3 text-[13px] text-fg-3">{d.count.status === "POSTED" ? `اعتُمد بصافي فرق ${money.fmt(d.count.varianceMinor)}` : "أدخل الكمية المعدودة لكل صنف؛ الأصناف غير المعدودة بلا رصيد تُتجاهل."}</p>
          <FinTable dense head={<tr><th>الرمز</th><th>الصنف</th><th className="text-end">رصيد النظام</th><th className="text-end">المعدود</th><th className="text-end">الفرق</th><th className="text-end">قيمة الفرق</th></tr>}>
            {lines.map((l) => (
              <tr key={l.id}>
                <td className="tabular text-fg-3">{l.sku}</td>
                <td>{l.name}</td>
                <td className={num}>{formatNumber(l.systemQty, prefs.digits)} <span className="text-fg-3">{l.unit}</span></td>
                <td className="w-28">
                  {d.canEdit ? (
                    <Input aria-label={`المعدود — ${l.name}`} type="number" min={0} className="h-7 text-end" value={l.c ?? ""} onChange={(e) => setCounted({ ...counted, [l.id]: e.target.value === "" ? null : Math.max(0, Math.trunc(Number(e.target.value))) })} />
                  ) : (
                    <span className="block text-end tabular">{l.c === null ? "—" : formatNumber(l.c, prefs.digits)}</span>
                  )}
                </td>
                <td className={`${num} ${l.diff ? (l.diff < 0 ? "text-danger-700" : "text-success-800") : ""}`}>{l.diff === null ? "—" : formatNumber(l.diff, prefs.digits)}</td>
                <td className={num}>{l.diffValueMinor === null ? "—" : money.fmt(l.diffValueMinor, false)}</td>
              </tr>
            ))}
          </FinTable>
        </>
      )}
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="اعتماد الجرد؟" description="تُسوّى فروقات الأصناف المعدودة بحركة مخزون وقيد عجز/زيادة، ولا يمكن التراجع." confirmLabel="اعتماد" loading={post.isPending} onConfirm={() => post.mutate({ id })} />
    </ModuleShell>
  );
}

export function ProcurementSettingsPage() {
  return (
    <ModuleShell nav={nav()} tabs={INVENTORY_TABS}>
      <ModuleSettingsForm<{ principalApprovalAboveMinor: number; priceToleranceBp: number; blockNegativeStock: boolean }> settingsKey="procurement" title="المشتريات والمخزون" description="حدود الاعتماد ومطابقة فواتير الموردين.">
        {(v, set, canEdit) => (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="اعتماد المدير لطلبات الشراء فوق" hint="تحتها يكفي اعتماد المحاسب">
              <MoneyInput disabled={!canEdit} value={v.principalApprovalAboveMinor} onChange={(a) => set({ principalApprovalAboveMinor: a ?? 0 })} />
            </Field>
            <Field label="سماحية فرق السعر عن أمر الشراء ٪" hint="أكثر منها يلزم مسؤول بصلاحية الاعتماد">
              <PercentInput disabled={!canEdit} bp={v.priceToleranceBp} onChange={(priceToleranceBp) => set({ priceToleranceBp })} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-[14px]">
              <Checkbox disabled={!canEdit} checked={v.blockNegativeStock} onChange={(blockNegativeStock) => set({ blockNegativeStock })} /> منع الصرف بأكثر من الرصيد
            </label>
          </div>
        )}
      </ModuleSettingsForm>
    </ModuleShell>
  );
}

export { LinesEditor };
