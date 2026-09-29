"use client";
/**
 * المواصلات: الخطوط بمحطاتها على خريطة تخطيطية، تسكين الطلاب (مع فاتورة النقل)، الحافلات وسجلها وتنبيهات وثائقها،
 * رحلات اليوم للمشرفة (تحديث المحطة يُشعر أولياء أمور المحطة التالية)، وصفحة «حافلة أبنائي».
 */
import { AlertTriangle, Bus, CheckCircle2, Fuel, MapPin, Play, Plus, Route as RouteIcon, Trash2, UserPlus, Users } from "lucide-react";
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
import { StudentPicker, type PickedStudent } from "@/components/students/student-picker";
import { FinTable, MoneyInput, num, PercentInput, useFmtDate, useMoney, useToday } from "@/components/finance/common";
import { BUS_LOG, BUS_STATUS, DIRECTION, ModuleSettingsForm, opsNav, options, TRANSPORT_TABS } from "./common";

const nav = () => opsNav("transport");
type Stop = { id?: string | null; name: string; lat?: number | null; lng?: number | null; morningTime?: string | null; afternoonTime?: string | null; order?: number };

/** خريطة تخطيطية للمحطات من إحداثياتها (دون خدمة خرائط خارجية) */
export function StopsMap({ stops, current, highlight }: { stops: Stop[]; current?: string | null; highlight?: string | null }) {
  const pts = stops.filter((s) => s.lat !== null && s.lat !== undefined && s.lng !== null && s.lng !== undefined);
  if (pts.length < 2) {
    return (
      <ol className="flex flex-wrap items-center gap-2 text-[13px]">
        {stops.map((s, i) => (
          <li key={s.id ?? i} className="flex items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-1", s.id === current ? "bg-navy-700 text-on-primary" : s.id === highlight ? "bg-[var(--tag-gold-bg)] text-[var(--tag-gold-fg)]" : "bg-hover")}>{s.name}</span>
            {i < stops.length - 1 ? <span className="text-fg-4">←</span> : null}
          </li>
        ))}
      </ol>
    );
  }
  const lats = pts.map((p) => p.lat!);
  const lngs = pts.map((p) => p.lng!);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const W = 600;
  const H = 240;
  const pad = 30;
  const x = (lng: number) => pad + ((lng - minLng) / (maxLng - minLng || 1)) * (W - 2 * pad);
  const y = (lat: number) => H - pad - ((lat - minLat) / (maxLat - minLat || 1)) * (H - 2 * pad);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full rounded-lg bg-hover" role="img" aria-label="خريطة المحطات">
      <polyline fill="none" stroke="var(--tag-navy-dot)" strokeWidth={3} strokeDasharray="6 5" points={pts.map((p) => `${x(p.lng!)},${y(p.lat!)}`).join(" ")} />
      {pts.map((p, i) => (
        <g key={p.id ?? i}>
          <circle cx={x(p.lng!)} cy={y(p.lat!)} r={p.id === current ? 10 : 7} fill={p.id === current ? "var(--tag-navy-dot)" : p.id === highlight ? "var(--tag-gold-dot)" : "var(--bg-card, #fff)"} stroke="var(--tag-navy-dot)" strokeWidth={2} />
          <text x={x(p.lng!)} y={y(p.lat!) - 14} textAnchor="middle" fontSize={12} fill="currentColor">{p.name}</text>
        </g>
      ))}
    </svg>
  );
}

