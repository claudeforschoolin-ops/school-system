"use client";
/**
 * الأنشطة والفعاليات: الصفحة الرئيسية (قاعدة بيانات بعروضها)، صفحة النشاط (التسجيل والموافقات والحضور والألبوم
 * والتقويم والرسوم)، ونافذة إنشاء/تعديل نشاط.
 */
import { CalendarCheck, CalendarClock, CheckCheck, ImagePlus, MapPin, MoreHorizontal, Pencil, Send, Star, Trash2, Trophy, UserPlus, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ACTIVITY_KIND, ACTIVITY_STATUS, CONSENT_STATUS, REGISTRATION_STATUS } from "@/lib/students";
import { formatDate, formatTimeRange } from "@/lib/dates";
import { formatMoney, minorToDecimalString } from "@/lib/money";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { pickFile, uploadFile } from "@/lib/upload";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { DatabaseView } from "@/components/database/database-view";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { academicNav, Meter } from "@/components/academic/common";
import { ActivityForm, NONE, payload, toLocal } from "./activity-form";

type Activity = RouterOutputs["activities"]["get"];

export function ActivitiesHome() {
  const o = trpc.activities.overview.useQuery().data;
  const db = trpc.activities.databaseId.useQuery();
  return (
    <ModuleShell nav={academicNav("activities")} wide>
      <section className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="أنشطة قادمة" value={o?.upcoming} icon={<CalendarClock className="size-4" />} />
        <StatCard label="التسجيل مفتوح" value={o?.open} icon={<UserPlus className="size-4" />} tone={o?.open ? "success" : undefined} />
        <StatCard label="موافقات أولياء أمور معلّقة" value={o?.pendingConsent} icon={<Send className="size-4" />} tone={o?.pendingConsent ? "warning" : undefined} />
        <StatCard label="طلاب مشاركون" value={o?.participants} icon={<Users className="size-4" />} />
      </section>
      {db.data ? <DatabaseView databaseId={db.data} mode="page" /> : <Skeleton className="h-64 w-full" />}
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// صفحة النشاط
// ---------------------------------------------------------------------

export function ActivityDetail({ id }: { id: string }) {
  const prefs = usePrefs();
  const { tenant } = useApp();
  const q = trpc.activities.get.useQuery({ id });
  const utils = trpc.useUtils();
  const refresh = () => void utils.activities.invalidate();
  const onError = (e: { message: string }) => toast.error(e.message);
  const update = trpc.activities.update.useMutation({ onSuccess: refresh, onError });
  const consents = trpc.activities.requestConsents.useMutation({ onSuccess: (r) => (toast.success(`أُرسل طلب الموافقة لأولياء أمور ${formatNumber(r.students, prefs.digits)} طالباً (${formatNumber(r.messages, prefs.digits)} رسالة)`), refresh()), onError });
  const sync = trpc.activities.syncCalendar.useMutation({ onSuccess: () => (toast.success("حُدّث حدث التقويم"), refresh()), onError });
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const a = q.data;
  if (q.error) {
    return (
      <ModuleShell nav={academicNav("activities")} title="النشاط">
        <EmptyState illustration="lock" title="لا يمكن عرض النشاط" description={q.error.message} />
      </ModuleShell>
    );
  }
  return (
    <ModuleShell nav={academicNav("activities")} title={a?.title ?? "النشاط"} crumbs={a ? [{ title: a.title }] : []}>
      {!a ? <SkeletonLines lines={12} /> : null}
      {a ? (
        <>
          <header className="mb-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid size-12 place-items-center rounded-lg" style={{ background: `var(--tag-${ACTIVITY_KIND[a.kind].color}-bg)`, color: `var(--tag-${ACTIVITY_KIND[a.kind].color}-fg)` }}>
                <Trophy className="size-6" />
              </span>
              <span className="flex-1" />
              {a.canEdit ? (
                <>
                  <Select size="sm" className="w-40" value={a.status} onChange={(v) => update.mutate({ id, patch: { status: v as Activity["status"] } })} options={Object.entries(ACTIVITY_STATUS).map(([value, o]) => ({ value, label: o.label }))} />
                  <Button size="sm" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>
                    تعديل
                  </Button>
                </>
              ) : (
                <Tag color={ACTIVITY_STATUS[a.status].color}>{ACTIVITY_STATUS[a.status].label}</Tag>
              )}
            </div>
            <h1 className="mt-3 text-[28px] font-bold leading-tight">{a.title}</h1>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-fg-2">
              <Tag color={ACTIVITY_KIND[a.kind].color}>{ACTIVITY_KIND[a.kind].label}</Tag>
              {a.startAt ? (
                <span className="flex items-center gap-1.5">
                  <CalendarClock className="size-4 text-fg-3" />
                  {formatDate(a.startAt, { digits: prefs.digits, calendar: "both", style: "long" })}
                  {a.endAt ? ` · ${formatTimeRange(new Date(a.startAt), new Date(a.endAt), prefs.digits, tenant.timezone)}` : ""}
                </span>
              ) : null}
              {a.location ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-4 text-fg-3" />
                  {a.location}
                </span>
              ) : null}
              <span className="text-fg-3">{a.branch?.name ?? "كل الفروع"}</span>
              {a.supervisor ? <span className="text-fg-3">المشرف: {a.supervisor.name}</span> : null}
            </div>
            {a.grades.length ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {a.grades.map((g) => (
                  <Tag key={g.id} color="gray" size="sm">
                    {g.name}
                  </Tag>
                ))}
              </div>
            ) : null}
            {a.description ? <p className="mt-3 max-w-3xl whitespace-pre-line text-[15px] leading-7 text-fg-2">{a.description}</p> : null}
          </header>

          <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-lg bg-card p-4 shadow-card">
              <p className="text-[13px] font-medium text-fg-3">المقاعد</p>
              {a.seats.capacity ? <Meter className="mt-3" value={a.seats.taken} max={a.seats.capacity} label="مسجل" /> : <p className="mt-3 text-[22px] font-bold tabular">{formatNumber(a.seats.taken, prefs.digits)}</p>}
              <p className="mt-1.5 text-[12px] text-fg-3">{a.seats.waitlist ? `${formatNumber(a.seats.waitlist, prefs.digits)} في الانتظار` : a.seats.capacity ? "لا انتظار" : "بلا حد للطاقة"}</p>
            </div>
            <div className="rounded-lg bg-card p-4 shadow-card">
              <p className="text-[13px] font-medium text-fg-3">موافقات أولياء الأمور</p>
              {a.requiresConsent ? (
                <>
                  <p className="mt-3 text-[22px] font-bold tabular">
                    {formatNumber(a.consent.granted, prefs.digits)}
                    <span className="text-[13px] font-normal text-fg-3"> موافق</span>
                  </p>
                  <p className="mt-1 text-[12px] text-fg-3">
                    {formatNumber(a.consent.pending, prefs.digits)} بانتظار · {formatNumber(a.consent.denied, prefs.digits)} رفض
                  </p>
                </>
              ) : (
                <p className="mt-3 text-[14px] text-fg-2">لا يتطلب موافقة</p>
              )}
            </div>
            <div className="rounded-lg bg-card p-4 shadow-card">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg-3">
                <Wallet className="size-3.5" /> الرسم
              </p>
              <p className="mt-3 text-[22px] font-bold tabular">{a.feeMinor ? formatMoney(a.feeMinor, { currency: tenant.currency, digits: prefs.digits }) : "مجاني"}</p>
              {a.feeMinor ? <p className="mt-1 text-[12px] text-fg-3">يُصدر بفاتورة عند تفعيل المحاسبة (المرحلة ٣)</p> : null}
            </div>
            <div className="rounded-lg bg-card p-4 shadow-card">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-fg-3">
                <CalendarCheck className="size-3.5" /> تقويم المدرسة
              </p>
              <p className="mt-3 text-[14px]">{a.calendarSynced ? "مضاف إلى التقويم" : a.startAt ? "غير مضاف" : "حدّد الموعد أولاً"}</p>
              <div className="mt-2 flex gap-2">
                {a.canEdit && a.startAt ? (
                  <Button size="xs" loading={sync.isPending} onClick={() => sync.mutate({ id })}>
                    {a.calendarSynced ? "تحديث" : "إضافة"}
                  </Button>
                ) : null}
                {a.calendarSynced ? (
                  <Link href="/calendar" className="text-[12px] text-navy-700 underline">
                    فتح التقويم
                  </Link>
                ) : null}
              </div>
            </div>
          </section>

          <Registrations activity={a} onAdd={() => setAdding(true)} onRequestConsents={() => consents.mutate({ id })} requesting={consents.isPending} />
          <Album activity={a} />

          {editing ? (
            <ActivityForm
              title="تعديل النشاط"
              submitLabel="حفظ"
              submitting={update.isPending}
              onClose={() => setEditing(false)}
              initial={{
                title: a.title,
                kind: a.kind,
                branchId: a.branchId ?? NONE,
                description: a.description ?? "",
                start: toLocal(a.startAt),
                end: toLocal(a.endAt),
                location: a.location ?? "",
                supervisorId: a.supervisorId ?? NONE,
                capacity: a.capacity ? String(a.capacity) : "",
                fee: a.feeMinor ? minorToDecimalString(a.feeMinor, tenant.currency) : "",
                requiresConsent: a.requiresConsent,
                gradeIds: a.gradeIds,
              }}
              onSubmit={(f) => {
                const { branchId: _branch, ...rest } = payload(f, tenant.currency);
                update.mutate({ id, patch: rest }, { onSuccess: () => (toast.success("حُفظ النشاط"), setEditing(false)) });
              }}
            />
          ) : null}
          {adding ? <AddStudentsDialog activity={a} onClose={() => setAdding(false)} /> : null}
        </>
      ) : null}
    </ModuleShell>
  );
}

