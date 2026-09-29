"use client";
/**
 * الأمن والسلامة: سجل الزوار (تسجيل، بطاقة QR، مسح الدخول والخروج)، استلام الطلاب (التحقق من المستلم ومطابقة الهوية)،
 * الحوادث، تمارين الإخلاء وخططه؛ والعيادة المدرسية (زيارات مشفّرة، أدوية، إشعار ولي الأمر)؛ وصفحة «المفوضون بالاستلام».
 */
import { formatTime } from "@/lib/dates";
import { AlertTriangle, BadgeCheck, ClipboardList, DoorOpen, FileText, HeartPulse, LogIn, LogOut, Pill, Plus, Printer, QrCode, ScanLine, ShieldAlert, Siren, Stethoscope, Thermometer, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { StudentPicker, type PickedStudent } from "@/components/students/student-picker";
import { FinTable, num, printPage, useFmtDate, useToday } from "@/components/finance/common";
import { CLINIC_OUTCOME, DRILL_KIND, INCIDENT_KIND, INCIDENT_STATUS, opsNav, options, PhotoList, SAFETY_TABS, SEVERITY } from "./common";

const nav = () => opsNav("safety");

function useQr(text: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    let alive = true;
    void import("qrcode").then((QR) => QR.toDataURL(text, { margin: 0, width: 180, errorCorrectionLevel: "M" })).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [text]);
  return url;
}

// بتوقيت المدرسة لا توقيت المتصفح
const time = (d: Date | string | null | undefined) => (d ? formatTime(d) : "—");

// ---------------------------------------------------------------------
// الزوار
// ---------------------------------------------------------------------