export function RoutesPage() {
  const q = trpc.transport.routes.useQuery();
  const money = useMoney();
  const prefs = usePrefs();
  const [editing, setEditing] = useState(false);
  const d = q.data;
  const riders = d?.reduce((s, r) => s + r.riders, 0) ?? 0;
  const seats = d?.reduce((s, r) => s + r.capacity, 0) ?? 0;
  return (
    <ModuleShell nav={nav()} tabs={TRANSPORT_TABS} wide actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing(true)}>خط جديد</Button>}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الخطوط" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="الخطوط" value={d.length} icon={<RouteIcon className="size-4" />} />
            <StatCard label="الطلاب المسكنون" value={riders} icon={<Users className="size-4" />} />
            <StatCard label="نسبة الإشغال" value={seats ? Math.round((riders * 100) / seats) : null} format={(n) => `${formatNumber(n, prefs.digits)}٪`} compact icon={<Bus className="size-4" />} />
            <StatCard label="خطوط ممتلئة" value={d.filter((r) => r.full).length} tone={d.some((r) => r.full) ? "warning" : undefined} icon={<AlertTriangle className="size-4" />} />
          </section>
          {!d.length ? (
            <EmptyState illustration="table" title="لا خطوط" description="أضف الحافلات أولاً ثم الخطوط بمحطاتها وأوقاتها ورسومها." action={<Button variant="primary" onClick={() => setEditing(true)}>خط جديد</Button>} />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {d.map((r) => (
                <Link key={r.id} href={`/transport/routes/${r.id}`} className="rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-card-hover">
                  <div className="flex items-center justify-between">
                    <span className="text-[15px] font-semibold">{r.name}</span>
                    {!r.isActive ? <Tag color="gray">موقوف</Tag> : r.full ? <Tag color="orange">ممتلئ</Tag> : <Tag color="green">متاح</Tag>}
                  </div>
                  <p className="mt-1 text-[12px] text-fg-3">{r.code} · {r.bus ? `حافلة ${r.bus.code} (${r.bus.plateNumber})` : "بلا حافلة"}</p>
                  <p className="mt-2 truncate text-[13px] text-fg-2">{r.stops.map((s) => s.name).join(" ← ") || "لا محطات"}</p>
                  <div className="mt-3 flex items-center justify-between text-[13px]">
                    <span className="tabular">{formatNumber(r.riders, prefs.digits)} / {formatNumber(r.capacity, prefs.digits)} مقعداً</span>
                    <span className="tabular text-fg-2">{money.fmt(r.annualFeeMinor)} سنوياً</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-hover"><div className="h-full rounded-full" style={{ width: `${Math.min(100, r.capacity ? (r.riders * 100) / r.capacity : 0)}%`, background: r.full ? "var(--tag-orange-dot)" : "var(--tag-green-dot)" }} /></div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      {editing ? <RouteDialog onClose={() => setEditing(false)} /> : null}
    </ModuleShell>
  );
}

function RouteDialog({ route, onClose }: { route?: RouterOutputs["transport"]["route"]["route"]; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const buses = trpc.transport.buses.useQuery();
  const [v, setV] = useState({ code: route?.code ?? "", name: route?.name ?? "", busId: route?.busId ?? "", annualFeeMinor: route?.annualFeeMinor ?? null as number | null, isActive: route?.isActive ?? true, stops: (route?.stops ?? [{ name: "", morningTime: "06:30", afternoonTime: "13:30" }]) as Stop[] });
  const m = trpc.transport.saveRoute.useMutation({ onSuccess: (r) => (toast.success("حُفظ الخط"), void utils.transport.invalidate(), onClose(), !route && router.push(`/transport/routes/${r.id}`)), onError: (e) => toast.error(e.message) });
  const setStop = (i: number, patch: Partial<Stop>) => setV({ ...v, stops: v.stops.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const numOrNull = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={route ? `تعديل ${route.name}` : "خط جديد"} description="المحطات بالترتيب في رحلة الذهاب (العودة بالترتيب العكسي). الإحداثيات اختيارية لرسم الخريطة." width={860}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-2 sm:grid-cols-4">
          <Field label="الرمز"><Input dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field>
          <Field label="الاسم"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="الحافلة"><Select value={v.busId || "NONE"} onChange={(b) => setV({ ...v, busId: b === "NONE" ? "" : b })} options={[{ value: "NONE", label: "لاحقاً" }, ...(buses.data ?? []).filter((b) => b.status !== "RETIRED").map((b) => ({ value: b.id, label: `${b.code} — ${b.plateNumber} (${b.capacity})` }))]} /></Field>
          <Field label="الرسوم السنوية"><MoneyInput value={v.annualFeeMinor} onChange={(annualFeeMinor) => setV({ ...v, annualFeeMinor })} /></Field>
        </div>
        <div className="max-h-[45vh] space-y-2 overflow-y-auto px-5 pb-2">
          {v.stops.map((s, i) => (
            <div key={s.id ?? i} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[28px_1fr_100px_100px_110px_110px_32px]">
              <span className="pb-2 text-center text-[13px] text-fg-3 tabular">{i + 1}</span>
              <Field label="المحطة"><Input value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} /></Field>
              <Field label="الذهاب"><Input type="time" value={s.morningTime ?? ""} onChange={(e) => setStop(i, { morningTime: e.target.value || null })} /></Field>
              <Field label="العودة"><Input type="time" value={s.afternoonTime ?? ""} onChange={(e) => setStop(i, { afternoonTime: e.target.value || null })} /></Field>
              <Field label="خط العرض"><Input dir="ltr" value={s.lat ?? ""} onChange={(e) => setStop(i, { lat: numOrNull(e.target.value) })} /></Field>
              <Field label="خط الطول"><Input dir="ltr" value={s.lng ?? ""} onChange={(e) => setStop(i, { lng: numOrNull(e.target.value) })} /></Field>
              <Button variant="ghost" size="sm" aria-label="حذف المحطة" onClick={() => setV({ ...v, stops: v.stops.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setV({ ...v, stops: [...v.stops, { name: "", morningTime: null, afternoonTime: null }] })}>محطة</Button>
          <label className="ms-4 inline-flex items-center gap-2 text-[14px]"><Checkbox checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} /> الخط نشط</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.code.trim() || v.name.trim().length < 2 || v.stops.some((s) => !s.name.trim())} onClick={() => m.mutate({ id: route?.id ?? null, code: v.code, name: v.name, busId: v.busId || null, annualFeeMinor: v.annualFeeMinor ?? 0, isActive: v.isActive, stops: v.stops.map((s) => ({ id: s.id ?? null, name: s.name, lat: s.lat ?? null, lng: s.lng ?? null, morningTime: s.morningTime || null, afternoonTime: s.afternoonTime || null })) })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RouteDetail({ id }: { id: string }) {
  const q = trpc.transport.route.useQuery({ id });
  const utils = trpc.useUtils();
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const today = useToday();
  const [dialog, setDialog] = useState<"edit" | "assign" | null>(null);
  const [ending, setEnding] = useState<string | null>(null);
  const end = trpc.transport.endAssignment.useMutation({ onSuccess: () => (toast.success("أُنهي التسكين"), setEnding(null), void utils.transport.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={TRANSPORT_TABS} wide title={d?.route.name} crumbs={d ? [{ title: "الخطوط", href: "/transport" }, { title: d.route.name }] : undefined}
      actions={d?.canEdit ? (<><Button size="sm" onClick={() => setDialog("edit")}>تعديل الخط</Button><Button size="sm" variant="primary" icon={<UserPlus className="size-3.5" />} onClick={() => setDialog("assign")}>تسكين طالب</Button></>) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الخط" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          <header className="mb-4">
            <h1 className="text-[24px] font-bold">{d.route.name}</h1>
            <p className="mt-1 text-[13px] text-fg-3">{d.route.code} · {d.route.bus ? <Link className="underline" href={`/transport/buses/${d.route.bus.id}`}>حافلة {d.route.bus.code} ({d.route.bus.plateNumber}) · {formatNumber(d.route.bus.capacity, prefs.digits)} مقعداً</Link> : "بلا حافلة"} · {money.fmt(d.route.annualFeeMinor)} سنوياً</p>
          </header>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <StopsMap stops={d.route.stops} current={d.trips.find((t) => t.status === "STARTED")?.currentStopId ?? null} />
              <h2 className="mb-2 mt-5 text-[15px] font-semibold">الطلاب ({formatNumber(d.riders.length, prefs.digits)})</h2>
              {!d.riders.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا طلاب مسكنون.</p> : (
                <FinTable dense head={<tr><th>الطالب</th><th>الصف</th><th>المحطة</th><th>الاتجاه</th><th>ولي الأمر</th><th>منذ</th><th /></tr>}>
                  {d.riders.map((r) => (
                    <tr key={r.assignmentId}>
                      <td><Link className="font-medium hover:underline" href={`/students/${r.studentId}`}>{r.name}</Link></td>
                      <td>{r.grade}</td>
                      <td>{r.stop ?? "—"}</td>
                      <td><Tag color={DIRECTION[r.direction]?.color}>{DIRECTION[r.direction]?.label}</Tag></td>
                      <td>{r.guardian ?? "—"} <span className="tabular text-fg-3" dir="ltr">{r.phone ?? ""}</span></td>
                      <td className="tabular">{fmtDate(r.startDate)}</td>
                      <td className="whitespace-nowrap text-end">
                        {r.invoiceId ? <Link className="me-2 text-[12px] underline" href={`/finance/invoices/${r.invoiceId}`}>الفاتورة</Link> : null}
                        {d.canEdit ? <Button size="xs" variant="ghost" onClick={() => setEnding(r.assignmentId)}>إنهاء</Button> : null}
                      </td>
                    </tr>
                  ))}
                </FinTable>
              )}
            </section>
            <aside className="rounded-lg bg-card p-4 shadow-card">
              <h2 className="mb-3 text-[14px] font-semibold">المحطات</h2>
              <ol className="space-y-2 text-[13px]">
                {d.route.stops.map((s, i) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-hover text-[11px] tabular">{formatNumber(i + 1, prefs.digits)}</span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="tabular text-fg-3">{s.morningTime ?? "—"} / {s.afternoonTime ?? "—"}</span>
                  </li>
                ))}
              </ol>
            </aside>
          </div>
          {dialog === "edit" ? <RouteDialog route={d.route} onClose={() => setDialog(null)} /> : null}
          {dialog === "assign" ? <AssignDialog route={d.route} onClose={() => setDialog(null)} /> : null}
          <ConfirmDialog open={Boolean(ending)} onOpenChange={(o) => !o && setEnding(null)} title="إنهاء تسكين الطالب؟" description="تسوية الرسوم (إشعار دائن) تتم من الفاتورة في المالية حسب سياسة الاسترداد." confirmLabel="إنهاء" loading={end.isPending} onConfirm={() => end.mutate({ id: ending!, endDate: today })} />
        </>
      )}
    </ModuleShell>
  );
}

function AssignDialog({ route, onClose }: { route: RouterOutputs["transport"]["route"]["route"]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const money = useMoney();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [v, setV] = useState({ stopId: route.stops[0]?.id ?? "", direction: "BOTH" as "BOTH" | "MORNING" | "AFTERNOON", startDate: today, invoice: true });
  const waiting = trpc.transport.unassigned.useQuery({ q: null });
  const m = trpc.transport.assign.useMutation({ onSuccess: (r) => (toast.success(r.feeText ? `سُكّن الطالب وصدرت فاتورة ${r.feeText}` : "سُكّن الطالب"), void utils.transport.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`تسكين على ${route.name}`} description={`الرسوم السنوية ${money.fmt(route.annualFeeMinor)}؛ تُحتسب بنسبة الأشهر المتبقية والاتجاه حسب إعدادات النقل.`} width={560}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الطالب" className="col-span-2"><StudentPicker value={student} onChange={setStudent} /></Field>
          {!student && waiting.data?.length ? (
            <div className="col-span-2">
              <span className="mb-1 block text-[12px] text-fg-3">طلاب اختاروا حافلة المدرسة ولم يُسكّنوا:</span>
              <div className="flex flex-wrap gap-1.5">
                {waiting.data.slice(0, 12).map((s) => <button key={s.id} type="button" className="rounded-full bg-hover px-2.5 py-1 text-[12px]" onClick={() => setStudent({ id: s.id, fullName: s.fullName, academicNumber: s.academicNumber, grade: s.grade })}>{s.fullName}</button>)}
              </div>
            </div>
          ) : null}
          <Field label="المحطة"><Select value={v.stopId || undefined} onChange={(stopId) => setV({ ...v, stopId })} options={route.stops.map((s) => ({ value: s.id, label: s.name }))} /></Field>
          <Field label="الاتجاه"><Select value={v.direction} onChange={(d) => setV({ ...v, direction: d as "BOTH" })} options={options(DIRECTION)} /></Field>
          <Field label="من تاريخ"><Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]"><Checkbox checked={v.invoice} onChange={(invoice) => setV({ ...v, invoice })} /> إصدار فاتورة النقل</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!student} onClick={() => m.mutate({ studentId: student!.id, routeId: route.id, stopId: v.stopId || null, direction: v.direction, startDate: v.startDate, invoice: v.invoice })}>تسكين</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// الحافلات
// ---------------------------------------------------------------------

type BusRow = RouterOutputs["transport"]["buses"][number];

export function BusesPage() {
  const q = trpc.transport.buses.useQuery();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [editing, setEditing] = useState<BusRow | "new" | null>(null);
  return (
    <ModuleShell nav={nav()} tabs={TRANSPORT_TABS} wide actions={<Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>حافلة جديدة</Button>}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الحافلات" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={8} />
      ) : !q.data.length ? (
        <EmptyState illustration="table" title="لا حافلات" action={<Button variant="primary" onClick={() => setEditing("new")}>حافلة جديدة</Button>} />
      ) : (
        <FinTable head={<tr><th>الحافلة</th><th>اللوحة</th><th>السائق</th><th>المشرفة</th><th className="text-end">الركاب/السعة</th><th>الوثائق</th><th>الحالة</th></tr>}>
          {q.data.map((b) => (
            <tr key={b.id}>
              <td><Link className="font-medium hover:underline" href={`/transport/buses/${b.id}`}>{b.code}</Link> <span className="text-fg-3">{b.model ?? ""}</span></td>
              <td className="tabular">{b.plateNumber}</td>
              <td>{b.driver ?? "—"}</td>
              <td>{b.supervisor ?? "—"}</td>
              <td className={cn(num, b.riders >= b.capacity && "text-danger-700")}>{formatNumber(b.riders, prefs.digits)} / {formatNumber(b.capacity, prefs.digits)}</td>
              <td>{b.expiring.length ? b.expiring.map((e) => <Tag key={e.kind} color="orange" className="me-1">{e.kind} {fmtDate(e.date)}</Tag>) : <Tag color="green">سارية</Tag>}</td>
              <td><Tag color={BUS_STATUS[b.status]?.color}>{BUS_STATUS[b.status]?.label}</Tag></td>
            </tr>
          ))}
        </FinTable>
      )}
      {editing ? <BusDialog bus={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </ModuleShell>
  );
}

function BusDialog({ bus, onClose }: { bus: (Partial<BusRow> & { id: string; code: string; plateNumber: string; capacity: number }) | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const lk = trpc.ops.lookups.useQuery();
  const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const [v, setV] = useState({ code: bus?.code ?? "", plateNumber: bus?.plateNumber ?? "", model: bus?.model ?? "", year: bus?.year ?? null as number | null, capacity: bus?.capacity ?? 30, branchId: bus?.branchId ?? "", driverId: bus?.driverId ?? "", supervisorId: bus?.supervisorId ?? "", insuranceExpiry: iso(bus?.insuranceExpiry), licenseExpiry: iso(bus?.licenseExpiry), inspectionExpiry: iso(bus?.inspectionExpiry), status: bus?.status ?? "ACTIVE", notes: bus?.notes ?? "" });
  const m = trpc.transport.saveBus.useMutation({ onSuccess: () => (toast.success("حُفظت الحافلة"), void utils.transport.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const emps = (lk.data?.employees ?? []).map((e) => ({ value: e.id, label: e.fullName }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={bus ? `تعديل ${bus.code}` : "حافلة جديدة"} width={640}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4 sm:grid-cols-3">
          <Field label="الرمز"><Input dir="ltr" value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field>
          <Field label="اللوحة"><Input value={v.plateNumber} onChange={(e) => setV({ ...v, plateNumber: e.target.value })} /></Field>
          <Field label="السعة"><Input type="number" min={1} value={v.capacity} onChange={(e) => setV({ ...v, capacity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })} /></Field>
          <Field label="الطراز"><Input value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} /></Field>
          <Field label="سنة الصنع"><Input type="number" value={v.year ?? ""} onChange={(e) => setV({ ...v, year: e.target.value ? Math.trunc(Number(e.target.value)) : null })} /></Field>
          <Field label="الحالة"><Select value={v.status} onChange={(status) => setV({ ...v, status })} options={options(BUS_STATUS)} /></Field>
          <Field label="السائق"><Select value={v.driverId || "NONE"} onChange={(x) => setV({ ...v, driverId: x === "NONE" ? "" : x })} options={[{ value: "NONE", label: "—" }, ...emps]} /></Field>
          <Field label="المشرفة"><Select value={v.supervisorId || "NONE"} onChange={(x) => setV({ ...v, supervisorId: x === "NONE" ? "" : x })} options={[{ value: "NONE", label: "—" }, ...emps]} /></Field>
          <Field label="الفرع"><Select value={v.branchId || "NONE"} onChange={(x) => setV({ ...v, branchId: x === "NONE" ? "" : x })} options={[{ value: "NONE", label: "كل الفروع" }, ...(lk.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></Field>
          <Field label="انتهاء التأمين"><Input type="date" value={v.insuranceExpiry} onChange={(e) => setV({ ...v, insuranceExpiry: e.target.value })} /></Field>
          <Field label="انتهاء الرخصة"><Input type="date" value={v.licenseExpiry} onChange={(e) => setV({ ...v, licenseExpiry: e.target.value })} /></Field>
          <Field label="الفحص الدوري"><Input type="date" value={v.inspectionExpiry} onChange={(e) => setV({ ...v, inspectionExpiry: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.code.trim() || v.plateNumber.trim().length < 2} onClick={() => m.mutate({ id: bus?.id ?? null, code: v.code, plateNumber: v.plateNumber, model: v.model || null, year: v.year, capacity: v.capacity, branchId: v.branchId || null, driverId: v.driverId || null, supervisorId: v.supervisorId || null, insuranceExpiry: v.insuranceExpiry || null, licenseExpiry: v.licenseExpiry || null, inspectionExpiry: v.inspectionExpiry || null, status: v.status as "ACTIVE", notes: v.notes || null })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function BusDetail({ id }: { id: string }) {
  const q = trpc.transport.bus.useQuery({ id });
  const money = useMoney();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [dialog, setDialog] = useState<"edit" | "log" | null>(null);
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={TRANSPORT_TABS} wide title={d ? `حافلة ${d.bus.code}` : undefined} crumbs={d ? [{ title: "الحافلات", href: "/transport/buses" }, { title: d.bus.code }] : undefined}
      actions={d?.canEdit ? (<><Button size="sm" onClick={() => setDialog("edit")}>تعديل</Button><Button size="sm" variant="primary" icon={<Fuel className="size-3.5" />} onClick={() => setDialog("log")}>تسجيل في السجل</Button></>) : null}
    >
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الحافلة" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : (
        <>
          <header className="mb-4">
            <h1 className="text-[24px] font-bold">{d.bus.code} <span className="text-fg-3">{d.bus.plateNumber}</span></h1>
            <p className="mt-1 flex flex-wrap gap-2 text-[13px] text-fg-3">
              <Tag color={BUS_STATUS[d.bus.status]?.color}>{BUS_STATUS[d.bus.status]?.label}</Tag>
              {d.bus.model ?? ""} {d.bus.year ?? ""} · {formatNumber(d.bus.capacity, prefs.digits)} مقعداً · السائق {d.bus.driver?.fullName ?? "—"} · المشرفة {d.bus.supervisor?.fullName ?? "—"}
            </p>
          </header>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="التأمين" value={null} format={() => ""} icon={<CheckCircle2 className="size-4" />} hint={d.bus.insuranceExpiry ? `حتى ${fmtDate(d.bus.insuranceExpiry)}` : "غير مسجل"} />
            <StatCard label="الرخصة" value={null} icon={<CheckCircle2 className="size-4" />} hint={d.bus.licenseExpiry ? `حتى ${fmtDate(d.bus.licenseExpiry)}` : "غير مسجلة"} />
            <StatCard label="الفحص الدوري" value={null} icon={<CheckCircle2 className="size-4" />} hint={d.bus.inspectionExpiry ? `حتى ${fmtDate(d.bus.inspectionExpiry)}` : "غير مسجل"} />
            <StatCard label="تكاليف السجل" value={d.totalCostMinor} format={money.whole} compact icon={<Fuel className="size-4" />} />
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <h2 className="mb-2 text-[15px] font-semibold">سجل الحافلة</h2>
              {!d.bus.logs.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا سجلات.</p> : (
                <FinTable dense head={<tr><th>التاريخ</th><th>النوع</th><th>الوصف</th><th className="text-end">العداد</th><th className="text-end">التكلفة</th></tr>}>
                  {d.bus.logs.map((l) => (
                    <tr key={l.id}>
                      <td className="tabular">{fmtDate(l.date)}</td>
                      <td><Tag color={BUS_LOG[l.kind]?.color}>{BUS_LOG[l.kind]?.label}</Tag></td>
                      <td>{l.description}{l.journalEntryId ? <Link className="ms-2 text-[12px] underline" href={`/finance/accounting/entries/${l.journalEntryId}`}>القيد</Link> : null}</td>
                      <td className={num}>{l.odometer ? formatNumber(l.odometer, prefs.digits) : "—"}</td>
                      <td className={num}>{money.fmt(l.costMinor, false)}</td>
                    </tr>
                  ))}
                </FinTable>
              )}
            </section>
            <aside className="space-y-4">
              <div className="rounded-lg bg-card p-4 shadow-card">
                <h2 className="mb-2 text-[14px] font-semibold">الخطوط</h2>
                {d.bus.routes.length ? d.bus.routes.map((r) => <Link key={r.id} className="block text-[13px] underline" href={`/transport/routes/${r.id}`}>{r.name}</Link>) : <p className="text-[13px] text-fg-3">لا خطوط</p>}
              </div>
              <div className="rounded-lg bg-card p-4 shadow-card">
                <h2 className="mb-2 text-[14px] font-semibold">بلاغات الصيانة</h2>
                {d.maintenance.length ? d.maintenance.map((r) => <Link key={r.id} className="block text-[13px] underline" href={`/maintenance/${r.id}`}>{r.title}</Link>) : <p className="text-[13px] text-fg-3">لا بلاغات</p>}
              </div>
            </aside>
          </div>
          {dialog === "edit" ? <BusDialog bus={{ ...d.bus, driver: d.bus.driver?.fullName ?? null, supervisor: d.bus.supervisor?.fullName ?? null } as never} onClose={() => setDialog(null)} /> : null}
          {dialog === "log" ? <LogDialog busId={id} banks={d.banks} onClose={() => setDialog(null)} /> : null}
        </>
      )}
    </ModuleShell>
  );
}

function LogDialog({ busId, banks, onClose }: { busId: string; banks: Array<{ id: string; name: string }>; onClose: () => void }) {
  const utils = trpc.useUtils();
  const today = useToday();
  const [v, setV] = useState({ kind: "FUEL", date: today, odometer: "", cost: null as number | null, description: "", paidFrom: "CASH" as "CASH" | "BANK" | "AP", bankAccountId: banks[0]?.id ?? "" });
  const m = trpc.transport.addLog.useMutation({ onSuccess: (r) => (toast.success("سُجل وقُيدت التكلفة"), r.warning && toast.error(r.warning), void utils.transport.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تسجيل في سجل الحافلة" description="التكلفة تُرحَّل مصروف «نقل ووقود» على مركز تكلفة الفرع." width={520}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="النوع"><Select value={v.kind} onChange={(kind) => setV({ ...v, kind })} options={options(BUS_LOG)} /></Field>
          <Field label="التاريخ"><Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
          <Field label="الوصف" className="col-span-2"><Textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <Field label="قراءة العداد (كم)"><Input type="number" value={v.odometer} onChange={(e) => setV({ ...v, odometer: e.target.value })} /></Field>
          <Field label="التكلفة"><MoneyInput value={v.cost} onChange={(cost) => setV({ ...v, cost })} /></Field>
          {v.cost ? <Field label="السداد"><Select value={v.paidFrom} onChange={(p) => setV({ ...v, paidFrom: p as "CASH" })} options={[{ value: "CASH", label: "الصندوق" }, { value: "BANK", label: "البنك" }, { value: "AP", label: "آجل" }]} /></Field> : null}
          {v.cost && v.paidFrom === "BANK" ? <Field label="الحساب البنكي"><Select value={v.bankAccountId || undefined} onChange={(bankAccountId) => setV({ ...v, bankAccountId })} options={banks.map((b) => ({ value: b.id, label: b.name }))} /></Field> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.description.trim().length < 2} onClick={() => m.mutate({ busId, kind: v.kind as "FUEL", date: v.date, odometer: v.odometer ? Math.trunc(Number(v.odometer)) : null, costMinor: v.cost ?? 0, description: v.description, paidFrom: v.cost ? v.paidFrom : null, bankAccountId: v.paidFrom === "BANK" ? v.bankAccountId : null })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// رحلات اليوم (المشرفة/السائق/المسؤول)
// ---------------------------------------------------------------------

export function TripsPage({ standalone }: { standalone?: boolean }) {
  const q = trpc.transport.myTrips.useQuery();
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const start = trpc.transport.startTrip.useMutation({ onSuccess: () => void utils.transport.myTrips.invalidate(), onError: (e) => toast.error(e.message) });
  const arrive = trpc.transport.arrive.useMutation({ onSuccess: (r) => (toast.success(r.next ? `أُشعر ${formatNumber(r.notified, prefs.digits)} من أولياء أمور محطة «${r.next}»` : "آخر محطة"), void utils.transport.myTrips.invalidate()), onError: (e) => toast.error(e.message) });
  const board = trpc.transport.board.useMutation({ onSuccess: () => void utils.transport.myTrips.invalidate(), onError: (e) => toast.error(e.message) });
  const complete = trpc.transport.completeTrip.useMutation({ onSuccess: () => (toast.success("انتهت الرحلة"), void utils.transport.myTrips.invalidate()), onError: (e) => toast.error(e.message) });
  const body = q.error ? (
    <EmptyState illustration="lock" title="لا يمكن عرض الرحلات" description={q.error.message} />
  ) : !q.data ? (
    <SkeletonLines lines={8} />
  ) : !q.data.length ? (
    <EmptyState illustration="calendar" title="لا خطوط مسندة إليك" description="تظهر هنا خطوط الحافلة التي أنت سائقها أو مشرفتها." />
  ) : (
    <div className="space-y-5">
      {q.data.map((r) => (
        <section key={r.id} className="rounded-lg bg-card p-4 shadow-card">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[16px] font-semibold">{r.name} <span className="text-[13px] font-normal text-fg-3">{r.bus ? `${r.bus.code} · ${r.bus.plateNumber}` : ""}</span></h2>
            <div className="flex gap-2">
              {(["MORNING", "AFTERNOON"] as const).map((shift) => {
                const t = r.trips.find((x) => x.shift === shift);
                return t ? <Tag key={shift} color={t.status === "COMPLETED" ? "green" : "navy"}>{shift === "MORNING" ? "الذهاب" : "العودة"}: {t.status === "COMPLETED" ? "انتهت" : "جارية"}</Tag> : <Button key={shift} size="sm" icon={<Play className="size-3.5" />} loading={start.isPending} onClick={() => start.mutate({ routeId: r.id, shift })}>بدء {shift === "MORNING" ? "الذهاب" : "العودة"}</Button>;
              })}
            </div>
          </header>
          {r.trips.filter((t) => t.status === "STARTED").map((t) => {
            const ordered = t.shift === "MORNING" ? r.stops : [...r.stops].reverse();
            const boarded = (t.boarded as string[]) ?? [];
            return (
              <div key={t.id}>
                <StopsMap stops={ordered} current={t.currentStopId} />
                <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-[13px] font-semibold">المحطات — اضغط عند الوصول</h3>
                    <ol className="space-y-1.5">
                      {ordered.map((s) => (
                        <li key={s.id}>
                          <Button size="sm" variant={t.currentStopId === s.id ? "primary" : "secondary"} className="w-full justify-between" icon={<MapPin className="size-3.5" />} loading={arrive.isPending && arrive.variables?.stopId === s.id} onClick={() => arrive.mutate({ tripId: t.id, stopId: s.id })}>
                            {s.name} <span className="tabular opacity-70">{t.shift === "MORNING" ? s.morningTime : s.afternoonTime}</span>
                          </Button>
                        </li>
                      ))}
                    </ol>
                  </div>
                  <div>
                    <h3 className="mb-2 text-[13px] font-semibold">الركاب ({formatNumber(boarded.length, prefs.digits)}/{formatNumber(r.riders.filter((x) => x.direction === "BOTH" || x.direction === t.shift).length, prefs.digits)})</h3>
                    <ul className="space-y-1 text-[13px]">
                      {r.riders.filter((x) => x.direction === "BOTH" || x.direction === t.shift).map((x) => (
                        <li key={x.studentId}>
                          <label className="flex items-center gap-2"><Checkbox checked={boarded.includes(x.studentId)} onChange={(b) => board.mutate({ tripId: t.id, studentId: x.studentId, boarded: b })} />{x.name}<span className="text-fg-3">· {r.stops.find((s) => s.id === x.stopId)?.name ?? "—"}</span></label>
                        </li>
                      ))}
                    </ul>
                    <Button className="mt-3" variant="primary" size="sm" loading={complete.isPending} onClick={() => complete.mutate({ tripId: t.id })}>إنهاء الرحلة</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
  return standalone ? <ModuleShell nav={opsNav("my-transport")}>{body}</ModuleShell> : <ModuleShell nav={nav()} tabs={TRANSPORT_TABS} wide>{body}</ModuleShell>;
}

/** حافلة أبنائي (ولي الأمر/الطالب)؛ السائق والمشرفة يرون رحلاتهم */
export function FamilyTransportPage() {
  const q = trpc.transport.family.useQuery();
  const trips = trpc.transport.myTrips.useQuery(undefined, { retry: false });
  const prefs = usePrefs();
  if (trips.data?.length && !q.data?.length) return <TripsPage standalone />;
  return (
    <ModuleShell nav={opsNav("my-transport")}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض المواصلات" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={8} />
      ) : !q.data.length ? (
        <EmptyState title="لا أبناء مرتبطون بحسابك" />
      ) : (
        <div className="space-y-5">
          {q.data.map((k) => (
            <section key={k.studentId} className="rounded-lg bg-card p-4 shadow-card">
              <h2 className="mb-2 text-[16px] font-semibold">{k.name}</h2>
              {!k.assignment ? (
                <p className="text-[14px] text-fg-3">غير مسجل في النقل المدرسي. للتسجيل تواصل مع مسؤول النقل.</p>
              ) : (
                <>
                  <p className="mb-3 text-[13px] text-fg-2">
                    {k.assignment.route} · <Tag color={DIRECTION[k.assignment.direction]?.color}>{DIRECTION[k.assignment.direction]?.label}</Tag> · محطة <b>{k.assignment.stop?.name ?? "—"}</b>
                    {k.assignment.stop ? ` (الذهاب ${k.assignment.stop.morningTime ?? "—"} · العودة ${k.assignment.stop.afternoonTime ?? "—"})` : ""}
                  </p>
                  <StopsMap stops={k.assignment.stops} current={k.assignment.stops.find((s) => s.name === k.assignment!.trips.find((t) => t.status === "STARTED")?.currentStop)?.id ?? null} highlight={k.assignment.stop?.id ?? null} />
                  <div className="mt-3 flex flex-wrap gap-3 text-[13px]">
                    {k.assignment.bus ? <span>الحافلة {k.assignment.bus.code} ({k.assignment.bus.plateNumber})</span> : null}
                    {k.assignment.driver ? <span>· السائق {k.assignment.driver}</span> : null}
                    {k.assignment.supervisor ? <span>· المشرفة {k.assignment.supervisor.fullName} <span className="tabular" dir="ltr">{k.assignment.supervisor.phone ?? ""}</span></span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {k.assignment.trips.length ? k.assignment.trips.map((t) => (
                      <Tag key={t.shift} color={t.status === "COMPLETED" ? "green" : "navy"}>
                        {t.shift === "MORNING" ? "الذهاب" : "العودة"}: {t.status === "COMPLETED" ? "وصلت" : t.currentStop ? `عند ${t.currentStop}` : "انطلقت"}{t.boarded ? " · صعد" : ""}
                      </Tag>
                    )) : <span className="text-[13px] text-fg-3">لم تنطلق رحلة اليوم بعد. يصلك إشعار عند اقتراب الحافلة من محطتك.</span>}
                  </div>
                </>
              )}
            </section>
          ))}
        </div>
      )}
      <p className="sr-only">{prefs.digits}</p>
    </ModuleShell>
  );
}

export function TransportSettingsPage() {
  return (
    <ModuleShell nav={nav()} tabs={TRANSPORT_TABS}>
      <ModuleSettingsForm<{ autoInvoice: boolean; prorate: boolean; oneWayBp: number; notifyApproach: boolean; expiryAlertDays: number }> settingsKey="transport" title="النقل المدرسي" description="فوترة الرسوم عند التسكين، والإشعارات، وتنبيهات وثائق الحافلات.">
        {(v, set, canEdit) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-[14px]"><Checkbox disabled={!canEdit} checked={v.autoInvoice} onChange={(autoInvoice) => set({ autoInvoice })} /> إصدار فاتورة النقل تلقائياً عند التسكين</label>
            <label className="flex items-center gap-2 text-[14px]"><Checkbox disabled={!canEdit} checked={v.prorate} onChange={(prorate) => set({ prorate })} /> احتساب الرسوم بنسبة الأشهر المتبقية من العام</label>
            <Field label="رسوم الاتجاه الواحد من الرسوم الكاملة ٪"><PercentInput disabled={!canEdit} bp={v.oneWayBp} onChange={(oneWayBp) => set({ oneWayBp })} /></Field>
            <Field label="التنبيه قبل انتهاء وثائق الحافلة (يوم)"><Input disabled={!canEdit} type="number" value={v.expiryAlertDays} onChange={(e) => set({ expiryAlertDays: Math.max(7, Math.min(180, Math.trunc(Number(e.target.value) || 7))) })} /></Field>
            <label className="flex items-center gap-2 text-[14px]"><Checkbox disabled={!canEdit} checked={v.notifyApproach} onChange={(notifyApproach) => set({ notifyApproach })} /> إشعار أولياء الأمور عند اقتراب الحافلة</label>
          </div>
        )}
      </ModuleSettingsForm>
    </ModuleShell>
  );
}
