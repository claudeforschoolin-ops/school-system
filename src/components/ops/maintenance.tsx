"use client";
/**
 * الصيانة والمرافق: لوحة كانبان للبلاغات (سحب بين الأعمدة)، تفاصيل البلاغ (الإسناد، صور قبل/بعد، قطع الغيار،
 * الإكمال بالتكلفة المرحّلة)، الصيانة الدورية، وحجز القاعات بتقويم أسبوعي يُظهر الحصص المجدولة.
 */
import { AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock, Hammer, ImageIcon, Package, Plus, RefreshCw, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { docNo, FinTable, MoneyInput, num, useFmtDate, useMoney, useToday } from "@/components/finance/common";
import { addDays, MAINT_CATEGORY, MAINT_STATUS, MAINT_TABS, opsNav, options, PhotoList, PRIORITY, weekStartOf } from "./common";

type Board = RouterOutputs["maintenance"]["board"];
const COLUMNS = ["NEW", "IN_PROGRESS", "WAITING_PARTS", "DONE"] as const;
const WEEK = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function useMaintNav() {
  const { scopeOf } = useApp();
  const s = scopeOf("maintenance", "view");
  const staff = s === "ALL" || s === "BRANCH" || s === "STAGE";
  return { nav: opsNav("maintenance"), tabs: staff ? MAINT_TABS : [{ href: "/maintenance", label: "بلاغاتي", exact: true }, { href: "/maintenance/bookings", label: "حجز المرافق" }], staff };
}

export function MaintenanceBoard() {
  const { nav, tabs, staff } = useMaintNav();
  const [filter, setFilter] = useState({ category: "", assigneeId: "", q: "" });
  const q = trpc.maintenance.board.useQuery({ category: filter.category || null, assigneeId: filter.assigneeId || null, q: filter.q || null });
  const stats = trpc.maintenance.stats.useQuery(undefined, { enabled: staff, retry: false });
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [creating, setCreating] = useState(false);
  const [completing, setCompleting] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const move = trpc.maintenance.update.useMutation({ onMutate: async (v) => {
    await utils.maintenance.board.cancel();
    const key = { category: filter.category || null, assigneeId: filter.assigneeId || null, q: filter.q || null };
    const prev = utils.maintenance.board.getData(key);
    if (prev && v.status) utils.maintenance.board.setData(key, { ...prev, requests: prev.requests.map((r) => (r.id === v.id ? { ...r, status: v.status! } : r)) });
    return { prev, key };
  }, onError: (e, _v, ctx) => (toast.error(e.message), ctx?.prev && utils.maintenance.board.setData(ctx.key, ctx.prev)), onSettled: () => void utils.maintenance.invalidate() });
  const d = q.data;
  const drop = (status: string) => {
    if (!dragging) return;
    const r = d?.requests.find((x) => x.id === dragging);
    setDragging(null);
    if (!r || r.status === status) return;
    if (status === "DONE") return setCompleting(r.id);
    move.mutate({ id: r.id, status: status as "NEW" });
  };
  return (
    <ModuleShell nav={nav} tabs={tabs} wide actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>بلاغ صيانة</Button>}>
      {staff && stats.data ? (
        <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="بلاغات مفتوحة" value={stats.data.open} icon={<Wrench className="size-4" />} />
          <StatCard label="عاجلة" value={stats.data.urgent} tone={stats.data.urgent ? "danger" : undefined} icon={<AlertTriangle className="size-4" />} />
          <StatCard label="متوسط زمن الإنجاز" value={stats.data.avgHours} format={(n) => `${formatNumber(n, prefs.digits)} ساعة`} compact icon={<Clock className="size-4" />} />
          <StatCard label="المنجز" value={stats.data.done} icon={<CheckCircle2 className="size-4" />} tone="success" />
        </section>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input className="w-56" placeholder="بحث بالعنوان أو الموقع" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
        <Select size="sm" className="w-36" value={filter.category || "ALL"} onChange={(c) => setFilter({ ...filter, category: c === "ALL" ? "" : c })} options={[{ value: "ALL", label: "كل التصنيفات" }, ...options(MAINT_CATEGORY)]} />
        {staff && d?.technicians.length ? <Select size="sm" className="w-40" value={filter.assigneeId || "ALL"} onChange={(a) => setFilter({ ...filter, assigneeId: a === "ALL" ? "" : a })} options={[{ value: "ALL", label: "كل الفنيين" }, ...d.technicians.map((t) => ({ value: t.id, label: t.name }))]} /> : null}
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض البلاغات" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : !d.requests.length && !filter.q && !filter.category ? (
        <EmptyState illustration="inbox" title={staff ? "لا بلاغات صيانة" : "لم تُبلّغ عن أي عطل بعد"} description="أبلغ عن عطل بصورة وموقع، ويتابع فريق الصيانة حتى الإنجاز." action={<Button variant="primary" onClick={() => setCreating(true)}>بلاغ صيانة</Button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const list = d.requests.filter((r) => r.status === col);
            return (
              <section key={col} onDragOver={(e) => d.canManage && e.preventDefault()} onDrop={() => drop(col)} className="min-h-[200px] rounded-lg p-2" style={{ background: `var(--tag-${MAINT_STATUS[col]!.color}-bg)` }} aria-label={MAINT_STATUS[col]!.label}>
                <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px] font-semibold">
                  <Tag color={MAINT_STATUS[col]!.color}>{MAINT_STATUS[col]!.label}</Tag>
                  <span className="text-fg-3 tabular">{formatNumber(list.length, prefs.digits)}</span>
                </h2>
                <div className="space-y-2">
                  {list.map((r) => (
                    <Link key={r.id} href={`/maintenance/${r.id}`} draggable={d.canManage} onDragStart={() => setDragging(r.id)} onDragEnd={() => setDragging(null)} className={cn("block rounded-md bg-card p-3 shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-card-hover", dragging === r.id && "opacity-50")}>
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-[14px] font-medium leading-snug">{r.title}</span>
                        <Tag size="sm" color={PRIORITY[r.priority]?.color}>{PRIORITY[r.priority]?.label}</Tag>
                      </span>
                      <span className="mt-1 block text-[12px] text-fg-3">{r.location || "—"}</span>
                      <span className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-3">
                        <Tag size="sm" color={MAINT_CATEGORY[r.category]?.color}>{MAINT_CATEGORY[r.category]?.label}</Tag>
                        <span className="tabular">#{docNo(r.number, prefs.digits)}</span>
                        {r.assignee ? <span>· {r.assignee}</span> : null}
                        {r.dueDate ? <span className={cn(r.overdue && "font-semibold text-danger-700")}>· {fmtDate(r.dueDate)}</span> : null}
                        {r.photos ? <span className="flex items-center gap-0.5">· <ImageIcon className="size-3" />{formatNumber(r.photos, prefs.digits)}</span> : null}
                        {r.scheduled ? <span>· دورية</span> : null}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {creating ? <NewRequestDialog onClose={() => setCreating(false)} /> : null}
      {completing ? <CompleteDialog id={completing} onClose={() => setCompleting(null)} /> : null}
    </ModuleShell>
  );
}

function NewRequestDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const rooms = trpc.maintenance.bookings.useQuery({ weekStart: weekStartOf(new Date().toISOString().slice(0, 10)) });
  const [v, setV] = useState({ title: "", description: "", category: "OTHER", priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "URGENT", roomId: "", location: "", photos: [] as Array<{ url: string; name?: string }> });
  const m = trpc.maintenance.create.useMutation({ onSuccess: (r) => (toast.success("أُرسل البلاغ لفريق الصيانة"), void utils.maintenance.invalidate(), router.push(`/maintenance/${r.id}`)), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="بلاغ صيانة" description="البلاغ العاجل والمهم يُشعر فريق الصيانة فوراً." width={600}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="العنوان" className="col-span-2"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="مثال: تسرب مياه في دورة المياه" autoFocus /></Field>
          <Field label="التصنيف"><Select value={v.category} onChange={(category) => setV({ ...v, category })} options={options(MAINT_CATEGORY)} /></Field>
          <Field label="الأولوية"><Select value={v.priority} onChange={(p) => setV({ ...v, priority: p as "LOW" })} options={options(PRIORITY)} /></Field>
          <Field label="القاعة"><Select value={v.roomId || "NONE"} onChange={(r) => setV({ ...v, roomId: r === "NONE" ? "" : r })} options={[{ value: "NONE", label: "غير محددة" }, ...(rooms.data?.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))]} /></Field>
          <Field label="تفاصيل الموقع"><Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="الدور الثاني — الممر الشرقي" /></Field>
          <Field label="الوصف" className="col-span-2"><Textarea rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <div className="col-span-2"><PhotoList label="صور العطل" value={v.photos} onChange={(photos) => setV({ ...v, photos })} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.title.trim().length < 3} onClick={() => m.mutate({ title: v.title, description: v.description || null, category: v.category as "OTHER", priority: v.priority, roomId: v.roomId || null, location: v.location || null, beforePhotos: v.photos })}>إرسال</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RequestPage({ id }: { id: string }) {
  const { nav, tabs } = useMaintNav();
  const q = trpc.maintenance.get.useQuery({ id });
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [dialog, setDialog] = useState<"parts" | "complete" | null>(null);
  const upd = trpc.maintenance.update.useMutation({ onSuccess: () => (toast.success("حُفظ"), void utils.maintenance.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  const r = d?.request;
  const open = r && !["DONE", "CANCELLED"].includes(r.status);
  return (
    <ModuleShell nav={nav} tabs={tabs} wide title={r?.title} crumbs={r ? [{ title: `بلاغ ${docNo(r.number, prefs.digits)}` }] : undefined}
      actions={d && open && d.canWork ? (
        <>
          {r!.status === "NEW" ? <Button size="sm" icon={<Hammer className="size-3.5" />} loading={upd.isPending} onClick={() => upd.mutate({ id, status: "IN_PROGRESS" })}>بدء العمل</Button> : null}
          {r!.status === "IN_PROGRESS" ? <Button size="sm" onClick={() => upd.mutate({ id, status: "WAITING_PARTS" })}>بانتظار قطع</Button> : null}
          {r!.status === "WAITING_PARTS" ? <Button size="sm" onClick={() => upd.mutate({ id, status: "IN_PROGRESS" })}>استئناف</Button> : null}
          {d.canManage ? <Button size="sm" icon={<Package className="size-3.5" />} onClick={() => setDialog("parts")}>صرف قطع</Button> : null}
          <Button size="sm" variant="primary" icon={<CheckCircle2 className="size-3.5" />} onClick={() => setDialog("complete")}>إكمال</Button>
        </>
      ) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض البلاغ" description={q.error.message} />
      ) : !d || !r ? (
        <SkeletonLines lines={10} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <header>
              <h1 className="text-[24px] font-bold">{r.title}</h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
                <Tag color={MAINT_STATUS[r.status]?.color}>{MAINT_STATUS[r.status]?.label}</Tag>
                <Tag color={PRIORITY[r.priority]?.color}>أولوية {PRIORITY[r.priority]?.label}</Tag>
                <Tag color={MAINT_CATEGORY[r.category]?.color}>{MAINT_CATEGORY[r.category]?.label}</Tag>
                <span>{[r.branch, r.room, r.location].filter(Boolean).join(" — ")}</span>
              </p>
              {r.description ? <p className="mt-3 whitespace-pre-line text-[14px] text-fg-2">{r.description}</p> : null}
            </header>
            <section className="rounded-lg bg-card p-4 shadow-card">
              <PhotoList label="صور قبل" value={r.beforePhotos as Array<{ url: string }>} disabled={!d.canWork || !open} onChange={(beforePhotos) => upd.mutate({ id, beforePhotos })} />
              <div className="mt-4"><PhotoList label="صور بعد" value={r.afterPhotos as Array<{ url: string }>} disabled={!d.canWork || !open} onChange={(afterPhotos) => upd.mutate({ id, afterPhotos })} /></div>
            </section>
            {r.resolution ? (
              <section className="rounded-lg bg-success-50 p-4 text-[14px]">
                <h2 className="mb-1 font-semibold text-success-800">ما تم إنجازه</h2>
                <p className="whitespace-pre-line">{r.resolution}</p>
              </section>
            ) : null}
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">قطع الغيار المصروفة</h2>
              {!d.parts.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا قطع مصروفة.</p> : (
                <FinTable dense head={<tr><th>الصنف</th><th className="text-end">الكمية</th><th className="text-end">التكلفة</th></tr>}>
                  {d.parts.map((p) => <tr key={p.id}><td>{p.item}</td><td className={num}>{formatNumber(p.quantity, prefs.digits)} {p.unit}</td><td className={num}>{money.fmt(p.valueMinor, false)}</td></tr>)}
                </FinTable>
              )}
            </section>
          </div>
          <aside className="space-y-3 rounded-lg bg-card p-4 text-[13px] shadow-card">
            {d.canManage && open ? (
              <>
                <Field label="الفني المسؤول"><Select value={r.assigneeId ?? "NONE"} onChange={(a) => upd.mutate({ id, assigneeId: a === "NONE" ? null : a })} options={[{ value: "NONE", label: "غير مسند" }, ...d.options.technicians.map((t) => ({ value: t.id, label: t.name }))]} /></Field>
                <Field label="الأولوية"><Select value={r.priority} onChange={(p) => upd.mutate({ id, priority: p as "LOW" })} options={options(PRIORITY)} /></Field>
                <Field label="موعد الإنجاز"><Input type="date" defaultValue={r.dueDate ? new Date(r.dueDate).toISOString().slice(0, 10) : ""} onBlur={(e) => upd.mutate({ id, dueDate: e.target.value || null })} /></Field>
                <Button size="sm" variant="ghost" className="text-danger-700" onClick={() => upd.mutate({ id, status: "CANCELLED" })}>إلغاء البلاغ</Button>
              </>
            ) : (
              <dl className="space-y-2">
                <div><dt className="text-fg-3">الفني</dt><dd>{r.assignee ?? "غير مسند بعد"}</dd></div>
                <div><dt className="text-fg-3">موعد الإنجاز</dt><dd>{r.dueDate ? fmtDate(r.dueDate) : "—"}</dd></div>
              </dl>
            )}
            <dl className="space-y-2 border-t border-line pt-3">
              <div><dt className="text-fg-3">المبلّغ</dt><dd>{r.reporter ?? "صيانة دورية"} · {fmtDate(r.createdAt)}</dd></div>
              {r.asset ? <div><dt className="text-fg-3">الأصل</dt><dd><Link className="underline" href={`/finance/assets/${r.asset.id}`}>{r.asset.name} ({r.asset.tag})</Link></dd></div> : null}
              {r.bus ? <div><dt className="text-fg-3">الحافلة</dt><dd><Link className="underline" href={`/transport/buses/${r.bus.id}`}>{r.bus.code} — {r.bus.plateNumber}</Link></dd></div> : null}
              <div><dt className="text-fg-3">تكلفة القطع</dt><dd className="tabular">{money.fmt(r.partsCostMinor)}</dd></div>
              <div><dt className="text-fg-3">التكلفة الخارجية</dt><dd className="tabular">{money.fmt(r.externalCostMinor)}{r.vendorName ? ` — ${r.vendorName}` : ""}</dd></div>
              {r.journalEntryId ? <div><Link className="underline" href={`/finance/accounting/entries/${r.journalEntryId}`}>قيد التكلفة</Link></div> : null}
              {r.completedAt ? <div><dt className="text-fg-3">اكتمل</dt><dd>{fmtDate(r.completedAt)}</dd></div> : null}
            </dl>
          </aside>
        </div>
      )}
      {dialog === "parts" && d ? <PartsDialog id={id} warehouses={d.options.warehouses} onClose={() => setDialog(null)} /> : null}
      {dialog === "complete" ? <CompleteDialog id={id} onClose={() => setDialog(null)} /> : null}
    </ModuleShell>
  );
}

function PartsDialog({ id, warehouses, onClose }: { id: string; warehouses: Array<{ id: string; name: string }>; onClose: () => void }) {
  const utils = trpc.useUtils();
  const money = useMoney();
  const items = trpc.inventory.items.useQuery({}, { retry: false });
  const [v, setV] = useState({ warehouseId: warehouses[0]?.id ?? "", itemId: "", quantity: 1 });
  const m = trpc.maintenance.parts.useMutation({ onSuccess: (r) => (toast.success(`صُرفت القطع بتكلفة ${money.fmt(r.totalCostMinor)}`), void utils.maintenance.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const list = (items.data?.items ?? []).filter((i) => i.isActive && (i.levels.find((l) => l.warehouseId === v.warehouseId)?.quantity ?? 0) > 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="صرف قطع غيار للبلاغ" description="تُخرج من المخزون بالمتوسط المرجّح وتُقيد مصروف صيانة.">
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="المستودع" className="col-span-2"><Select value={v.warehouseId || undefined} onChange={(warehouseId) => setV({ ...v, warehouseId, itemId: "" })} options={warehouses.map((w) => ({ value: w.id, label: w.name }))} /></Field>
          <Field label="الصنف"><Select value={v.itemId || undefined} onChange={(itemId) => setV({ ...v, itemId })} options={list.map((i) => ({ value: i.id, label: `${i.name} (${i.levels.find((l) => l.warehouseId === v.warehouseId)?.quantity ?? 0})` }))} /></Field>
          <Field label="الكمية"><Input type="number" min={1} value={v.quantity} onChange={(e) => setV({ ...v, quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} /></Field>
          {items.error ? <p className="col-span-2 text-[12px] text-fg-3">عرض المخزون يتطلب صلاحية المخزون.</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.itemId} onClick={() => m.mutate({ id, warehouseId: v.warehouseId, lines: [{ itemId: v.itemId, quantity: v.quantity }] })}>صرف</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompleteDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const q = trpc.maintenance.get.useQuery({ id });
  const [v, setV] = useState({ resolution: "", photos: null as Array<{ url: string; name?: string }> | null, cost: 0 as number | null, paidFrom: "CASH" as "CASH" | "BANK" | "AP", bankAccountId: "", vendorName: "" });
  const m = trpc.maintenance.complete.useMutation({ onSuccess: (r) => (toast.success(`اكتمل البلاغ — التكلفة ${r.costText}`), r.warning && toast.error(r.warning), void utils.maintenance.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  const photos = v.photos ?? ((d?.request.afterPhotos as Array<{ url: string }>) ?? []);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="إكمال البلاغ" description="التكلفة الخارجية تُرحَّل مصروف صيانة على مركز تكلفة الفرع مع رقابة الموازنة، ويُشعَر المبلّغ." width={560}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="ما تم إنجازه" className="col-span-2"><Textarea rows={3} value={v.resolution} onChange={(e) => setV({ ...v, resolution: e.target.value })} autoFocus /></Field>
          <div className="col-span-2"><PhotoList label="صور بعد الإصلاح" value={photos} onChange={(p) => setV({ ...v, photos: p })} /></div>
          <Field label="تكلفة خارجية (فني/مقاول)" hint="صفر إن نُفذ داخلياً"><MoneyInput value={v.cost} onChange={(cost) => setV({ ...v, cost })} /></Field>
          {v.cost ? (
            <>
              <Field label="السداد"><Select value={v.paidFrom} onChange={(p) => setV({ ...v, paidFrom: p as "CASH" })} options={[{ value: "CASH", label: "من الصندوق" }, { value: "BANK", label: "من البنك" }, { value: "AP", label: "آجل على المورد" }]} /></Field>
              {v.paidFrom === "BANK" ? <Field label="الحساب البنكي"><Select value={v.bankAccountId || undefined} onChange={(bankAccountId) => setV({ ...v, bankAccountId })} options={(d?.options.banks ?? []).map((b) => ({ value: b.id, label: b.name }))} /></Field> : null}
              <Field label="الجهة المنفذة"><Input value={v.vendorName} onChange={(e) => setV({ ...v, vendorName: e.target.value })} /></Field>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.resolution.trim().length < 3 || (v.paidFrom === "BANK" && Boolean(v.cost) && !v.bankAccountId)} onClick={() => m.mutate({ id, resolution: v.resolution, afterPhotos: photos, externalCostMinor: v.cost ?? 0, paidFrom: v.cost ? v.paidFrom : null, bankAccountId: v.bankAccountId || null, vendorName: v.vendorName || null })}>إكمال</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// الصيانة الدورية
// ---------------------------------------------------------------------

type Sched = RouterOutputs["maintenance"]["schedules"][number];

export function SchedulesPage() {
  const q = trpc.maintenance.schedules.useQuery();
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [editing, setEditing] = useState<Sched | "new" | null>(null);
  const run = trpc.maintenance.runSchedules.useMutation({ onSuccess: (r) => (toast.success(r.created ? `أُنشئ ${r.created} بلاغاً دورياً` : "لا صيانة مستحقة اليوم"), void utils.maintenance.invalidate()), onError: (e) => toast.error(e.message) });
  return (
    <ModuleShell nav={opsNav("maintenance")} tabs={MAINT_TABS} wide actions={<><Button size="sm" icon={<RefreshCw className="size-3.5" />} loading={run.isPending} onClick={() => run.mutate()}>توليد المستحق الآن</Button><Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>جدول صيانة</Button></>}>
      <p className="mb-3 text-[13px] text-fg-3">تتولّد بلاغات الصيانة الدورية تلقائياً يومياً (المهمة المجدولة)، ولا يتكرر البلاغ ما دام السابق مفتوحاً.</p>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الصيانة الدورية" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={6} />
      ) : !q.data.length ? (
        <EmptyState illustration="calendar" title="لا جداول صيانة دورية" description="مثال: فحص المكيفات كل ٩٠ يوماً، أو طفايات الحريق كل ٣٠ يوماً." action={<Button variant="primary" onClick={() => setEditing("new")}>جدول صيانة</Button>} />
      ) : (
        <FinTable head={<tr><th>المهمة</th><th>التصنيف</th><th>الموقع</th><th>الفني</th><th className="text-end">التكرار</th><th>الاستحقاق التالي</th><th /></tr>}>
          {q.data.map((s) => (
            <tr key={s.id}>
              <td className="font-medium">{s.title}{!s.isActive ? <Tag color="gray" className="ms-2">موقوف</Tag> : null}</td>
              <td><Tag color={MAINT_CATEGORY[s.category]?.color}>{MAINT_CATEGORY[s.category]?.label}</Tag></td>
              <td>{s.room ?? "—"}</td>
              <td>{s.assignee ?? "—"}</td>
              <td className={num}>كل {formatNumber(s.frequencyDays, prefs.digits)} يوماً</td>
              <td className={cn("tabular", s.due && "font-semibold text-danger-700")}>{fmtDate(s.nextDue)}</td>
              <td className="text-end"><Button size="xs" variant="ghost" onClick={() => setEditing(s)}>تعديل</Button></td>
            </tr>
          ))}
        </FinTable>
      )}
      {editing ? <ScheduleDialog s={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </ModuleShell>
  );
}

function ScheduleDialog({ s, onClose }: { s: Sched | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const lk = trpc.ops.lookups.useQuery();
  const [v, setV] = useState({ title: s?.title ?? "", description: s?.description ?? "", category: s?.category ?? "HVAC", roomId: s?.roomId ?? "", assigneeId: s?.assigneeId ?? "", frequencyDays: s?.frequencyDays ?? 90, nextDue: s ? new Date(s.nextDue).toISOString().slice(0, 10) : today, isActive: s?.isActive ?? true });
  const m = trpc.maintenance.saveSchedule.useMutation({ onSuccess: () => (toast.success("حُفظ الجدول"), void utils.maintenance.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={s ? "تعديل صيانة دورية" : "صيانة دورية جديدة"} width={560}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="المهمة" className="col-span-2"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="فحص وتنظيف فلاتر المكيفات" /></Field>
          <Field label="التصنيف"><Select value={v.category} onChange={(category) => setV({ ...v, category })} options={options(MAINT_CATEGORY)} /></Field>
          <Field label="القاعة"><Select value={v.roomId || "NONE"} onChange={(r) => setV({ ...v, roomId: r === "NONE" ? "" : r })} options={[{ value: "NONE", label: "عام" }, ...(lk.data?.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))]} /></Field>
          <Field label="الفني"><Select value={v.assigneeId || "NONE"} onChange={(a) => setV({ ...v, assigneeId: a === "NONE" ? "" : a })} options={[{ value: "NONE", label: "يُسند لاحقاً" }, ...(lk.data?.users ?? []).map((u) => ({ value: u.id, label: u.name }))]} /></Field>
          <Field label="كل (يوم)"><Input type="number" min={1} max={730} value={v.frequencyDays} onChange={(e) => setV({ ...v, frequencyDays: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} /></Field>
          <Field label="الاستحقاق التالي"><Input type="date" value={v.nextDue} onChange={(e) => setV({ ...v, nextDue: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]"><Checkbox checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} /> نشط</label>
          <Field label="تعليمات" className="col-span-2"><Textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.title.trim().length < 3} onClick={() => m.mutate({ id: s?.id ?? null, title: v.title, description: v.description || null, category: v.category as "HVAC", roomId: v.roomId || null, assigneeId: v.assigneeId || null, frequencyDays: v.frequencyDays, nextDue: v.nextDue, isActive: v.isActive })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// حجز المرافق
// ---------------------------------------------------------------------

export function BookingsPage() {
  const { nav, tabs } = useMaintNav();
  const today = useToday();
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const [week, setWeek] = useState(weekStartOf(today));
  const [roomId, setRoomId] = useState("");
  const all = trpc.maintenance.bookings.useQuery({ weekStart: week });
  const room = roomId || all.data?.rooms.find((r) => ["LAB", "GYM", "HALL", "COMPUTER", "LIBRARY"].includes(r.kind))?.id || all.data?.rooms[0]?.id || "";
  const q = trpc.maintenance.bookings.useQuery({ weekStart: week, roomId: room }, { enabled: Boolean(room) });
  const [creating, setCreating] = useState<string | null>(null);
  const cancel = trpc.maintenance.cancelBooking.useMutation({ onSuccess: () => (toast.success("أُلغي الحجز"), void utils.maintenance.bookings.invalidate()), onError: (e) => toast.error(e.message) });
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const d = q.data;
  return (
    <ModuleShell nav={nav} tabs={tabs} wide>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select className="w-56" value={room || undefined} onChange={setRoomId} options={(all.data?.rooms ?? []).map((r) => ({ value: r.id, label: r.name }))} />
        <Button size="icon-sm" variant="ghost" aria-label="الأسبوع السابق" onClick={() => setWeek(addDays(week, -7))}><ChevronRight className="size-4" /></Button>
        <span className="text-[14px] font-medium tabular">{days[0]} — {days[6]}</span>
        <Button size="icon-sm" variant="ghost" aria-label="الأسبوع التالي" onClick={() => setWeek(addDays(week, 7))}><ChevronLeft className="size-4" /></Button>
        <Button size="sm" variant="ghost" onClick={() => setWeek(weekStartOf(today))}>هذا الأسبوع</Button>
      </div>
      {all.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الحجوزات" description={all.error.message} />
      ) : !all.data ? (
        <SkeletonLines lines={8} />
      ) : !all.data.rooms.length ? (
        <EmptyState illustration="calendar" title="لا قاعات معرفة" description="تُعرّف القاعات من الشؤون الأكاديمية ← الصفوف والفصول." />
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
          {days.map((day, i) => {
            const items = [...(d?.lessons ?? []).filter((l) => l.date === day).map((l) => ({ ...l, kind: "lesson" as const, id: `${day}-${l.startTime}` })), ...(d?.bookings ?? []).filter((b) => new Date(b.date).toISOString().slice(0, 10) === day).map((b) => ({ ...b, kind: "booking" as const }))].sort((a, b) => a.startTime.localeCompare(b.startTime));
            return (
              <section key={day} className={cn("min-h-[160px] rounded-lg bg-card p-2 shadow-card", day === today && "ring-2 ring-navy-600")}>
                <h3 className="mb-2 flex items-center justify-between px-1 text-[12px] font-semibold">
                  <span>{WEEK[i]}</span>
                  <span className="text-fg-3 tabular">{formatNumber(Number(day.slice(8)), prefs.digits)}</span>
                </h3>
                <div className="space-y-1.5">
                  {items.map((it) => (
                    <div key={it.id} className={cn("rounded-md px-2 py-1.5 text-[11px]", it.kind === "lesson" ? "bg-hover text-fg-3" : "bg-[var(--tag-teal-bg)] text-[var(--tag-teal-fg)]")}>
                      <span className="block tabular">{it.startTime}–{it.endTime}</span>
                      <span className="block truncate font-medium">{it.title}</span>
                      {it.kind === "booking" && (it.mine || d?.canManage) ? <button type="button" className="mt-0.5 text-[10px] underline" onClick={() => cancel.mutate({ id: it.id })}>إلغاء</button> : null}
                    </div>
                  ))}
                </div>
                {day >= today ? <Button size="xs" variant="ghost" className="mt-2 w-full" icon={<Plus className="size-3" />} onClick={() => setCreating(day)}>حجز</Button> : null}
              </section>
            );
          })}
        </div>
      )}
      <p className="mt-3 flex items-center gap-2 text-[12px] text-fg-3"><CalendarClock className="size-3.5" />الحصص المجدولة في القاعة تظهر رمادية ولا يمكن الحجز فوقها.</p>
      {creating && room ? <BookDialog roomId={room} date={creating} onClose={() => setCreating(null)} /> : null}
    </ModuleShell>
  );
}

function BookDialog({ roomId, date, onClose }: { roomId: string; date: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ title: "", startTime: "13:00", endTime: "14:00", notes: "" });
  const m = trpc.maintenance.book.useMutation({ onSuccess: () => (toast.success("تم الحجز"), void utils.maintenance.bookings.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`حجز ${date}`} width={420}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الغرض" className="col-span-2"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="تجربة عملية، اجتماع أولياء أمور…" autoFocus /></Field>
          <Field label="من"><Input type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} /></Field>
          <Field label="إلى"><Input type="time" value={v.endTime} onChange={(e) => setV({ ...v, endTime: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.title.trim().length < 2 || v.startTime >= v.endTime} onClick={() => m.mutate({ roomId, title: v.title, date, startTime: v.startTime, endTime: v.endTime, notes: v.notes || null })}>حجز</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { Board };