function Registrations({ activity: a, onAdd, onRequestConsents, requesting }: { activity: Activity; onAdd: () => void; onRequestConsents: () => void; requesting: boolean }) {
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const update = trpc.activities.updateRegistration.useMutation({ onSuccess: () => void utils.activities.invalidate(), onError: (e) => toast.error(e.message) });
  const [filter, setFilter] = useState<string>("all");
  const rows = a.registrations.filter((r) => filter === "all" || r.status === filter || r.consentStatus === filter);
  const ended = a.status === "COMPLETED" || a.status === "CANCELLED";
  return (
    <section className="mb-8 rounded-lg bg-card shadow-card">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-semibold">المسجلون ({formatNumber(a.registrations.filter((r) => r.status !== "CANCELLED").length, prefs.digits)})</h2>
        <div className="w-44">
          <Select
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "الكل" },
              ...Object.entries(REGISTRATION_STATUS).map(([value, o]) => ({ value, label: o.label })),
              ...(a.requiresConsent ? [{ value: "PENDING", label: "موافقة معلّقة" }] : []),
            ]}
          />
        </div>
        <span className="flex-1" />
        {a.canEdit && a.requiresConsent && a.consent.pending ? (
          <Button size="sm" icon={<Send className="size-3.5" />} loading={requesting} onClick={onRequestConsents}>
            طلب الموافقة من أولياء الأمور ({formatNumber(a.consent.pending, prefs.digits)})
          </Button>
        ) : null}
        {a.canEdit && !ended ? (
          <Button size="sm" variant="primary" icon={<UserPlus className="size-3.5" />} onClick={onAdd}>
            تسجيل طلاب
          </Button>
        ) : null}
      </header>
      {!a.registrations.length ? (
        <EmptyState compact illustration="blank" title="لم يُسجَّل طلاب بعد" description={a.canEdit ? "سجّل الطلاب من الصفوف المستهدفة؛ ويُحوَّل الزائد عن الطاقة إلى قائمة الانتظار." : undefined} />
      ) : (
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-[13px]">
              <Avatar name={r.student.fullName} src={r.student.photoUrl} size={26} />
              <Link href={`/students/${r.student.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate font-medium">{r.student.fullName}</span>
                <span className="block text-[12px] text-fg-3">
                  {r.student.grade.name}
                  {r.student.section ? ` / ${r.student.section.name}` : ""}
                </span>
              </Link>
              <Tag color={REGISTRATION_STATUS[r.status as keyof typeof REGISTRATION_STATUS].color} size="sm">
                {REGISTRATION_STATUS[r.status as keyof typeof REGISTRATION_STATUS].label}
              </Tag>
              {a.requiresConsent ? (
                <Tag color={CONSENT_STATUS[r.consentStatus as keyof typeof CONSENT_STATUS].color} size="sm">
                  {CONSENT_STATUS[r.consentStatus as keyof typeof CONSENT_STATUS].label}
                </Tag>
              ) : null}
              {a.canEdit ? (
                <Menu>
                  <MenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" aria-label="إجراءات">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </MenuTrigger>
                  <MenuContent className="w-56">
                    {a.requiresConsent ? (
                      <>
                        <MenuLabel>رد ولي الأمر</MenuLabel>
                        <MenuItem icon={<CheckCheck className="size-3.5" />} onSelect={() => update.mutate({ id: r.id, consentStatus: "GRANTED" })}>
                          وافق
                        </MenuItem>
                        <MenuItem onSelect={() => update.mutate({ id: r.id, consentStatus: "DENIED" })}>لم يوافق (يُلغى التسجيل)</MenuItem>
                        <MenuSeparator />
                      </>
                    ) : null}
                    {r.status === "WAITLIST" ? <MenuItem onSelect={() => update.mutate({ id: r.id, status: "REGISTERED" })}>نقل إلى المسجلين</MenuItem> : null}
                    {r.status === "REGISTERED" ? (
                      <MenuItem icon={<Star className="size-3.5" />} onSelect={() => update.mutate({ id: r.id, status: "ATTENDED" })}>
                        شارك فعلاً
                      </MenuItem>
                    ) : null}
                    {r.status === "CANCELLED" ? <MenuItem onSelect={() => update.mutate({ id: r.id, status: "WAITLIST" })}>إعادة إلى الانتظار</MenuItem> : null}
                    {r.status !== "CANCELLED" ? (
                      <MenuItem danger icon={<Trash2 className="size-3.5" />} onSelect={() => update.mutate({ id: r.id, status: "CANCELLED" })}>
                        إلغاء التسجيل
                      </MenuItem>
                    ) : null}
                  </MenuContent>
                </Menu>
              ) : null}
            </li>
          ))}
          {!rows.length ? <li className="px-4 py-3 text-[13px] text-fg-3">لا توجد سجلات بهذا التصنيف.</li> : null}
        </ul>
      )}
    </section>
  );
}

function AddStudentsDialog({ activity: a, onClose }: { activity: Activity; onClose: () => void }) {
  const prefs = usePrefs();
  const [q, setQ] = useState("");
  const [sectionId, setSectionId] = useState(NONE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const sections = trpc.academic.sectionOptions.useQuery();
  const list = trpc.activities.eligible.useQuery({ id: a.id, q: q.trim() || undefined, sectionId: sectionId === NONE ? null : sectionId });
  const utils = trpc.useUtils();
  const register = trpc.activities.register.useMutation({
    onSuccess: (r) => {
      toast.success(`سُجّل ${formatNumber(r.registered, prefs.digits)}${r.waitlisted ? ` و${formatNumber(r.waitlisted, prefs.digits)} في الانتظار` : ""}`);
      void utils.activities.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const eligibleSections = (sections.data ?? []).filter((s) => (!a.branchId || s.branchId === a.branchId) && (!a.gradeIds.length || a.gradeIds.includes(s.gradeId)));
  const free = a.seats.capacity ? Math.max(0, a.seats.capacity - a.seats.taken) : null;
  const all = list.data ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تسجيل طلاب في النشاط" description={free !== null ? `المقاعد المتبقية: ${formatNumber(free, prefs.digits)} — الزائد يُحوَّل إلى الانتظار` : undefined} width={620}>
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالاسم أو الرقم الأكاديمي" />
          <div className="w-52 shrink-0">
            <Select value={sectionId} onChange={setSectionId} options={[{ value: NONE, label: "كل الفصول" }, ...eligibleSections.map((s) => ({ value: s.id, label: s.label }))]} />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-[12px] text-fg-3">
          <span>{formatNumber(all.length, prefs.digits)} طالباً مؤهلاً</span>
          {all.length ? (
            <button className="underline" onClick={() => setPicked(picked.size === all.length ? new Set() : new Set(all.map((s) => s.id)))}>
              {picked.size === all.length ? "إلغاء التحديد" : "تحديد الكل"}
            </button>
          ) : null}
        </div>
        <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto rounded-md shadow-[0_0_0_1px_var(--border)]">
          {list.isLoading ? <li className="p-3"><SkeletonLines lines={4} /></li> : null}
          {all.map((s) => (
            <li key={s.id}>
              <label className="flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-hover">
                <Checkbox
                  checked={picked.has(s.id)}
                  onChange={(v) =>
                    setPicked((old) => {
                      const next = new Set(old);
                      if (v) next.add(s.id);
                      else next.delete(s.id);
                      return next;
                    })
                  }
                />
                <Avatar name={s.fullName} src={s.photoUrl} size={22} />
                <span className="min-w-0 flex-1 truncate">{s.fullName}</span>
                <span className="text-[12px] text-fg-3">
                  {s.grade.name}
                  {s.section ? ` / ${s.section.name}` : ""}
                </span>
              </label>
            </li>
          ))}
          {list.data && !all.length ? <li className="px-3 py-3 text-[13px] text-fg-3">لا يوجد طلاب مؤهلون غير مسجلين.</li> : null}
        </ul>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={register.isPending} disabled={!picked.size} onClick={() => register.mutate({ id: a.id, studentIds: [...picked] })}>
            تسجيل {picked.size ? formatNumber(picked.size, prefs.digits) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Album({ activity: a }: { activity: Activity }) {
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);
  const add = trpc.activities.addPhotos.useMutation({ onSuccess: () => void utils.activities.invalidate(), onError: (e) => toast.error(e.message) });
  const remove = trpc.activities.removePhoto.useMutation({ onSuccess: () => void utils.activities.invalidate(), onError: (e) => toast.error(e.message) });
  const cover = trpc.activities.setCover.useMutation({ onSuccess: () => (toast.success("عُيّنت صورة الغلاف"), void utils.activities.invalidate()), onError: (e) => toast.error(e.message) });
  const upload = async () => {
    const f = await pickFile("image/png,image/jpeg,image/webp");
    if (!f) return;
    setBusy(true);
    try {
      const up = await uploadFile(f);
      await add.mutateAsync({ id: a.id, fileIds: [up.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">ألبوم الصور</h2>
        {a.canEdit ? (
          <Button size="sm" icon={<ImagePlus className="size-3.5" />} loading={busy} onClick={() => void upload()}>
            إضافة صورة
          </Button>
        ) : null}
      </div>
      {!a.album.length ? (
        <p className="rounded-lg bg-card px-4 py-6 text-center text-[13px] text-fg-3 shadow-card">{a.canEdit ? "أضف صور النشاط لتظهر هنا ويُستخدم أولها غلافاً في عرض المعرض." : "لا توجد صور بعد."}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {a.album.map((p) => (
            <li key={p.id} className="group relative overflow-hidden rounded-lg bg-hover shadow-card">
              {/* eslint-disable-next-line @next/next/no-img-element -- ملفات المستأجر تُخدم عبر مسار محمي */}
              <img src={p.url} alt={p.name} className="aspect-[4/3] w-full object-cover" />
              {a.cover === p.url ? <span className="absolute start-2 top-2 rounded bg-card/90 px-1.5 py-0.5 text-[11px]">الغلاف</span> : null}
              {a.canEdit ? (
                <div className="absolute end-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <Button size="icon-sm" variant="secondary" aria-label="تعيين غلافاً" onClick={() => cover.mutate({ id: a.id, url: p.url })}>
                    <Star className="size-3.5" />
                  </Button>
                  <Button size="icon-sm" variant="secondary" aria-label="حذف الصورة" onClick={() => remove.mutate({ id: a.id, fileId: p.id })}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