export function VisitorsPage() {
  const today = useToday();
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const q = trpc.safety.visitors.useQuery({ date, q: search || null });
  const utils = trpc.useUtils();
  const [dialog, setDialog] = useState<"new" | "scan" | null>(null);
  const [badge, setBadge] = useState<RouterOutputs["safety"]["register"] | null>(null);
  const out = trpc.safety.checkOut.useMutation({ onSuccess: () => (toast.success("سُجل الخروج"), void utils.safety.visitors.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={SAFETY_TABS} wide actions={d?.canEdit ? (<><Button size="sm" icon={<ScanLine className="size-3.5" />} onClick={() => setDialog("scan")}>مسح بطاقة</Button><Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDialog("new")}>تسجيل زائر</Button></>) : null}>
      {d ? (
        <section className="mb-4 grid grid-cols-3 gap-3">
          <StatCard label="داخل المدرسة الآن" value={d.stats.inside} icon={<Users className="size-4" />} tone={d.stats.inside ? "warning" : undefined} />
          <StatCard label="زوار اليوم" value={d.stats.today} icon={<LogIn className="size-4" />} />
          <StatCard label="مسجلون مسبقاً بانتظار الوصول" value={d.stats.expected} icon={<ClipboardList className="size-4" />} />
        </section>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input type="date" className="w-44" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <Input className="w-60" placeholder="الاسم أو الجوال أو رمز البطاقة" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الزوار" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : !d.visitors.length ? (
        <EmptyState illustration="inbox" title="لا زوار في هذا اليوم" action={d.canEdit ? <Button variant="primary" onClick={() => setDialog("new")}>تسجيل زائر</Button> : undefined} />
      ) : (
        <FinTable head={<tr><th>الزائر</th><th>الغرض</th><th>المضيف</th><th>الدخول</th><th>الخروج</th><th>البطاقة</th><th /></tr>}>
          {d.visitors.map((v) => (
            <tr key={v.id}>
              <td><span className="font-medium">{v.fullName}</span> <span className="text-fg-3">{v.company ?? ""}</span>{v.idLast4 ? <span className="ms-1 text-[11px] text-fg-3 tabular">هوية •••{v.idLast4}</span> : null}</td>
              <td>{v.purpose}</td>
              <td>{v.hostName ?? "—"}</td>
              <td className="tabular">{v.checkInAt ? time(v.checkInAt) : <Tag color="gold">متوقع {v.expectedAt ? time(v.expectedAt) : ""}</Tag>}</td>
              <td className="tabular">{v.checkOutAt ? time(v.checkOutAt) : v.inside ? <Tag color="orange">بالداخل</Tag> : "—"}</td>
              <td className="tabular" dir="ltr">{v.badgeCode}</td>
              <td className="whitespace-nowrap text-end">
                <Button size="xs" variant="ghost" icon={<QrCode className="size-3.5" />} onClick={() => setBadge(v as never)}>البطاقة</Button>
                {v.inside && d.canEdit ? <Button size="xs" variant="ghost" icon={<LogOut className="size-3.5" />} onClick={() => out.mutate({ id: v.id })}>خروج</Button> : null}
              </td>
            </tr>
          ))}
        </FinTable>
      )}
      {dialog === "new" ? <VisitorDialog onClose={() => setDialog(null)} onDone={(v) => (setDialog(null), setBadge(v))} /> : null}
      {dialog === "scan" ? <ScanDialog onClose={() => setDialog(null)} /> : null}
      {badge ? <BadgeDialog v={badge} onClose={() => setBadge(null)} /> : null}
    </ModuleShell>
  );
}

function VisitorDialog({ onClose, onDone }: { onClose: () => void; onDone: (v: RouterOutputs["safety"]["register"]) => void }) {
  const utils = trpc.useUtils();
  const lk = trpc.ops.lookups.useQuery();
  const [v, setV] = useState({ fullName: "", idNumber: "", phone: "", company: "", purpose: "", hostUserId: "", vehiclePlate: "", checkInNow: true, expectedAt: "" });
  const m = trpc.safety.register.useMutation({ onSuccess: (r) => (toast.success(v.checkInNow ? "سُجل دخول الزائر" : "سُجل الزائر مسبقاً"), void utils.safety.visitors.invalidate(), onDone(r)), onError: (e) => toast.error(e.message) });
  const host = lk.data?.users.find((u) => u.id === v.hostUserId);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تسجيل زائر" description="رقم الهوية يُحفظ مشفراً بآخر ٤ أرقام للعرض. يُشعَر المضيف بوصول زائره." width={600}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الاسم الكامل"><Input value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} autoFocus /></Field>
          <Field label="رقم الهوية"><Input dir="ltr" value={v.idNumber} onChange={(e) => setV({ ...v, idNumber: e.target.value })} /></Field>
          <Field label="الجوال"><Input dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
          <Field label="الجهة"><Input value={v.company} onChange={(e) => setV({ ...v, company: e.target.value })} /></Field>
          <Field label="الغرض" className="col-span-2"><Input value={v.purpose} onChange={(e) => setV({ ...v, purpose: e.target.value })} placeholder="مراجعة شؤون الطلاب، صيانة، مقابلة…" /></Field>
          <Field label="المضيف"><Select value={v.hostUserId || "NONE"} onChange={(h) => setV({ ...v, hostUserId: h === "NONE" ? "" : h })} options={[{ value: "NONE", label: "—" }, ...(lk.data?.users ?? []).map((u) => ({ value: u.id, label: u.name }))]} /></Field>
          <Field label="لوحة السيارة"><Input value={v.vehiclePlate} onChange={(e) => setV({ ...v, vehiclePlate: e.target.value })} /></Field>
          <label className="flex items-center gap-2 text-[14px]"><Checkbox checked={v.checkInNow} onChange={(checkInNow) => setV({ ...v, checkInNow })} /> دخل الآن</label>
          {!v.checkInNow ? <Field label="الموعد المتوقع"><Input type="datetime-local" value={v.expectedAt} onChange={(e) => setV({ ...v, expectedAt: e.target.value })} /></Field> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.fullName.trim().length < 3 || !v.purpose.trim()} onClick={() => m.mutate({ fullName: v.fullName, idNumber: v.idNumber || null, phone: v.phone || null, company: v.company || null, purpose: v.purpose, hostName: host?.name ?? null, hostUserId: v.hostUserId || null, vehiclePlate: v.vehiclePlate || null, checkInNow: v.checkInNow, expectedAt: v.expectedAt ? new Date(v.expectedAt).toISOString() : null })}>تسجيل وطباعة البطاقة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BadgeDialog({ v, onClose }: { v: { fullName: string; badgeCode: string; purpose: string; hostName: string | null; company: string | null }; onClose: () => void }) {
  const qr = useQr(v.badgeCode);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="بطاقة الزائر" width={360}>
        <div className="print-area mx-5 mb-4 rounded-lg border border-line p-4 text-center">
          <p className="text-[12px] text-fg-3">زائر</p>
          <p className="text-[18px] font-bold">{v.fullName}</p>
          {v.company ? <p className="text-[13px] text-fg-3">{v.company}</p> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {qr ? <img src={qr} alt={`رمز البطاقة ${v.badgeCode}`} className="mx-auto my-3 size-40" /> : <div className="mx-auto my-3 size-40 animate-pulse rounded bg-hover" />}
          <p className="tabular text-[15px] font-semibold tracking-widest" dir="ltr">{v.badgeCode}</p>
          <p className="mt-1 text-[12px] text-fg-3">{v.purpose}{v.hostName ? ` · المضيف ${v.hostName}` : ""}</p>
        </div>
        <DialogFooter>
          <Button icon={<Printer className="size-3.5" />} onClick={printPage}>طباعة</Button>
          <Button variant="primary" onClick={onClose}>تم</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScanDialog({ onClose }: { onClose: () => void }) {
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);
  const m = trpc.safety.scan.useMutation({ onSuccess: (r) => (setLast({ ok: true, text: `${r.action === "IN" ? "دخول" : "خروج"}: ${r.visitor.fullName}` }), setCode(""), void utils.safety.visitors.invalidate()), onError: (e) => (setLast({ ok: false, text: e.message }), setCode("")) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="مسح بطاقة الزائر" description="مسح البطاقة عند البوابة يسجل الدخول، والمسح التالي يسجل الخروج." width={420}>
        <div className="px-5 pb-4">
          <Input dir="ltr" autoFocus value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && code.trim() && m.mutate({ code: code.trim() })} placeholder="رمز البطاقة" aria-label="رمز البطاقة" />
          {last ? <p className={cn("mt-3 rounded-md px-3 py-2 text-[14px]", last.ok ? "bg-success-50 text-success-800" : "bg-danger-50 text-danger-700")}>{last.text}</p> : null}
        </div>
        <DialogFooter><Button variant="primary" onClick={onClose}>إغلاق</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// استلام الطلاب
// ---------------------------------------------------------------------

export function PickupsPage() {
  const today = useToday();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const log = trpc.safety.pickups.useQuery({ date: today });
  const prefs = usePrefs();
  return (
    <ModuleShell nav={nav()} tabs={SAFETY_TABS} wide>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        <section>
          <div className="mb-4 rounded-lg bg-card p-4 shadow-card">
            <Field label="الطالب المراد استلامه"><StudentPicker value={student} onChange={setStudent} /></Field>
          </div>
          {student ? <PickupDesk key={student.id} studentId={student.id} onDone={() => setStudent(null)} /> : <EmptyState compact illustration="search" title="ابحث عن الطالب" description="يظهر أولياء الأمور والمفوضون المصرح لهم بصورهم للتحقق قبل التسليم." />}
        </section>
        <aside>
          <h2 className="mb-2 text-[15px] font-semibold">سجل اليوم {log.data ? `(${formatNumber(log.data.pickups.length, prefs.digits)})` : ""}</h2>
          {!log.data ? <SkeletonLines lines={5} /> : !log.data.pickups.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا استلام مسجل اليوم.</p> : (
            <ul className="space-y-2">
              {log.data.pickups.map((p) => (
                <li key={p.id} className="rounded-lg bg-card px-3 py-2 text-[13px] shadow-card">
                  <span className="flex items-center justify-between"><b>{p.student}</b><span className="tabular text-fg-3">{time(p.at)}</span></span>
                  <span className="block text-fg-2">{p.pickedByName} ({p.relation}) {p.early ? <Tag size="sm" color="orange">مبكر: {p.reason}</Tag> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </ModuleShell>
  );
}

function PickupDesk({ studentId, onDone }: { studentId: string; onDone: () => void }) {
  const q = trpc.safety.pickupInfo.useQuery({ studentId });
  const utils = trpc.useUtils();
  const [who, setWho] = useState<{ kind: "G" | "A"; id: string } | null>(null);
  const [v, setV] = useState({ verification: "ID_CHECK" as "ID_CHECK" | "PHOTO" | "CODE", idNumber: "", early: false, reason: "" });
  const m = trpc.safety.recordPickup.useMutation({ onSuccess: () => (toast.success("سُجل الاستلام وأُشعر أولياء الأمور"), void utils.safety.invalidate(), onDone()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض بيانات الاستلام" description={q.error.message} />;
  if (!d) return <SkeletonLines lines={6} />;
  const picked = who?.kind === "A" ? d.authorized.find((a) => a.id === who.id) : null;
  return (
    <div className="rounded-lg bg-card p-4 shadow-card">
      <header className="mb-3">
        <h2 className="text-[18px] font-bold">{d.student.fullName}</h2>
        <p className="text-[13px] text-fg-3">{d.student.grade.name}{d.student.section ? ` / ${d.student.section.name}` : ""} · {d.student.academicNumber}</p>
      </header>
      <h3 className="mb-2 text-[13px] font-semibold">من يستلم؟</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {d.guardians.map((g) => (
          <button key={g.id} type="button" disabled={!g.canPickup} onClick={() => setWho({ kind: "G", id: g.id })} className={cn("rounded-md p-3 text-start text-[13px] shadow-[0_0_0_1px_var(--border)] disabled:opacity-50", who?.id === g.id && "ring-2 ring-navy-600")}>
            <span className="block font-medium">{g.name}</span>
            <span className="text-fg-3">ولي أمر · {g.phone}{g.idLast4 ? ` · هوية •••${g.idLast4}` : ""}{!g.canPickup ? " · غير مصرح بالاستلام" : ""}</span>
          </button>
        ))}
        {d.authorized.map((a) => (
          <button key={a.id} type="button" disabled={a.expired} onClick={() => setWho({ kind: "A", id: a.id })} className={cn("flex gap-3 rounded-md p-3 text-start text-[13px] shadow-[0_0_0_1px_var(--border)] disabled:opacity-50", who?.id === a.id && "ring-2 ring-navy-600")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {a.photoUrl ? <img src={a.photoUrl} alt={a.name} className="size-12 rounded object-cover" /> : <span className="grid size-12 place-items-center rounded bg-hover"><UserCheck className="size-5 text-fg-3" /></span>}
            <span>
              <span className="block font-medium">{a.name}</span>
              <span className="text-fg-3">مفوَّض ({a.relation}){a.idLast4 ? ` · هوية •••${a.idLast4}` : ""}{a.expired ? " · منتهي التفويض" : ""}</span>
            </span>
          </button>
        ))}
      </div>
      {!d.guardians.length && !d.authorized.length ? <p className="text-[13px] text-danger-700">لا أحد مصرح له باستلام هذا الطالب.</p> : null}
      {who && d.canRecord ? (
        <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="طريقة التحقق"><Select value={v.verification} onChange={(x) => setV({ ...v, verification: x as "ID_CHECK" })} options={[{ value: "ID_CHECK", label: "مطابقة الهوية" }, { value: "PHOTO", label: "مطابقة الصورة" }, { value: "CODE", label: "رمز الاستلام" }]} /></Field>
          {v.verification === "ID_CHECK" && picked ? <Field label="رقم هوية المستلم" hint="يُطابق ببصمة الرقم المسجل"><Input dir="ltr" value={v.idNumber} onChange={(e) => setV({ ...v, idNumber: e.target.value })} /></Field> : null}
          <label className="flex items-center gap-2 text-[14px]"><Checkbox checked={v.early} onChange={(early) => setV({ ...v, early })} /> استلام مبكر (أثناء اليوم الدراسي)</label>
          {v.early ? <Field label="السبب"><Input value={v.reason} onChange={(e) => setV({ ...v, reason: e.target.value })} /></Field> : null}
          <Button className="sm:col-span-2" variant="primary" icon={<BadgeCheck className="size-4" />} loading={m.isPending} onClick={() => m.mutate({ studentId, guardianId: who.kind === "G" ? who.id : null, authorizedPickupId: who.kind === "A" ? who.id : null, verification: v.verification, idNumber: v.idNumber || null, early: v.early, reason: v.reason || null })}>تسليم الطالب وتسجيل الاستلام</Button>
        </div>
      ) : null}
    </div>
  );
}

/** المفوضون بالاستلام (ولي الأمر) */
export function MyPickupsPage() {
  const kids = trpc.pos.myWallets.useQuery();
  const [sel, setSel] = useState<string | null>(null);
  const current = sel ?? kids.data?.[0]?.studentId ?? null;
  return (
    <ModuleShell nav={opsNav("my-pickups")}>
      {kids.error ? <EmptyState illustration="lock" title="تعذر العرض" description={kids.error.message} /> : !kids.data ? <SkeletonLines lines={6} /> : !kids.data.length ? <EmptyState title="لا أبناء مرتبطون بحسابك" /> : (
        <>
          {kids.data.length > 1 ? <Segmented value={current!} onChange={setSel} options={kids.data.map((k) => ({ value: k.studentId, label: k.name }))} /> : null}
          {current ? <AuthorizedList key={current} studentId={current} /> : null}
        </>
      )}
    </ModuleShell>
  );
}

function AuthorizedList({ studentId }: { studentId: string }) {
  const q = trpc.safety.pickupInfo.useQuery({ studentId });
  const utils = trpc.useUtils();
  const fmtDate = useFmtDate();
  const [adding, setAdding] = useState(false);
  const [v, setV] = useState({ name: "", relation: "", idNumber: "", phone: "", validUntil: "", photo: [] as Array<{ url: string }> });
  const save = trpc.safety.saveAuthorized.useMutation({ onSuccess: () => (toast.success("أُضيف المفوَّض"), setAdding(false), void utils.safety.pickupInfo.invalidate()), onError: (e) => toast.error(e.message) });
  const off = trpc.safety.saveAuthorized.useMutation({ onSuccess: () => (toast.success("أُلغي التفويض"), void utils.safety.pickupInfo.invalidate()), onError: (e) => toast.error(e.message) });
  const d = q.data;
  return (
    <div className="mt-4">
      <p className="mb-3 text-[13px] text-fg-3">يسلّم الأمن طفلك فقط لأولياء الأمور المسجلين أو لمن تفوّضه هنا، بعد مطابقة الهوية أو الصورة. يصلك إشعار عند كل استلام.</p>
      {!d ? <SkeletonLines lines={4} /> : (
        <div className="space-y-2">
          {d.authorized.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg bg-card px-4 py-3 shadow-card">
              <span className="text-[14px]"><b>{a.name}</b> <span className="text-fg-3">({a.relation}){a.validUntil ? ` · حتى ${fmtDate(a.validUntil)}` : ""}</span></span>
              <Button size="xs" variant="ghost" onClick={() => off.mutate({ id: a.id, studentId, name: a.name, relation: a.relation, isActive: false })}>إلغاء التفويض</Button>
            </div>
          ))}
          {!d.authorized.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا مفوضين؛ الاستلام لأولياء الأمور فقط.</p> : null}
          {d.recent.length ? null : null}
          <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAdding(true)}>تفويض شخص</Button>
        </div>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title="تفويض باستلام الطالب" width={520}>
          <div className="grid grid-cols-2 gap-3 px-5 pb-4">
            <Field label="الاسم"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
            <Field label="الصلة"><Input value={v.relation} onChange={(e) => setV({ ...v, relation: e.target.value })} placeholder="عم، خال، سائق الأسرة…" /></Field>
            <Field label="رقم الهوية" hint="يُحفظ مشفراً"><Input dir="ltr" value={v.idNumber} onChange={(e) => setV({ ...v, idNumber: e.target.value })} /></Field>
            <Field label="الجوال"><Input dir="ltr" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
            <Field label="ساري حتى"><Input type="date" value={v.validUntil} onChange={(e) => setV({ ...v, validUntil: e.target.value })} /></Field>
            <div className="col-span-2"><PhotoList label="صورة المفوَّض" value={v.photo} onChange={(photo) => setV({ ...v, photo: photo.slice(-1) })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdding(false)}>إلغاء</Button>
            <Button variant="primary" loading={save.isPending} disabled={v.name.trim().length < 3 || v.relation.trim().length < 2} onClick={() => save.mutate({ studentId, name: v.name, relation: v.relation, idNumber: v.idNumber || null, phone: v.phone || null, photoUrl: v.photo[0]?.url ?? null, validUntil: v.validUntil || null, isActive: true })}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------
// الحوادث
// ---------------------------------------------------------------------

type Incident = RouterOutputs["safety"]["incidents"]["incidents"][number];

export function IncidentsPage() {
  const [status, setStatus] = useState("");
  const q = trpc.safety.incidents.useQuery({ status: status || null });
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [editing, setEditing] = useState<Incident | "new" | null>(null);
  const d = q.data;
  return (
    <ModuleShell nav={nav()} tabs={SAFETY_TABS} wide actions={d?.canEdit ? <Button size="sm" variant="primary" icon={<Siren className="size-3.5" />} onClick={() => setEditing("new")}>تسجيل حادث</Button> : null}>
      <Segmented value={status || "ALL"} onChange={(s) => setStatus(s === "ALL" ? "" : s)} options={[{ value: "ALL", label: "الكل" }, ...options(INCIDENT_STATUS)]} />
      <div className="mt-3">
        {q.error ? (
          <EmptyState illustration="lock" title="لا يمكن عرض الحوادث" description={q.error.message} />
        ) : !d ? (
          <SkeletonLines lines={8} />
        ) : !d.incidents.length ? (
          <EmptyState illustration="inbox" title="لا حوادث مسجلة" />
        ) : (
          <FinTable head={<tr><th>الرقم</th><th>التاريخ</th><th>النوع</th><th>الخطورة</th><th>الموقع</th><th>الوصف</th><th>الحالة</th></tr>}>
            {d.incidents.map((i) => (
              <tr key={i.id} className="cursor-pointer" onClick={() => setEditing(i)}>
                <td className="tabular">{formatNumber(i.number, prefs.digits)}</td>
                <td className="tabular">{fmtDate(i.occurredAt)}</td>
                <td><Tag color={INCIDENT_KIND[i.kind]?.color}>{INCIDENT_KIND[i.kind]?.label}</Tag></td>
                <td><Tag color={SEVERITY[i.severity]?.color}>{SEVERITY[i.severity]?.label}</Tag></td>
                <td>{i.location}</td>
                <td className="max-w-[320px] truncate">{i.description}</td>
                <td><Tag color={INCIDENT_STATUS[i.status]?.color}>{INCIDENT_STATUS[i.status]?.label}</Tag></td>
              </tr>
            ))}
          </FinTable>
        )}
      </div>
      {editing ? <IncidentDialog incident={editing === "new" ? null : editing} canClose={Boolean(d?.canClose)} onClose={() => setEditing(null)} /> : null}
    </ModuleShell>
  );
}

function IncidentDialog({ incident, canClose, onClose }: { incident: Incident | null; canClose: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const lk = trpc.ops.lookups.useQuery();
  const [v, setV] = useState(() => ({ kind: incident?.kind ?? "INJURY", severity: (incident?.severity ?? "LOW") as "LOW", occurredAt: local(incident?.occurredAt ?? new Date()), branchId: incident?.branchId ?? "", location: incident?.location ?? "", description: incident?.description ?? "", actionsTaken: incident?.actionsTaken ?? "", status: (incident?.status ?? "OPEN") as "OPEN", guardiansNotified: incident?.guardiansNotified ?? false, involved: (incident?.involved as Array<{ type: "STUDENT" | "STAFF" | "OTHER"; name: string; role?: string | null }>) ?? [], photos: (incident?.attachments as Array<{ url: string; name?: string }>) ?? [] }));
  const [person, setPerson] = useState<PickedStudent | null>(null);
  const m = trpc.safety.saveIncident.useMutation({ onSuccess: () => (toast.success("حُفظ الحادث"), void utils.safety.incidents.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={incident ? `حادث رقم ${incident.number}` : "تسجيل حادث"} description="الحوادث الخطيرة والحرجة تُشعر إدارة المدرسة فوراً." width={680}>
        <div className="grid max-h-[65vh] grid-cols-2 gap-3 overflow-y-auto px-5 pb-4 sm:grid-cols-3">
          <Field label="النوع"><Select value={v.kind} onChange={(kind) => setV({ ...v, kind })} options={options(INCIDENT_KIND)} /></Field>
          <Field label="الخطورة"><Select value={v.severity} onChange={(s) => setV({ ...v, severity: s as "LOW" })} options={options(SEVERITY)} /></Field>
          <Field label="وقت الحدوث"><Input type="datetime-local" value={v.occurredAt} onChange={(e) => setV({ ...v, occurredAt: e.target.value })} /></Field>
          <Field label="الفرع"><Select value={v.branchId || "NONE"} onChange={(b) => setV({ ...v, branchId: b === "NONE" ? "" : b })} options={[{ value: "NONE", label: "—" }, ...(lk.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></Field>
          <Field label="الموقع" className="col-span-2"><Input value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} placeholder="الساحة الخارجية، الفصل ٣/أ…" /></Field>
          <Field label="الوصف" className="col-span-2 sm:col-span-3"><Textarea rows={3} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <div className="col-span-2 sm:col-span-3">
            <span className="mb-1.5 block text-[13px] font-medium text-fg-2">المعنيون</span>
            <div className="mb-2 flex flex-wrap gap-1.5">{v.involved.map((p, i) => <Tag key={i} color={p.type === "STUDENT" ? "navy" : "slate"}>{p.name}<button type="button" className="ms-1" aria-label="إزالة" onClick={() => setV({ ...v, involved: v.involved.filter((_, j) => j !== i) })}>×</button></Tag>)}</div>
            <div className="flex gap-2"><div className="flex-1"><StudentPicker value={person} onChange={(p) => { if (p) setV({ ...v, involved: [...v.involved, { type: "STUDENT", name: p.fullName }] }); setPerson(null); }} placeholder="إضافة طالب…" /></div></div>
          </div>
          <Field label="الإجراءات المتخذة" className="col-span-2 sm:col-span-3"><Textarea rows={2} value={v.actionsTaken} onChange={(e) => setV({ ...v, actionsTaken: e.target.value })} /></Field>
          <div className="col-span-2 sm:col-span-3"><PhotoList label="صور ومرفقات" value={v.photos} onChange={(photos) => setV({ ...v, photos })} /></div>
          <Field label="الحالة"><Select value={v.status} onChange={(s) => setV({ ...v, status: s as "OPEN" })} options={options(INCIDENT_STATUS).filter((o) => canClose || o.value !== "CLOSED")} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]"><Checkbox checked={v.guardiansNotified} onChange={(guardiansNotified) => setV({ ...v, guardiansNotified })} /> أُبلغ أولياء الأمور</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.description.trim().length < 10 || v.location.trim().length < 2} onClick={() => m.mutate({ id: incident?.id ?? null, kind: v.kind as "INJURY", severity: v.severity, occurredAt: new Date(v.occurredAt).toISOString(), branchId: v.branchId || null, location: v.location, description: v.description, involved: v.involved, actionsTaken: v.actionsTaken || null, status: v.status, guardiansNotified: v.guardiansNotified, attachments: v.photos.map((p, i) => ({ id: String(i), name: p.name ?? "صورة", url: p.url })) })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// تمارين الإخلاء وخططه
// ---------------------------------------------------------------------

type Drill = RouterOutputs["safety"]["drills"]["drills"][number];
type Plan = RouterOutputs["safety"]["drills"]["plans"][number];

export function DrillsPage() {
  const q = trpc.safety.drills.useQuery();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [drill, setDrill] = useState<Drill | "new" | null>(null);
  const [plan, setPlan] = useState<Plan | "new" | null>(null);
  const d = q.data;
  const done = d?.drills.filter((x) => x.status === "DONE") ?? [];
  const avg = done.length ? Math.round(done.reduce((s, x) => s + (x.durationSeconds ?? 0), 0) / done.length) : null;
  return (
    <ModuleShell nav={nav()} tabs={SAFETY_TABS} wide actions={d?.canEdit ? (<><Button size="sm" icon={<FileText className="size-3.5" />} onClick={() => setPlan("new")}>خطة إخلاء</Button><Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDrill("new")}>جدولة تمرين/فحص</Button></>) : null}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الإخلاء والفحوص" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="تمارين منفذة" value={done.length} icon={<DoorOpen className="size-4" />} />
            <StatCard label="متوسط زمن الإخلاء" value={avg} format={(n) => `${formatNumber(Math.floor(n / 60), prefs.digits)}:${String(n % 60).padStart(2, "0")} د`} compact icon={<AlertTriangle className="size-4" />} />
            <StatCard label="متأخرة عن موعدها" value={d.drills.filter((x) => x.overdue).length} tone={d.drills.some((x) => x.overdue) ? "danger" : undefined} icon={<ShieldAlert className="size-4" />} />
            <StatCard label="خطط تحتاج مراجعة" value={d.plans.filter((p) => p.reviewDue).length} tone={d.plans.some((p) => p.reviewDue) ? "warning" : undefined} icon={<FileText className="size-4" />} />
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <h2 className="mb-2 text-[15px] font-semibold">التمارين والفحوص الدورية</h2>
              {!d.drills.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا تمارين مجدولة.</p> : (
                <FinTable dense head={<tr><th>النوع</th><th>الفرع</th><th>الموعد</th><th className="text-end">المدة</th><th className="text-end">المشاركون</th><th>الحالة</th></tr>}>
                  {d.drills.map((x) => (
                    <tr key={x.id} className="cursor-pointer" onClick={() => d.canEdit && setDrill(x)}>
                      <td><Tag color={DRILL_KIND[x.kind]?.color}>{DRILL_KIND[x.kind]?.label}</Tag></td>
                      <td>{x.branch ?? "—"}</td>
                      <td className={cn("tabular", x.overdue && "font-semibold text-danger-700")}>{fmtDate(x.scheduledAt)}</td>
                      <td className={num}>{x.durationSeconds ? `${formatNumber(Math.floor(x.durationSeconds / 60), prefs.digits)}:${String(x.durationSeconds % 60).padStart(2, "0")}` : "—"}</td>
                      <td className={num}>{x.participants ? formatNumber(x.participants, prefs.digits) : "—"}</td>
                      <td><Tag color={x.status === "DONE" ? "green" : x.status === "MISSED" ? "red" : x.overdue ? "orange" : "gold"}>{x.status === "DONE" ? "نُفذ" : x.status === "MISSED" ? "لم يُنفذ" : "مجدول"}</Tag></td>
                    </tr>
                  ))}
                </FinTable>
              )}
            </section>
            <section>
              <h2 className="mb-2 text-[15px] font-semibold">خطط الإخلاء</h2>
              {!d.plans.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا خطط.</p> : (
                <ul className="space-y-2">
                  {d.plans.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => d.canEdit && setPlan(p)} className="block w-full rounded-lg bg-card p-3 text-start shadow-card">
                        <span className="flex items-center justify-between"><b className="text-[14px]">{p.title}</b>{p.reviewDue ? <Tag color="orange">مراجعة مستحقة</Tag> : null}</span>
                        <span className="block text-[12px] text-fg-3">{p.branch ?? "كل الفروع"}{p.nextReview ? ` · المراجعة ${fmtDate(p.nextReview)}` : ""}</span>
                        {p.assemblyPoints ? <span className="mt-1 block text-[12px] text-fg-2">نقاط التجمع: {p.assemblyPoints}</span> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
      {drill ? <DrillDialog drill={drill === "new" ? null : drill} onClose={() => setDrill(null)} /> : null}
      {plan ? <PlanDialog plan={plan === "new" ? null : plan} onClose={() => setPlan(null)} /> : null}
    </ModuleShell>
  );
}

const local = (d: Date | string | null | undefined) => (d ? new Date(new Date(d).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : "");

function DrillDialog({ drill, onClose }: { drill: Drill | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const lk = trpc.ops.lookups.useQuery();
  const [v, setV] = useState({ kind: drill?.kind ?? "FIRE", branchId: drill?.branchId ?? "", scheduledAt: local(drill?.scheduledAt) || local(new Date()), conductedAt: local(drill?.conductedAt), minutes: drill?.durationSeconds ? Math.floor(drill.durationSeconds / 60) : 0, seconds: drill?.durationSeconds ? drill.durationSeconds % 60 : 0, participants: drill?.participants ?? null as number | null, result: drill?.result ?? "", issues: drill?.issues ?? "", status: (drill?.status ?? "SCHEDULED") as "SCHEDULED" | "DONE" | "MISSED" });
  const m = trpc.safety.saveDrill.useMutation({ onSuccess: () => (toast.success("حُفظ"), void utils.safety.drills.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const dur = v.minutes * 60 + v.seconds;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={drill ? "تحديث التمرين" : "جدولة تمرين أو فحص"} width={600}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="النوع"><Select value={v.kind} onChange={(kind) => setV({ ...v, kind })} options={options(DRILL_KIND)} /></Field>
          <Field label="الفرع"><Select value={v.branchId || "NONE"} onChange={(b) => setV({ ...v, branchId: b === "NONE" ? "" : b })} options={[{ value: "NONE", label: "كل الفروع" }, ...(lk.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></Field>
          <Field label="الموعد"><Input type="datetime-local" value={v.scheduledAt} onChange={(e) => setV({ ...v, scheduledAt: e.target.value })} /></Field>
          <Field label="الحالة"><Select value={v.status} onChange={(s) => setV({ ...v, status: s as "DONE" })} options={[{ value: "SCHEDULED", label: "مجدول" }, { value: "DONE", label: "نُفذ" }, { value: "MISSED", label: "لم يُنفذ" }]} /></Field>
          {v.status === "DONE" ? (
            <>
              <Field label="وقت التنفيذ"><Input type="datetime-local" value={v.conductedAt} onChange={(e) => setV({ ...v, conductedAt: e.target.value })} /></Field>
              <Field label="زمن الإخلاء (دقائق:ثوانٍ)"><div className="flex gap-2"><Input type="number" min={0} value={v.minutes} onChange={(e) => setV({ ...v, minutes: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /><Input type="number" min={0} max={59} value={v.seconds} onChange={(e) => setV({ ...v, seconds: Math.max(0, Math.min(59, Math.trunc(Number(e.target.value) || 0))) })} /></div></Field>
              <Field label="المشاركون"><Input type="number" min={0} value={v.participants ?? ""} onChange={(e) => setV({ ...v, participants: e.target.value ? Math.trunc(Number(e.target.value)) : null })} /></Field>
              <Field label="النتيجة" className="col-span-2"><Textarea rows={2} value={v.result} onChange={(e) => setV({ ...v, result: e.target.value })} /></Field>
              <Field label="الملاحظات وأوجه القصور" className="col-span-2"><Textarea rows={2} value={v.issues} onChange={(e) => setV({ ...v, issues: e.target.value })} /></Field>
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.status === "DONE" && (!v.conductedAt || !dur)} onClick={() => m.mutate({ id: drill?.id ?? null, kind: v.kind as "FIRE", branchId: v.branchId || null, scheduledAt: new Date(v.scheduledAt).toISOString(), conductedAt: v.conductedAt ? new Date(v.conductedAt).toISOString() : null, durationSeconds: dur || null, participants: v.participants, result: v.result || null, issues: v.issues || null, status: v.status })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({ plan, onClose }: { plan: Plan | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const lk = trpc.ops.lookups.useQuery();
  const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : "");
  const [v, setV] = useState({ title: plan?.title ?? "", branchId: plan?.branchId ?? "", assemblyPoints: plan?.assemblyPoints ?? "", description: plan?.description ?? "", files: plan?.fileUrl ? [{ url: plan.fileUrl }] : ([] as Array<{ url: string }>), reviewedAt: iso(plan?.reviewedAt), nextReview: iso(plan?.nextReview) });
  const m = trpc.safety.savePlan.useMutation({ onSuccess: () => (toast.success("حُفظت الخطة"), void utils.safety.drills.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={plan ? "تعديل خطة الإخلاء" : "خطة إخلاء"} width={600}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="العنوان"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
          <Field label="الفرع"><Select value={v.branchId || "NONE"} onChange={(b) => setV({ ...v, branchId: b === "NONE" ? "" : b })} options={[{ value: "NONE", label: "كل الفروع" }, ...(lk.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} /></Field>
          <Field label="نقاط التجمع" className="col-span-2"><Input value={v.assemblyPoints} onChange={(e) => setV({ ...v, assemblyPoints: e.target.value })} /></Field>
          <Field label="المسارات والتعليمات" className="col-span-2"><Textarea rows={4} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <div className="col-span-2"><PhotoList label="مخطط الإخلاء" value={v.files} onChange={(files) => setV({ ...v, files: files.slice(-1) })} /></div>
          <Field label="آخر مراجعة"><Input type="date" value={v.reviewedAt} onChange={(e) => setV({ ...v, reviewedAt: e.target.value })} /></Field>
          <Field label="المراجعة القادمة"><Input type="date" value={v.nextReview} onChange={(e) => setV({ ...v, nextReview: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.title.trim().length < 2} onClick={() => m.mutate({ id: plan?.id ?? null, branchId: v.branchId || null, title: v.title, assemblyPoints: v.assemblyPoints || null, description: v.description || null, fileUrl: v.files[0]?.url ?? null, reviewedAt: v.reviewedAt || null, nextReview: v.nextReview || null })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// العيادة
// ---------------------------------------------------------------------

type Med = RouterOutputs["clinic"]["dashboard"]["medicines"][number];

export function ClinicPage() {
  const today = useToday();
  const [date, setDate] = useState(today);
  const q = trpc.clinic.dashboard.useQuery({ date });
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [dialog, setDialog] = useState<"visit" | null>(null);
  const [med, setMed] = useState<Med | "new" | null>(null);
  const d = q.data;
  return (
    <ModuleShell nav={opsNav("clinic")} wide actions={d?.canEdit ? <Button size="sm" variant="primary" icon={<Stethoscope className="size-3.5" />} onClick={() => setDialog("visit")}>زيارة جديدة</Button> : null}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض العيادة" description={q.error.message} />
      ) : !d ? (
        <SkeletonLines lines={8} />
      ) : (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="زيارات اليوم" value={d.stats.today} icon={<HeartPulse className="size-4" />} />
            <StatCard label="أُرسلوا للمنزل أو أحيلوا" value={d.stats.sentHome} icon={<Users className="size-4" />} />
            <StatCard label="أدوية تحت الحد" value={d.medicines.filter((m) => m.low).length} tone={d.medicines.some((m) => m.low) ? "warning" : undefined} icon={<Pill className="size-4" />} />
            <StatCard label="قاربت على الانتهاء" value={d.medicines.filter((m) => m.expiring).length} tone={d.medicines.some((m) => m.expired) ? "danger" : undefined} icon={<AlertTriangle className="size-4" />} />
          </section>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <section className="lg:col-span-2">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">الزيارات</h2>
                <Input type="date" className="h-7 w-40" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
              </div>
              {!d.visits.length ? <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لا زيارات في هذا اليوم.</p> : (
                <ul className="space-y-2">
                  {d.visits.map((v) => (
                    <li key={v.id} className="rounded-lg bg-card p-3 text-[13px] shadow-card">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{v.patientName}</span>
                        <span className="flex items-center gap-2 text-fg-3"><span className="tabular">{time(v.visitAt)}</span><Tag color={CLINIC_OUTCOME[v.outcome]?.color}>{CLINIC_OUTCOME[v.outcome]?.label}</Tag></span>
                      </div>
                      <p className="mt-1">{v.complaint}</p>
                      {v.notes ? <p className="mt-1 text-fg-2">{v.notes}</p> : null}
                      <p className="mt-1 flex flex-wrap gap-2 text-[12px] text-fg-3">
                        {v.temperatureTenths ? <span className="flex items-center gap-0.5"><Thermometer className="size-3" />{formatNumber(v.temperatureTenths / 10, prefs.digits)}°</span> : null}
                        {v.medicines.map((m) => <span key={m}>· {m}</span>)}
                        {v.guardianNotified ? <span>· أُشعر ولي الأمر</span> : null}
                        {v.nurse ? <span>· {v.nurse}</span> : null}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-[15px] font-semibold">الأدوية</h2>
                {d.canEdit ? <Button size="xs" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setMed("new")}>دواء</Button> : null}
              </div>
              <FinTable dense head={<tr><th>الدواء</th><th className="text-end">الرصيد</th><th>الصلاحية</th></tr>}>
                {d.medicines.map((m) => (
                  <tr key={m.id} className="cursor-pointer" onClick={() => d.canEdit && setMed(m)}>
                    <td>{m.name}</td>
                    <td className={cn(num, m.low && "text-danger-700")}>{formatNumber(m.quantity, prefs.digits)} {m.unit}</td>
                    <td className={cn("tabular", m.expired ? "text-danger-700" : m.expiring ? "text-warning-700" : "")}>{m.expiryDate ? fmtDate(m.expiryDate) : "—"}</td>
                  </tr>
                ))}
                {!d.medicines.length ? <tr><td colSpan={3} className="text-fg-3">لا أدوية مسجلة</td></tr> : null}
              </FinTable>
            </section>
          </div>
        </>
      )}
      {dialog === "visit" && d ? <VisitDialog medicines={d.medicines} onClose={() => setDialog(null)} /> : null}
      {med ? <MedicineDialog med={med === "new" ? null : med} onClose={() => setMed(null)} /> : null}
    </ModuleShell>
  );
}

function VisitDialog({ medicines, onClose }: { medicines: Med[]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const info = trpc.clinic.patient.useQuery({ studentId: student?.id ?? "" }, { enabled: Boolean(student) });
  const [v, setV] = useState({ complaint: "", notes: "", temp: "", outcome: "RETURNED_TO_CLASS" as "RETURNED_TO_CLASS" | "RESTED" | "SENT_HOME" | "REFERRED" | "AMBULANCE", notifyGuardian: true, meds: [] as Array<{ medicineId: string; quantity: number }> });
  const m = trpc.clinic.visit.useMutation({ onSuccess: () => (toast.success("سُجلت الزيارة"), void utils.clinic.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const p = info.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="زيارة العيادة" description="الشكوى والملاحظات تُحفظ مشفّرة، وإشعار ولي الأمر لا يتضمن تفاصيلها." width={620}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الطالب" className="col-span-2"><StudentPicker value={student} onChange={setStudent} /></Field>
          {p ? (
            <div className="col-span-2 rounded-md bg-hover px-3 py-2 text-[13px]">
              {p.bloodType ? <span>فصيلة الدم {p.bloodType} · </span> : null}
              {p.allergies ? <b className="text-danger-700">حساسية: {p.allergies} · </b> : null}
              {p.chronicConditions ? <span>أمراض مزمنة: {p.chronicConditions} · </span> : null}
              <span>زيارات آخر ٣٠ يوماً: {p.visits30}</span>
            </div>
          ) : null}
          <Field label="الشكوى" className="col-span-2"><Textarea rows={2} value={v.complaint} onChange={(e) => setV({ ...v, complaint: e.target.value })} /></Field>
          <Field label="الحرارة (°م)"><Input dir="ltr" inputMode="decimal" value={v.temp} onChange={(e) => setV({ ...v, temp: e.target.value })} placeholder="37.2" /></Field>
          <Field label="الإجراء"><Select value={v.outcome} onChange={(o) => setV({ ...v, outcome: o as "RESTED" })} options={options(CLINIC_OUTCOME)} /></Field>
          <Field label="ملاحظات الممرض" className="col-span-2"><Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field>
          <div className="col-span-2">
            <span className="mb-1.5 block text-[13px] font-medium text-fg-2">الأدوية المصروفة</span>
            {v.meds.map((x, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_80px_32px] gap-2">
                <Select value={x.medicineId || undefined} onChange={(medicineId) => setV({ ...v, meds: v.meds.map((y, j) => (j === i ? { ...y, medicineId } : y)) })} options={medicines.filter((mm) => mm.quantity > 0 && !mm.expired).map((mm) => ({ value: mm.id, label: `${mm.name} (${mm.quantity})` }))} />
                <Input type="number" min={1} value={x.quantity} onChange={(e) => setV({ ...v, meds: v.meds.map((y, j) => (j === i ? { ...y, quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) } : y)) })} />
                <Button variant="ghost" size="sm" aria-label="حذف" onClick={() => setV({ ...v, meds: v.meds.filter((_, j) => j !== i) })}>×</Button>
              </div>
            ))}
            <Button size="xs" variant="ghost" icon={<Pill className="size-3.5" />} onClick={() => setV({ ...v, meds: [...v.meds, { medicineId: "", quantity: 1 }] })}>إضافة دواء</Button>
          </div>
          <label className="col-span-2 flex items-center gap-2 text-[14px]"><Checkbox checked={v.notifyGuardian} onChange={(notifyGuardian) => setV({ ...v, notifyGuardian })} /> إشعار ولي الأمر</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={!student || v.complaint.trim().length < 3 || v.meds.some((x) => !x.medicineId)} onClick={() => m.mutate({ studentId: student!.id, complaint: v.complaint, notes: v.notes || null, temperatureTenths: v.temp ? Math.round(Number(v.temp.replace(",", ".")) * 10) : null, outcome: v.outcome, notifyGuardian: v.notifyGuardian, medicines: v.meds })}>حفظ الزيارة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MedicineDialog({ med, onClose }: { med: Med | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [v, setV] = useState({ name: med?.name ?? "", form: med?.form ?? "", unit: med?.unit ?? "قرص", quantity: med?.quantity ?? 0, minQty: med?.minQty ?? 0, expiryDate: med?.expiryDate ? new Date(med.expiryDate).toISOString().slice(0, 10) : "", isActive: med?.isActive ?? true });
  const m = trpc.clinic.saveMedicine.useMutation({ onSuccess: () => (toast.success("حُفظ الدواء"), void utils.clinic.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={med ? `تعديل ${med.name}` : "دواء جديد"} width={500}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الاسم" className="col-span-2"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
          <Field label="الشكل"><Input value={v.form} onChange={(e) => setV({ ...v, form: e.target.value })} placeholder="أقراص، شراب…" /></Field>
          <Field label="الوحدة"><Input value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} /></Field>
          <Field label="الرصيد"><Input type="number" min={0} value={v.quantity} onChange={(e) => setV({ ...v, quantity: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></Field>
          <Field label="الحد الأدنى"><Input type="number" min={0} value={v.minQty} onChange={(e) => setV({ ...v, minQty: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })} /></Field>
          <Field label="تاريخ الانتهاء"><Input type="date" value={v.expiryDate} onChange={(e) => setV({ ...v, expiryDate: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[14px]"><Checkbox checked={v.isActive} onChange={(isActive) => setV({ ...v, isActive })} /> متاح للصرف</label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={m.isPending} disabled={v.name.trim().length < 2} onClick={() => m.mutate({ id: med?.id ?? null, name: v.name, form: v.form || null, unit: v.unit, quantity: v.quantity, minQty: v.minQty, expiryDate: v.expiryDate || null, isActive: v.isActive })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { Link };

/** صفحة استلام طالب محدد (من الإشعارات): للموظف مكتب الاستلام، ولولي الأمر قائمة المفوضين */
export function StudentPickupPage({ studentId }: { studentId: string }) {
  const q = trpc.safety.pickupInfo.useQuery({ studentId });
  if (q.data?.canRecord) {
    return (
      <ModuleShell nav={nav()} tabs={SAFETY_TABS}>
        <PickupDesk studentId={studentId} onDone={() => undefined} />
      </ModuleShell>
    );
  }
  return (
    <ModuleShell nav={opsNav("my-pickups")}>
      {q.error ? <EmptyState illustration="lock" title="تعذر العرض" description={q.error.message} /> : !q.data ? <SkeletonLines lines={6} /> : (
        <>
          <h1 className="text-[22px] font-bold">{q.data.student.fullName}</h1>
          {q.data.recent.length ? null : null}
          <AuthorizedList studentId={studentId} />
        </>
      )}
    </ModuleShell>
  );
}
