"use client";
/**
 * الأصول الثابتة: السجل بالتكلفة والمجمع والقيمة الدفترية، تسجيل الأصل بقيد اقتنائه (بنك/صندوق/آجل/افتتاحي)،
 * بطاقة الأصل (الإهلاك التاريخي والمتوقع، الحركات، النقل، الاستبعاد)، ترحيل الإهلاك الشهري، والفئات وحساباتها.
 */
import { ArrowLeftRight, Building2, CalendarCheck, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { FinTable, MoneyInput, num, useFmtDate, useMoney, useToday } from "@/components/finance/common";
import { ASSET_STATUS, ASSET_TABS, DEP_METHOD, opsNav, options } from "./common";

const nav = () => opsNav("assets");

export function AssetsPage() {
  const [filter, setFilter] = useState({ status: "", categoryId: "", q: "" });
  const q = trpc.assets.list.useQuery({ status: filter.status || null, categoryId: filter.categoryId || null, q: filter.q || null });
  const cats = trpc.assets.categories.useQuery();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [creating, setCreating] = useState(false);
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={ASSET_TABS} wide actions={d?.canEdit ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>أصل جديد</Button> : null}>
      {d ? (
        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="تكلفة الأصول القائمة" value={d.totals.cost} format={money.whole} compact icon={<Building2 className="size-4" />} hint={`${formatNumber(d.totals.count, prefs.digits)} أصلاً`} />
          <StatCard label="مجمع الإهلاك" value={d.totals.accumulated} format={money.whole} compact icon={<Building2 className="size-4" />} />
          <StatCard label="القيمة الدفترية" value={d.totals.book} format={money.whole} compact icon={<Building2 className="size-4" />} />
          <StatCard label="آخر إهلاك مرحّل" value={d.lastRun?.totalMinor ?? null} format={money.whole} compact icon={<CalendarCheck className="size-4" />} hint={d.lastRun ? d.lastRun.month : "لم يُرحّل بعد"} href="/finance/assets/depreciation" />
        </section>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="w-60" placeholder="الاسم أو الملصق أو الرقم التسلسلي" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <Select size="sm" className="w-44" value={filter.categoryId || "ALL"} onChange={(c) => setFilter({ ...filter, categoryId: c === "ALL" ? "" : c })} options={[{ value: "ALL", label: "كل الفئات" }, ...(cats.data?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))]} />
        <Select size="sm" className="w-40" value={filter.status || "ALL"} onChange={(s) => setFilter({ ...filter, status: s === "ALL" ? "" : s })} options={[{ value: "ALL", label: "كل الحالات" }, ...options(ASSET_STATUS)]} />
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الأصول" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : !d.assets.length ? (
        <EmptyState illustration="table" title="لا أصول مسجلة" description="سجّل الأصول القائمة كأرصدة افتتاحية بمجمع إهلاكها، والجديدة بمصدر تمويلها." action={d.canEdit ? <Button variant="primary" onClick={() => setCreating(true)}>أصل جديد</Button> : undefined} />
      ) : (
        <FinTable head={<tr><th>الملصق</th><th>الأصل</th><th>الفئة</th><th>الموقع</th><th>الشراء</th><th className="text-end">التكلفة</th><th className="text-end">المجمع</th><th className="text-end">الدفترية</th><th>الحالة</th></tr>}>
          {d.assets.map((a) => (
            <tr key={a.id}>
              <td className="tabular text-fg-3" dir="ltr">{a.tag}</td>
              <td><Link className="font-medium hover:underline" href={`/finance/assets/${a.id}`}>{a.name}</Link></td>
              <td>{a.category}</td>
              <td>{[a.branch, a.location].filter(Boolean).join(" — ") || "—"}</td>
              <td className="tabular">{fmtDate(a.purchaseDate)}</td>
              <td className={num}>{money.fmt(a.costMinor, false)}</td>
              <td className={num}>{money.fmt(a.accumulatedMinor, false)}</td>
              <td className={cn(num, "font-semibold")}>{money.fmt(a.bookValueMinor, false)}</td>
              <td><Tag color={ASSET_STATUS[a.status]?.color}>{ASSET_STATUS[a.status]?.label}</Tag></td>
            </tr>
          ))}
        </FinTable>
      )}
      {creating ? <AssetDialog onClose={() => setCreating(false)} /> : null}
    </ModuleShell>
  );
}

function AssetDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const today = useToday();
  const cats = trpc.assets.categories.useQuery();
  const lk = trpc.ops.lookups.useQuery();
  const [v, setV] = useState({ name: "", categoryId: "", tag: "", serialNumber: "", branchId: "", roomId: "", location: "", custodianId: "", purchaseDate: today, costMinor: null as number | null, salvageMinor: 0 as number | null, usefulLifeMonths: null as number | null, method: "" as "" | "STRAIGHT_LINE" | "DECLINING" | "NONE", fundedBy: "BANK" as "BANK" | "CASH" | "AP" | "OPENING", bankAccountId: "", openingAccumulatedMinor: 0 as number | null, openingDepreciatedTo: "", notes: "" });
  const cat = cats.data?.categories.find((c) => c.id === v.categoryId);
  const m = trpc.assets.create.useMutation({ onSuccess: (a) => (toast.success("سُجل الأصل بقيد اقتنائه"), void utils.assets.invalidate(), router.push(`/finance/assets/${a.id}`)), onError: (e) => toast.error(e.message) });
  const ok = v.name.trim().length >= 2 && v.categoryId && v.costMinor && (v.fundedBy !== "BANK" || v.bankAccountId) && (v.fundedBy !== "OPENING" || !v.openingAccumulatedMinor || v.openingDepreciatedTo);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="أصل جديد" description="يُرحَّل قيد الاقتناء: مدين حساب الأصل، دائن مصدر التمويل." width={720}>
        <div className="grid max-h-[65vh] grid-cols-2 gap-3 overflow-y-auto px-5 pb-4 sm:grid-cols-3">
          <Field label="الاسم" className="col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus /></Field>
          <Field label="الفئة"><Select value={v.categoryId || undefined} onChange={(categoryId) => setV({ ...v, categoryId })} options={(cats.data?.categories ?? []).filter((c) => c.isActive).map((c) => ({ value: c.id, label: c.name }))} /></Field>
          <Field label="الملصق/الباركود" hint="فارغ = يُولَّد تلقائياً"><Input dir="ltr" value={v.tag} onChange={(e) => setV({ ...v, tag: e.target.value })} /></Field>
          <Field label="الرقم التسلسلي"><Input dir="ltr" value={v.serialNumber} onChange={(e) => setV({ ...v, serialNumber: e.target.value })} /></Field>
          <Field label="تاريخ الشراء"><Input type="date" value={v.purchaseDate} onChange={(e) => setV({ ...v, purchaseDate: e.target.value })} /></Field>
          <Field label="الفرع"><Select value={v.branchId || "NONE"} onChange={(b) => setV({ ...v, branchId: b === "NONE" ? "" : b, roomId: "" })} options={[{ value: "NONE", label: "الإدارة العامة" }, ...(lk.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></Field>
          <Field label="القاعة"><Select value={v.roomId || "NONE"} onChange={(r) => setV({ ...v, roomId: r === "NONE" ? "" : r })} options={[{ value: "NONE", label: "—" }, ...(lk.data?.rooms ?? []).filter((r) => !v.branchId || r.branchId === v.branchId).map((r) => ({ value: r.id, label: r.name }))]} /></Field>
          <Field label="العهدة (موظف)"><Select value={v.custodianId || "NONE"} onChange={(c) => setV({ ...v, custodianId: c === "NONE" ? "" : c })} options={[{ value: "NONE", label: "—" }, ...(lk.data?.employees ?? []).map((e) => ({ value: e.id, label: e.fullName }))]} /></Field>
          <Field label="التكلفة"><MoneyInput value={v.costMinor} onChange={(costMinor) => setV({ ...v, costMinor })} /></Field>
          <Field label="قيمة الخردة"><MoneyInput value={v.salvageMinor} onChange={(salvageMinor) => setV({ ...v, salvageMinor })} /></Field>
          <Field label="العمر (شهر)" hint={cat ? `افتراضي الفئة ${cat.usefulLifeMonths}` : undefined}><Input type="number" min={1} value={v.usefulLifeMonths ?? ""} onChange={(e) => setV({ ...v, usefulLifeMonths: e.target.value ? Math.max(1, Math.trunc(Number(e.target.value))) : null })} /></Field>
          <Field label="طريقة الإهلاك" hint={cat ? `افتراضي الفئة: ${DEP_METHOD[cat.method]?.label}` : undefined}><Select value={v.method || "CAT"} onChange={(x) => setV({ ...v, method: x === "CAT" ? "" : (x as "NONE") })} options={[{ value: "CAT", label: "حسب الفئة" }, ...options(DEP_METHOD)]} /></Field>
          <Field label="التمويل"><Select value={v.fundedBy} onChange={(f) => setV({ ...v, fundedBy: f as "BANK" })} options={[{ value: "BANK", label: "من البنك" }, { value: "CASH", label: "من الصندوق" }, { value: "AP", label: "آجل على المورد" }, { value: "OPENING", label: "رصيد افتتاحي (أصل قائم)" }]} /></Field>
          {v.fundedBy === "BANK" ? <Field label="الحساب البنكي"><Select value={v.bankAccountId || undefined} onChange={(bankAccountId) => setV({ ...v, bankAccountId })} options={(lk.data?.banks ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Field> : null}
          {v.fundedBy === "OPENING" ? (
            <>
              <Field label="مجمع الإهلاك الافتتاحي"><MoneyInput value={v.openingAccumulatedMinor} onChange={(openingAccumulatedMinor) => setV({ ...v, openingAccumulatedMinor })} /></Field>
              <Field label="أُهلك حتى شهر"><Input type="month" value={v.openingDepreciatedTo} onChange={(e) => setV({ ...v, openingDepreciatedTo: e.target.value })} /></Field>
            </>
          ) : null}
          <Field label="ملاحظات" className="col-span-2 sm:col-span-3"><Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!ok} onClick={() => m.mutate({ name: v.name, categoryId: v.categoryId, tag: v.tag || null, serialNumber: v.serialNumber || null, branchId: v.branchId || null, roomId: v.roomId || null, location: v.location || null, custodianId: v.custodianId || null, purchaseDate: v.purchaseDate, costMinor: v.costMinor!, salvageMinor: v.salvageMinor ?? 0, usefulLifeMonths: v.usefulLifeMonths, method: v.method || null, fundedBy: v.fundedBy, bankAccountId: v.bankAccountId || null, openingAccumulatedMinor: v.fundedBy === "OPENING" ? (v.openingAccumulatedMinor ?? 0) : undefined, openingDepreciatedTo: v.openingDepreciatedTo || null, notes: v.notes || null })}>تسجيل الأصل</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssetDetail({ id }: { id: string }) {
  const q = trpc.assets.get.useQuery({ id });
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [dialog, setDialog] = useState<"transfer" | "dispose" | null>(null);
  const d = q.data;
  const a = d?.asset;
  return (
    <ModuleShell nav={nav()} tabs={ASSET_TABS} wide title={a?.name} crumbs={a ? [{ title: "سجل الأصول", href: "/finance/assets" }, { title: a.tag }] : undefined}
      actions={d?.canEdit && a?.status !== "DISPOSED" ? (<><Button size="sm" icon={<ArrowLeftRight className="size-3.5" />} onClick={() => setDialog("transfer")}>نقل / عهدة</Button><Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setDialog("dispose")}>استبعاد أو بيع</Button></>) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الأصل" description={q.error.message} />
      ) : !d || !a ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <header className="mb-4">
            <h1 className="text-[26px] font-bold">{a.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
              <Tag color={ASSET_STATUS[a.status]?.color}>{ASSET_STATUS[a.status]?.label}</Tag>
              <span className="tabular" dir="ltr">{a.tag}</span>· {a.category.name} · <Tag color={DEP_METHOD[a.method]?.color}>{DEP_METHOD[a.method]?.label}</Tag> · {formatNumber(a.usefulLifeMonths, prefs.digits)} شهراً
              {a.serialNumber ? <span>· رقم تسلسلي {a.serialNumber}</span> : null}
            </p>
            <p className="mt-1 text-[13px] text-fg-2">{[a.branch, a.room, a.location].filter(Boolean).join(" — ") || "بلا موقع"}{a.custodian ? ` · عهدة ${a.custodian}` : ""}{a.supplier ? ` · المورد ${a.supplier}` : ""}</p>
          </header>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="التكلفة" value={a.costMinor} format={(n) => money.fmt(n)} compact icon={<Building2 className="size-4" />} hint={`شراء ${fmtDate(a.purchaseDate)}`} />
            <StatCard label="مجمع الإهلاك" value={a.accumulatedMinor} format={(n) => money.fmt(n)} compact icon={<Building2 className="size-4" />} hint={a.lastDepreciatedMonth ? `حتى ${a.lastDepreciatedMonth}` : "لم يُهلك بعد"} />
            <StatCard label="القيمة الدفترية" value={a.bookValueMinor} format={(n) => money.fmt(n)} compact icon={<Building2 className="size-4" />} hint={`الخردة ${money.fmt(a.salvageMinor)}`} />
            {a.status === "DISPOSED" ? <StatCard label="ربح/خسارة الاستبعاد" value={a.disposalGainMinor} format={(n) => money.fmt(n)} compact tone={(a.disposalGainMinor ?? 0) < 0 ? "danger" : "success"} icon={<Trash2 className="size-4" />} hint={`متحصلات ${money.fmt(a.disposalProceedsMinor ?? 0)}`} /> : <StatCard label="قسط الشهر القادم" value={d.forecast[0]?.amountMinor ?? 0} format={(n) => money.fmt(n)} compact icon={<CalendarCheck className="size-4" />} />}
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">الإهلاك المرحّل</h2>
              {!d.history.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا أقساط مرحّلة.</p> : (
                <FinTable dense head={<tr><th>الشهر</th><th className="text-end">القسط</th><th className="text-end">القيمة بعده</th><th /></tr>}>
                  {d.history.map((h) => <tr key={h.month}><td className="tabular">{h.month}</td><td className={num}>{money.fmt(h.amountMinor, false)}</td><td className={num}>{money.fmt(h.bookValueMinor, false)}</td><td>{h.journalEntryId ? <Link className="text-[12px] underline" href={`/finance/accounting/entries/${h.journalEntryId}`}>القيد</Link> : null}</td></tr>)}
                </FinTable>
              )}
              {d.forecast.length ? (
                <>
                  <h2 className="mb-2 mt-4 text-[15px] font-semibold">الأقساط المتوقعة (١٢ شهراً)</h2>
                  <FinTable dense head={<tr><th>الشهر</th><th className="text-end">القسط</th><th className="text-end">القيمة بعده</th></tr>}>
                    {d.forecast.map((h) => <tr key={h.month} className="text-fg-2"><td className="tabular">{h.month}</td><td className={num}>{money.fmt(h.amountMinor, false)}</td><td className={num}>{money.fmt(h.bookValueMinor, false)}</td></tr>)}
                  </FinTable>
                </>
              ) : null}
            </section>
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">الحركات</h2>
              <ol className="space-y-2">
                {a.movements.map((mv) => (
                  <li key={mv.id} className="rounded-lg bg-card px-4 py-2.5 text-[13px] shadow-card">
                    <span className="flex justify-between"><b>{{ ACQUISITION: "اقتناء", TRANSFER: "نقل", DISPOSAL: "استبعاد", DEPRECIATION_COMPLETE: "اكتمال الإهلاك" }[mv.kind] ?? mv.kind}</b><span className="tabular text-fg-3">{fmtDate(mv.date)}</span></span>
                    {mv.fromText || mv.toText ? <span className="block text-fg-2">{mv.fromText ?? "—"} ← {mv.toText ?? "—"}</span> : null}
                    {mv.notes ? <span className="block text-fg-3">{mv.notes}</span> : null}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-[13px]">
                {a.acquisitionEntryId ? <Link className="me-3 underline" href={`/finance/accounting/entries/${a.acquisitionEntryId}`}>قيد الاقتناء</Link> : null}
                {a.disposalEntryId ? <Link className="underline" href={`/finance/accounting/entries/${a.disposalEntryId}`}>قيد الاستبعاد</Link> : null}
              </p>
            </section>
          </div>
          {dialog === "transfer" ? <TransferAssetDialog asset={d} onClose={() => setDialog(null)} /> : null}
          {dialog === "dispose" ? <DisposeDialog asset={d} onClose={() => setDialog(null)} /> : null}
        </>
      )}
    </ModuleShell>
  );
}

function TransferAssetDialog({ asset, onClose }: { asset: RouterOutputs["assets"]["get"]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const lk = trpc.ops.lookups.useQuery();
  const a = asset.asset;
  const [v, setV] = useState({ branchId: a.branchId ?? "", roomId: a.roomId ?? "", location: a.location ?? "", custodianId: a.custodianId ?? "", date: today, notes: "" });
  const m = trpc.assets.transfer.useMutation({ onSuccess: () => (toast.success("سُجل النقل"), void utils.assets.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="نقل الأصل أو تغيير العهدة" description="يُسجَّل في حركات الأصل، ويتغير مركز التكلفة للأقساط القادمة." width={560}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الفرع"><Select value={v.branchId || "NONE"} onChange={(b) => setV({ ...v, branchId: b === "NONE" ? "" : b, roomId: "" })} options={[{ value: "NONE", label: "الإدارة العامة" }, ...(lk.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></Field>
          <Field label="القاعة"><Select value={v.roomId || "NONE"} onChange={(r) => setV({ ...v, roomId: r === "NONE" ? "" : r })} options={[{ value: "NONE", label: "—" }, ...(lk.data?.rooms ?? []).filter((r) => !v.branchId || r.branchId === v.branchId).map((r) => ({ value: r.id, label: r.name }))]} /></Field>
          <Field label="وصف الموقع"><Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} /></Field>
          <Field label="العهدة"><Select value={v.custodianId || "NONE"} onChange={(c) => setV({ ...v, custodianId: c === "NONE" ? "" : c })} options={[{ value: "NONE", label: "—" }, ...(lk.data?.employees ?? []).map((e) => ({ value: e.id, label: e.fullName }))]} /></Field>
          <Field label="التاريخ"><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
          <Field label="ملاحظة"><Input value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate({ id: a.id, branchId: v.branchId || null, roomId: v.roomId || null, location: v.location || null, custodianId: v.custodianId || null, date: v.date, notes: v.notes || null })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisposeDialog({ asset, onClose }: { asset: RouterOutputs["assets"]["get"]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const money = useMoney();
  const lk = trpc.ops.lookups.useQuery();
  const a = asset.asset;
  const [v, setV] = useState({ date: today, proceeds: 0 as number | null, receivedIn: "NONE" as "CASH" | "BANK" | "NONE", bankAccountId: "", reason: "" });
  const gain = (v.proceeds ?? 0) - a.bookValueMinor;
  const m = trpc.assets.dispose.useMutation({ onSuccess: () => (toast.success("استُبعد الأصل بقيده"), void utils.assets.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="استبعاد أو بيع الأصل" description="يتطلب ترحيل إهلاك الأشهر السابقة أولاً. القيد: مدين المجمع والمتحصلات، دائن التكلفة، والفرق ربح أو خسارة." width={520}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="التاريخ"><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
          <Field label="المتحصلات (إن بيع)"><MoneyInput value={v.proceeds} onChange={(proceeds) => setV({ ...v, proceeds, receivedIn: proceeds ? (v.receivedIn === "NONE" ? "CASH" : v.receivedIn) : "NONE" })} /></Field>
          {v.proceeds ? <Field label="استُلمت في"><Select value={v.receivedIn} onChange={(r) => setV({ ...v, receivedIn: r as "CASH" })} options={[{ value: "CASH", label: "الصندوق" }, { value: "BANK", label: "البنك" }]} /></Field> : null}
          {v.proceeds && v.receivedIn === "BANK" ? <Field label="الحساب البنكي"><Select value={v.bankAccountId || undefined} onChange={(bankAccountId) => setV({ ...v, bankAccountId })} options={(lk.data?.banks ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Field> : null}
          <Field label="السبب" className="col-span-2"><Input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} placeholder="تلف، استبدال، بيع…" /></Field>
          <p className={cn("col-span-2 text-[14px]", gain < 0 ? "text-danger-700" : "text-success-800")}>القيمة الدفترية {money.fmt(a.bookValueMinor)} ← {gain < 0 ? "خسارة" : "ربح"} {money.fmt(Math.abs(gain))}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="danger" loading={m.isPending} disabled={v.reason.trim().length < 3 || (v.receivedIn === "BANK" && !v.bankAccountId)} onClick={() => m.mutate({ id: a.id, date: v.date, proceedsMinor: v.proceeds ?? 0, receivedIn: v.proceeds ? v.receivedIn : "NONE", bankAccountId: v.bankAccountId || null, reason: v.reason })}>استبعاد</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DepreciationPage() {
  const q = trpc.assets.runs.useQuery();
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [month, setMonth] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const run = trpc.assets.depreciate.useMutation({ onSuccess: (r) => (toast.success(`رُحّل إهلاك ${r.month}: ${money.fmt(r.totalMinor)} (${formatNumber(r.assets, prefs.digits)} أصلاً)`), setConfirm(false), void utils.assets.invalidate()), onError: (e) => (toast.error(e.message), setConfirm(false)) });
  const d = q.data;
  const m = month ?? d?.suggested ?? "";
  return (
    <ModuleShell nav={nav()} tabs={ASSET_TABS}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الإهلاك" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={6} />
      ) : (
        <>
          {d.canRun ? (
            <div className="mb-5 flex flex-wrap items-end gap-3 rounded-lg bg-card p-4 shadow-card">
              <Field label="ترحيل إهلاك شهر"><Input type="month" value={m} onChange={(e) => setMonth(e.target.value)} /></Field>
              <Button variant="primary" disabled={!m} onClick={() => setConfirm(true)}>ترحيل</Button>
              <p className="text-[12px] text-fg-3">قيد واحد مجمّع لكل الأصول (مصروف الإهلاك ← مجمع الإهلاك) بمراكز تكلفتها، ويستكمل الأشهر الفائتة لكل أصل. يُرحّل تلقائياً أول كل شهر إن فُعّل في إعدادات المالية.</p>
            </div>
          ) : null}
          {!d.runs.length ? <EmptyState illustration="calendar" title="لم يُرحّل أي إهلاك بعد" /> : (
            <FinTable head={<tr><th>الشهر</th><th className="text-end">الأصول</th><th className="text-end">القسط</th><th>التاريخ</th><th>القيد</th></tr>}>
              {d.runs.map((r) => (
                <tr key={r.id}>
                  <td className="tabular font-medium">{r.month}</td>
                  <td className={num}>{formatNumber(r.assets, prefs.digits)}</td>
                  <td className={num}>{money.fmt(r.totalMinor, false)}</td>
                  <td className="tabular">{fmtDate(r.createdAt)}</td>
                  <td>{r.journalEntryId ? <Link className="underline" href={`/finance/accounting/entries/${r.journalEntryId}`}>عرض القيد</Link> : "—"}</td>
                </tr>
              ))}
            </FinTable>
          )}
          <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={`ترحيل إهلاك ${m}؟`} description="لا يتكرر ترحيل الشهر نفسه، والعكس بقيد عكسي من المحاسبة." confirmLabel="ترحيل" loading={run.isPending} onConfirm={() => run.mutate({ month: m })} />
        </>
      )}
    </ModuleShell>
  );
}

type Cat = RouterOutputs["assets"]["categories"]["categories"][number];

export function CategoriesPage() {
  const q = trpc.assets.categories.useQuery();
  const prefs = usePrefs();
  const [editing, setEditing] = useState<Cat | "new" | null>(null);
  const d = q.data;
  const acc = (id: string) => d?.accounts.find((a) => a.id === id);
  return (
    <ModuleShell nav={nav()} tabs={ASSET_TABS} actions={d?.canEdit ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>فئة جديدة</Button> : null}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الفئات" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={6} />
      ) : (
        <FinTable head={<tr><th>الرمز</th><th>الفئة</th><th>الطريقة</th><th className="text-end">العمر</th><th>حساب الأصل</th><th>المجمع</th><th>المصروف</th><th className="text-end">الأصول</th></tr>}>
          {d.categories.map((c) => (
            <tr key={c.id} className="cursor-pointer" onClick={() => d.canEdit && setEditing(c)}>
              <td className="tabular">{c.code}</td>
              <td className="font-medium">{c.name}{!c.isActive ? <Tag color="gray" className="ms-2">موقوفة</Tag> : null}</td>
              <td><Tag color={DEP_METHOD[c.method]?.color}>{DEP_METHOD[c.method]?.label}</Tag></td>
              <td className={num}>{formatNumber(c.usefulLifeMonths, prefs.digits)} شهراً</td>
              <td className="text-[12px]">{acc(c.assetAccountId)?.code} {acc(c.assetAccountId)?.name}</td>
              <td className="text-[12px]">{acc(c.accumAccountId)?.code} {acc(c.accumAccountId)?.name}</td>
              <td className="text-[12px]">{acc(c.expenseAccountId)?.code} {acc(c.expenseAccountId)?.name}</td>
              <td className={num}>{formatNumber(c._count.assets, prefs.digits)}</td>
            </tr>
          ))}
        </FinTable>
      )}
      {editing && d ? <CategoryDialog cat={editing === "new" ? null : editing} accounts={d.accounts} onClose={() => setEditing(null)} /> : null}
    </ModuleShell>
  );
}

function CategoryDialog({ cat, accounts, onClose }: { cat: Cat | null; accounts: RouterOutputs["assets"]["categories"]["accounts"]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ code: cat?.code ?? "", name: cat?.name ?? "", assetAccountId: cat?.assetAccountId ?? "", accumAccountId: cat?.accumAccountId ?? "", expenseAccountId: cat?.expenseAccountId ?? "", method: (cat?.method ?? "STRAIGHT_LINE") as "STRAIGHT_LINE", usefulLifeMonths: cat?.usefulLifeMonths ?? 60, decliningRateBp: cat?.decliningRateBp ?? null as number | null, isActive: cat?.isActive ?? true });
  const m = trpc.assets.saveCategory.useMutation({ onSuccess: () => (toast.success("حُفظت الفئة"), void utils.assets.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const opts = (type: string) => accounts.filter((a) => a.type === type).map((a) => ({ value: a.id, label: `${a.code} ${a.name}` }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={cat ? `تعديل ${cat.name}` : "فئة أصول جديدة"} width={620}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الرمز"><Input dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field>
          <Field label="الاسم"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="حساب الأصل"><Select value={v.assetAccountId || undefined} onChange={(assetAccountId) => setV({ ...v, assetAccountId })} options={opts("ASSET")} /></Field>
          <Field label="مجمع الإهلاك"><Select value={v.accumAccountId || undefined} onChange={(accumAccountId) => setV({ ...v, accumAccountId })} options={opts("ASSET")} /></Field>
          <Field label="مصروف الإهلاك"><Select value={v.expenseAccountId || undefined} onChange={(expenseAccountId) => setV({ ...v, expenseAccountId })} options={opts("EXPENSE")} /></Field>
          <Field label="الطريقة"><Select value={v.method} onChange={(x) => setV({ ...v, method: x as "STRAIGHT_LINE" })} options={options(DEP_METHOD)} /></Field>
          <Field label="العمر الإنتاجي (شهر)"><Input type="number" min={1} value={v.usefulLifeMonths} onChange={(e) => setV({ ...v, usefulLifeMonths: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]"><Checkbox checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} /> نشطة</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.code.trim() || !v.name.trim() || !v.assetAccountId || !v.accumAccountId || !v.expenseAccountId} onClick={() => m.mutate({ id: cat?.id ?? null, ...v })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
