"use client";
/**
 * صفحات الفصول: نظرة الفصول بالإشغال والرائد والقاعة، إضافة/تعديل فصل، قائمة طلابه، التوزيع التلقائي،
 * القاعات، ومعالج إنهاء العام الدراسي (الترفيع وفتح عام جديد).
 */
import { AlertTriangle, ArrowLeftRight, BookCheck, DoorOpen, GraduationCap, LayoutGrid, Pencil, Plus, Shuffle, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ROOM_KINDS } from "@/lib/students";
import { formatDate } from "@/lib/dates";
import { applyDigits, formatNumber, formatPercent } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { BranchSwitch, CLASSES_TABS, CLASSES_TABS_ADMIN, Meter, academicNav } from "./common";

const NONE = "__none";

// ---------------------------------------------------------------------
// الفصول
// ---------------------------------------------------------------------

export function ClassesHome() {
  const prefs = usePrefs();
  const q = trpc.academic.classes.useQuery();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ sectionId?: string; branchId: string; gradeId: string; gradeName: string } | null>(null);
  const [distribute, setDistribute] = useState<{ branchId: string; gradeId: string; gradeName: string; unassigned: number } | null>(null);
  const data = q.data;
  const branch = data?.branches.find((b) => b.id === branchId) ?? data?.branches[0];
  const tabs = data?.canYearEnd ? CLASSES_TABS_ADMIN : CLASSES_TABS;
  return (
    <ModuleShell nav={academicNav("classes")} tabs={tabs} wide>
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="الفصول" value={data ? data.totals.sections : undefined} icon={<LayoutGrid className="size-4" />} hint={data?.year ? `العام ${data.year.name}` : undefined} />
        <StatCard label="الطلاب المسكّنون" value={data ? data.totals.students : undefined} icon={<Users className="size-4" />} />
        <StatCard label="نسبة الإشغال" value={data ? (data.totals.capacity ? data.totals.students / data.totals.capacity : null) : undefined} format={(n) => formatPercent(n, prefs.digits)} icon={<DoorOpen className="size-4" />} hint={data ? `${formatNumber(data.totals.capacity, prefs.digits)} مقعداً` : undefined} />
        <StatCard label="غير مسكّنين في فصل" value={data ? data.totals.unassigned : undefined} icon={<AlertTriangle className="size-4" />} tone={data?.totals.unassigned ? "warning" : undefined} />
      </section>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض الفصول" description={q.error.message} /> : null}
      {q.isLoading ? <SkeletonLines lines={10} /> : null}
      {data && !data.year ? <EmptyState title="لا يوجد عام دراسي حالي" description="أضف العام الدراسي من الإعدادات ← الهيكل المدرسي." action={<Link href="/settings/structure" className="text-[14px] font-medium text-navy-700 underline">الهيكل المدرسي</Link>} /> : null}
      {data && data.year && !data.branches.length ? <EmptyState title="لا توجد فصول ضمن صلاحيتك" description="تظهر للمعلم الفصول المسندة إليه أو التي هو رائدها." /> : null}
      {branch ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <BranchSwitch branches={data!.branches} value={branch.id} onChange={setBranchId} />
            <p className="text-[13px] text-fg-3">المرحلة ← الصف ← الفصل. اضغط الفصل لعرض طلابه وتعديله.</p>
          </div>
          <div className="space-y-6">
            {[...new Set(branch.grades.map((g) => g.stageName))].map((stage) => (
              <section key={stage}>
                <h2 className="mb-2 text-[13px] font-semibold text-fg-3">{stage}</h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {branch.grades
                    .filter((g) => g.stageName === stage)
                    .map((g) => (
                      <article key={g.id} className="rounded-lg bg-card p-3.5 shadow-card">
                        <header className="mb-2 flex items-center gap-2">
                          <h3 className="min-w-0 truncate text-[14px] font-semibold">{g.name}</h3>
                          {g.unassigned ? (
                            <Tag color="orange" size="sm">
                              {formatNumber(g.unassigned, prefs.digits)} غير مسكّن
                            </Tag>
                          ) : null}
                          <span className="flex-1" />
                          {data!.canManage ? (
                            <>
                              <Tooltip content="توزيع تلقائي">
                                <Button size="icon-sm" variant="ghost" aria-label="توزيع تلقائي" onClick={() => setDistribute({ branchId: branch.id, gradeId: g.id, gradeName: g.name, unassigned: g.unassigned })}>
                                  <Shuffle className="size-3.5" />
                                </Button>
                              </Tooltip>
                              <Tooltip content="إضافة فصل">
                                <Button size="icon-sm" variant="ghost" aria-label="إضافة فصل" onClick={() => setEditing({ branchId: branch.id, gradeId: g.id, gradeName: g.name })}>
                                  <Plus className="size-3.5" />
                                </Button>
                              </Tooltip>
                            </>
                          ) : null}
                        </header>
                        <ul className="space-y-1.5">
                          {g.sections.map((s) => (
                            <li key={s.id}>
                              <button onClick={() => setEditing({ sectionId: s.id, branchId: branch.id, gradeId: g.id, gradeName: g.name })} className="block w-full rounded-md p-2.5 text-start shadow-[0_0_0_1px_var(--border)] transition-colors hover:bg-hover">
                                <Meter value={s.occupied} max={s.capacity} label={<span className="font-medium text-fg">فصل {s.name}{s.room ? <span className="font-normal text-fg-3"> · قاعة {applyDigits(s.room, prefs.digits)}</span> : null}</span>} />
                                <div className="mt-2 flex items-center justify-between gap-2 text-[12px] text-fg-3">
                                  <span className="flex min-w-0 items-center gap-1.5">
                                    {s.homeroomName ? (
                                      <>
                                        <Avatar name={s.homeroomName} size={16} />
                                        <span className="truncate">{s.homeroomName}</span>
                                      </>
                                    ) : (
                                      <span className="text-warning-700">بلا رائد فصل</span>
                                    )}
                                  </span>
                                  <span className={cn("flex shrink-0 items-center gap-1", s.subjectsAssigned < s.subjectsRequired && "text-warning-700")}>
                                    <BookCheck className="size-3.5" />
                                    {formatNumber(s.subjectsAssigned, prefs.digits)}/{formatNumber(s.subjectsRequired, prefs.digits)} مادة
                                  </span>
                                </div>
                              </button>
                            </li>
                          ))}
                          {!g.sections.length ? <li className="text-[13px] text-fg-3">لا فصول لهذا الصف.</li> : null}
                        </ul>
                      </article>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
      {editing ? <SectionDialog {...editing} canManage={Boolean(data?.canManage)} onClose={() => setEditing(null)} /> : null}
      {distribute ? <DistributeDialog {...distribute} onClose={() => setDistribute(null)} /> : null}
    </ModuleShell>
  );
}

function SectionDialog({ sectionId, branchId, gradeId, gradeName, canManage, onClose }: { sectionId?: string; branchId: string; gradeId: string; gradeName: string; canManage: boolean; onClose: () => void }) {
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const overview = trpc.academic.classes.useQuery();
  const current = overview.data?.branches.flatMap((b) => b.grades.flatMap((g) => g.sections)).find((s) => s.id === sectionId);
  const roster = trpc.academic.roster.useQuery({ id: sectionId! }, { enabled: Boolean(sectionId) });
  const teachers = trpc.academic.teachers.useQuery({ branchId }, { enabled: canManage });
  const [form, setForm] = useState({ name: current?.name ?? "", capacity: current?.capacity ?? 25, room: current?.room ?? "", homeroomUserId: current?.homeroomUserId ?? NONE });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = (msg: string) => {
    toast.success(msg);
    void utils.academic.classes.invalidate();
    void utils.academic.sectionOptions.invalidate();
    onClose();
  };
  const create = trpc.academic.createSection.useMutation({ onSuccess: () => done("أُنشئ الفصل"), onError: (e) => toast.error(e.message) });
  const update = trpc.academic.updateSection.useMutation({ onSuccess: () => done("حُفظت بيانات الفصل"), onError: (e) => toast.error(e.message) });
  const remove = trpc.academic.deleteSection.useMutation({ onSuccess: () => done("حُذف الفصل"), onError: (e) => toast.error(e.message) });
  const payload = { name: form.name.trim(), capacity: Number(form.capacity), room: form.room.trim() || null, homeroomUserId: form.homeroomUserId === NONE ? null : form.homeroomUserId };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={sectionId ? `${gradeName} / فصل ${current?.name ?? ""}` : `فصل جديد — ${gradeName}`} width={640}>
        {canManage ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="اسم الفصل">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ب" maxLength={20} />
            </Field>
            <Field label="الطاقة الاستيعابية">
              <Input type="number" min={1} max={60} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
            </Field>
            <Field label="القاعة">
              <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="١٠٤" />
            </Field>
            <Field label="رائد الفصل">
              <Select value={form.homeroomUserId} onChange={(v) => setForm({ ...form, homeroomUserId: v })} options={[{ value: NONE, label: "بدون" }, ...(teachers.data ?? []).map((t) => ({ value: t.id, label: t.name }))]} />
            </Field>
          </div>
        ) : null}
        {sectionId ? (
          <section className="mt-4">
            <h3 className="mb-2 text-[13px] font-semibold text-fg-3">
              الطلاب {roster.data ? `(${formatNumber(roster.data.students.length, prefs.digits)} من ${formatNumber(roster.data.section.capacity, prefs.digits)})` : ""}
            </h3>
            {roster.isLoading ? <SkeletonLines lines={5} /> : null}
            {roster.data && !roster.data.students.length ? <p className="text-[13px] text-fg-3">لا يوجد طلاب في هذا الفصل بعد. استخدم «توزيع تلقائي» أو التسكين من ملف الطالب.</p> : null}
            <ul className="max-h-72 divide-y divide-line overflow-y-auto rounded-md shadow-[0_0_0_1px_var(--border)]">
              {roster.data?.students.map((s, i) => (
                <li key={s.id}>
                  <Link href={`/students/${s.id}`} className="flex items-center gap-2.5 px-3 py-2 text-[13px] hover:bg-hover">
                    <span className="w-6 text-center text-[12px] text-fg-3 tabular">{formatNumber(i + 1, prefs.digits)}</span>
                    <Avatar name={s.fullName} src={s.photoUrl} size={22} />
                    <span className="min-w-0 flex-1 truncate">{s.fullName}</span>
                    <span className="text-[12px] text-fg-3 tabular">{s.academicNumber}</span>
                    <span className="hidden text-[12px] text-fg-3 sm:inline">{formatDate(s.birthDate, { digits: prefs.digits })}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-fg-3">
              <ArrowLeftRight className="size-3.5" />
              نقل طالب إلى فصل آخر يتم عبر «التحويلات» ليبقى أثره في السجل.
            </p>
          </section>
        ) : null}
        <DialogFooter>
          {sectionId && canManage ? (
            <Button variant="ghost" className="me-auto text-danger-700" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirmDelete(true)}>
              حذف الفصل
            </Button>
          ) : null}
          <Button onClick={onClose}>{canManage ? "إلغاء" : "إغلاق"}</Button>
          {canManage ? (
            <Button
              variant="primary"
              loading={create.isPending || update.isPending}
              disabled={!payload.name || payload.capacity < 1}
              onClick={() => (sectionId ? update.mutate({ id: sectionId, patch: payload }) : create.mutate({ branchId, gradeId, ...payload }))}
            >
              {sectionId ? "حفظ" : "إنشاء الفصل"}
            </Button>
          ) : null}
        </DialogFooter>
        <ConfirmDialog open={confirmDelete} onOpenChange={setConfirmDelete} title="حذف الفصل؟" description="يُسمح بالحذف فقط إن كان الفصل خالياً من الطلاب وحصص الجدول." danger confirmLabel="حذف" loading={remove.isPending} onConfirm={() => sectionId && remove.mutate({ id: sectionId })} />
      </DialogContent>
    </Dialog>
  );
}

function DistributeDialog({ branchId, gradeId, gradeName, unassigned, onClose }: { branchId: string; gradeId: string; gradeName: string; unassigned: number; onClose: () => void }) {
  const prefs = usePrefs();
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"unassigned" | "rebalance">(unassigned ? "unassigned" : "rebalance");
  const preview = trpc.academic.distribute.useMutation({ onError: (e) => toast.error(e.message) });
  const apply = trpc.academic.distribute.useMutation({
    onSuccess: (r) => {
      toast.success(r.moved ? `نُقل ${formatNumber(r.moved, prefs.digits)} طالباً` : "التوزيع متوازن بالفعل");
      void utils.academic.classes.invalidate();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const run = (m: typeof mode) => preview.mutate({ branchId, gradeId, mode: m, dryRun: true });
  const r = preview.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`توزيع تلقائي — ${gradeName}`} description="معاينة قبل التنفيذ. التوازن حسب المستوى الدراسي يتاح بعد تفعيل الدرجات (المرحلة ٤)." width={600}>
        <Segmented
          value={mode}
          onChange={(m) => (setMode(m), run(m))}
          options={[
            { value: "unassigned", label: `غير المسكّنين (${formatNumber(unassigned, prefs.digits)})` },
            { value: "rebalance", label: "إعادة توزيع كل الطلاب" },
          ]}
        />
        <p className="mt-2 text-[13px] text-fg-3">
          {mode === "unassigned" ? "يُسكَّن كل طالب في الفصل الأقل امتلاءً نسبةً إلى طاقته." : "يعاد توزيع الطلاب بالتناوب حسب تاريخ الميلاد لتتقارب الأعداد والأعمار بين الفصول."}
        </p>
        {!r ? (
          <Button className="mt-3" onClick={() => run(mode)} loading={preview.isPending}>
            معاينة التوزيع
          </Button>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {r.result.map((s) => (
                <div key={s.id} className="rounded-md p-2.5 shadow-[0_0_0_1px_var(--border)]">
                  <Meter value={s.count} max={s.capacity} label={`فصل ${s.name}`} />
                </div>
              ))}
            </div>
            <p className="text-[13px]">
              سيُنقل <b className="tabular">{formatNumber(r.moved, prefs.digits)}</b> طالباً.
              {r.unplaced.length ? <span className="text-danger-700"> تعذّر تسكين {formatNumber(r.unplaced.length, prefs.digits)} لاكتمال الطاقة — أضف فصلاً أو ارفع الطاقة.</span> : null}
            </p>
            {r.moves.length ? (
              <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-md text-[13px] shadow-[0_0_0_1px_var(--border)]">
                {r.moves.map((m, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="text-fg-3">{m.from ? `فصل ${m.from}` : "غير مسكّن"}</span>
                    <span className="text-fg-4">←</span>
                    <span className="font-medium">فصل {m.to}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" disabled={!r || !r.moved} loading={apply.isPending} onClick={() => apply.mutate({ branchId, gradeId, mode })}>
            تنفيذ التوزيع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// القاعات
// ---------------------------------------------------------------------

type RoomForm = { id?: string; branchId: string; code: string; name: string; kind: string; capacity: number; isActive: boolean };

export function RoomsPage() {
  const prefs = usePrefs();
  const q = trpc.academic.rooms.useQuery();
  const classes = trpc.academic.classes.useQuery();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [form, setForm] = useState<RoomForm | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const branch = q.data?.branches.find((b) => b.id === branchId) ?? q.data?.branches[0];
  const rooms = (q.data?.rooms ?? []).filter((r) => r.branchId === branch?.id);
  const remove = trpc.academic.deleteRoom.useMutation({ onSuccess: () => (toast.success("حُذفت القاعة"), setDeleting(null), void utils.academic.rooms.invalidate()), onError: (e) => toast.error(e.message) });
  const kindLabel = (k: string) => ROOM_KINDS.find((x) => x.id === k);
  const special = rooms.filter((r) => r.kind !== "CLASSROOM");
  const classrooms = rooms.filter((r) => r.kind === "CLASSROOM");
  return (
    <ModuleShell nav={academicNav("classes")} tabs={classes.data?.canYearEnd ? CLASSES_TABS_ADMIN : CLASSES_TABS} wide>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        {q.data ? <BranchSwitch branches={q.data.branches} value={branch?.id} onChange={setBranchId} /> : <span />}
        {q.data?.canManage && branch ? (
          <Button variant="primary" size="sm" icon={<Plus className="size-3.5" />} onClick={() => setForm({ branchId: branch.id, code: "", name: "", kind: "LAB", capacity: 30, isActive: true })}>
            قاعة
          </Button>
        ) : null}
      </div>
      {q.isLoading ? <SkeletonLines lines={8} /> : null}
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض القاعات" description={q.error.message} /> : null}
      {q.data && !rooms.length ? <EmptyState title="لا توجد قاعات مسجلة" description="أضف المختبرات ومعامل الحاسب والصالات ليستخدمها مولّد الجدول." /> : null}
      {[
        { title: "القاعات الخاصة (يحجزها مولّد الجدول)", list: special },
        { title: "الفصول الدراسية", list: classrooms },
      ].map((group) =>
        group.list.length ? (
          <section key={group.title} className="mb-6">
            <h2 className="mb-2 text-[13px] font-semibold text-fg-3">{group.title}</h2>
            <div className="overflow-x-auto rounded-lg bg-card shadow-card">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead className="text-fg-3">
                  <tr className="border-b border-line">
                    <th className="px-3 py-2 text-start font-medium">الرمز</th>
                    <th className="px-3 py-2 text-start font-medium">القاعة</th>
                    <th className="px-3 py-2 text-start font-medium">النوع</th>
                    <th className="px-3 py-2 text-start font-medium">السعة</th>
                    <th className="w-48 px-3 py-2 text-start font-medium">الاستخدام الأسبوعي</th>
                    <th className="px-3 py-2 text-start font-medium">فصل مقيم</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {group.list.map((r) => {
                    const kind = kindLabel(r.kind);
                    return (
                      <tr key={r.id} className={cn("border-b border-line last:border-0", !r.isActive && "opacity-60")}>
                        <td className="px-3 py-2 tabular">{applyDigits(r.code, prefs.digits)}</td>
                        <td className="px-3 py-2 font-medium">
                          {applyDigits(r.name, prefs.digits)}
                          {!r.isActive ? <span className="ms-2 text-[11px] text-fg-3">(معطّلة)</span> : null}
                        </td>
                        <td className="px-3 py-2">{kind ? <Tag color={kind.color} size="sm">{kind.name}</Tag> : r.kind}</td>
                        <td className="px-3 py-2 tabular">{formatNumber(r.capacity, prefs.digits)}</td>
                        <td className="px-3 py-2">{r.kind === "CLASSROOM" ? <span className="text-fg-3">—</span> : <Meter value={r.weeklyUse} max={35} label="حصة" warnAt={0.9} />}</td>
                        <td className="px-3 py-2 text-fg-3">{r.homeSections.join("، ") || "—"}</td>
                        <td className="px-2 py-2">
                          {q.data?.canManage ? (
                            <div className="flex justify-end gap-0.5">
                              <Button size="icon-sm" variant="ghost" aria-label="تعديل" onClick={() => setForm({ id: r.id, branchId: r.branchId, code: r.code, name: r.name, kind: r.kind, capacity: r.capacity, isActive: r.isActive })}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button size="icon-sm" variant="ghost" aria-label="حذف" onClick={() => setDeleting(r.id)}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null,
      )}
      {form ? <RoomDialog form={form} onClose={() => setForm(null)} /> : null}
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title="حذف القاعة؟" description="لا يمكن حذف قاعة مستخدمة في الجدول؛ عطّلها بدلاً من ذلك." danger confirmLabel="حذف" loading={remove.isPending} onConfirm={() => deleting && remove.mutate({ id: deleting })} />
    </ModuleShell>
  );
}

function RoomDialog({ form: initial, onClose }: { form: RoomForm; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const utils = trpc.useUtils();
  const save = trpc.academic.saveRoom.useMutation({ onSuccess: () => (toast.success("حُفظت القاعة"), void utils.academic.rooms.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={initial.id ? "تعديل قاعة" : "قاعة جديدة"} width={520}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الرمز">
            <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="LAB-3" />
          </Field>
          <Field label="الاسم">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مختبر الكيمياء" />
          </Field>
          <Field label="النوع" hint="المواد التي تتطلب نوعاً معيناً تُسكَّن فيه تلقائياً">
            <Select value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} options={ROOM_KINDS.map((k) => ({ value: k.id, label: k.name }))} />
          </Field>
          <Field label="السعة">
            <Input type="number" min={1} max={500} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })} />
          </Field>
          <label className="col-span-2 flex items-center gap-2 text-[14px]">
            <Switch checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            متاحة للجدولة
          </label>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} disabled={!form.code.trim() || !form.name.trim()} onClick={() => save.mutate({ id: form.id ?? null, branchId: form.branchId, code: form.code, name: form.name, kind: form.kind as "LAB", capacity: form.capacity, isActive: form.isActive })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// إنهاء العام الدراسي
// ---------------------------------------------------------------------

export function YearEndPage() {
  const prefs = usePrefs();
  const q = trpc.academic.yearEndPreview.useQuery(undefined, { retry: false });
  const [step, setStep] = useState(0);
  const [retain, setRetain] = useState<Set<string>>(new Set());
  const [gradeId, setGradeId] = useState<string>("");
  const [form, setForm] = useState<{ name: string; startDate: string; endDate: string } | null>(null);
  const [confirm, setConfirm] = useState("");
  const students = trpc.academic.gradeStudents.useQuery({ gradeId }, { enabled: Boolean(gradeId) });
  const utils = trpc.useUtils();
  const close = trpc.academic.closeYear.useMutation({
    onSuccess: () => {
      toast.success("أُغلق العام وفُتح العام الجديد");
      void utils.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });
  const p = q.data;
  const f = form ?? (p ? p.suggested : null);
  const totals = useMemo(() => {
    if (!p) return { promote: 0, graduate: 0 };
    let promote = 0;
    let graduate = 0;
    for (const g of p.grades) {
      if (g.nextGrade) promote += g.students;
      else graduate += g.students;
    }
    return { promote: promote - retain.size, graduate };
  }, [p, retain]);
  const steps = ["المراجعة", "الباقون للإعادة", "العام الجديد", "التأكيد"];
  if (q.error) {
    return (
      <ModuleShell nav={academicNav("classes")} tabs={CLASSES_TABS}>
        <EmptyState illustration="lock" title="إنهاء العام من صلاحية مدير المدرسة" description={q.error.message} />
      </ModuleShell>
    );
  }
  const result = close.data;
  return (
    <ModuleShell nav={academicNav("classes")} tabs={CLASSES_TABS_ADMIN}>
      {!p ? <SkeletonLines lines={10} /> : null}
      {p && result ? (
        <section className="rounded-lg bg-card p-6 text-center shadow-card">
          <GraduationCap className="mx-auto size-10 text-teal-700" />
          <h2 className="mt-3 text-[20px] font-bold">بدأ العام الدراسي {result.name}</h2>
          <p className="mt-2 text-[14px] text-fg-2">
            رُفّع {formatNumber(result.promoted, prefs.digits)} طالباً، وبقي {formatNumber(result.retained, prefs.digits)} للإعادة، وتخرّج {formatNumber(result.graduated, prefs.digits)}. نُسخ {formatNumber(result.sections, prefs.digits)} فصلاً و{formatNumber(result.teacherLoads, prefs.digits)} نصاب معلم.
          </p>
          <p className="mt-1 text-[13px] text-fg-3">الخطوة التالية: مراجعة الإسناد وتوليد الجداول للعام الجديد.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/academic/assignments" className="rounded-md bg-navy-700 px-3 py-1.5 text-[14px] text-on-primary">تعيين المعلمين</Link>
            <Link href="/academic/classes" className="rounded-md px-3 py-1.5 text-[14px] shadow-[0_0_0_1px_var(--border)]">الفصول</Link>
          </div>
        </section>
      ) : null}
      {p && !result ? (
        <>
          <ol className="mb-5 flex flex-wrap gap-2">
            {steps.map((s, i) => (
              <li key={s} className={cn("flex items-center gap-2 rounded-full px-3 py-1 text-[13px]", i === step ? "bg-navy-700 text-on-primary" : i < step ? "bg-teal-50 text-teal-700" : "bg-hover text-fg-3")}>
                <span className="tabular">{formatNumber(i + 1, prefs.digits)}</span>
                {s}
              </li>
            ))}
          </ol>
          {step === 0 ? (
            <section className="rounded-lg bg-card p-4 shadow-card">
              <h2 className="text-[15px] font-semibold">العام الحالي: {p.year.name}</h2>
              <p className="mt-1 text-[13px] text-fg-3">
                {formatDate(p.year.startDate, { digits: prefs.digits, calendar: "both" })} — {formatDate(p.year.endDate, { digits: prefs.digits, calendar: "both" })}
              </p>
              {p.endsInFuture ? <p className="mt-3 rounded-md bg-warning-50 px-3 py-2 text-[13px] text-warning-700">لم ينتهِ العام الدراسي بعد حسب تاريخه. يُنصح بتنفيذ الإغلاق بعد اعتماد النتائج النهائية.</p> : null}
              {p.warnings.map((w) => (
                <p key={w} className="mt-2 rounded-md bg-warning-50 px-3 py-2 text-[13px] text-warning-700">{w}</p>
              ))}
              <table className="mt-4 w-full text-[13px]">
                <thead className="text-fg-3">
                  <tr className="border-b border-line">
                    <th className="py-2 text-start font-medium">الصف الحالي</th>
                    <th className="py-2 text-start font-medium">الطلاب</th>
                    <th className="py-2 text-start font-medium">ينتقلون إلى</th>
                  </tr>
                </thead>
                <tbody>
                  {p.grades.map((g) => (
                    <tr key={g.id} className="border-b border-line last:border-0">
                      <td className="py-2">{g.name}</td>
                      <td className="py-2 tabular">{formatNumber(g.students, prefs.digits)}</td>
                      <td className="py-2">{g.nextGrade ?? <Tag color="navy" size="sm">تخرّج</Tag>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          {step === 1 ? (
            <section className="rounded-lg bg-card p-4 shadow-card">
              <p className="text-[13px] text-fg-3">حدّد الطلاب الذين يبقون في صفهم (الإعادة). حساب النجاح والرسوب آلياً يتاح مع وحدة الدرجات (المرحلة ٤).</p>
              <div className="mt-3 max-w-xs">
                <Select value={gradeId || undefined} onChange={setGradeId} placeholder="اختر الصف" options={p.grades.map((g) => ({ value: g.id, label: g.name }))} />
              </div>
              {students.isLoading ? <SkeletonLines lines={5} /> : null}
              {students.data ? (
                <ul className="mt-3 max-h-80 divide-y divide-line overflow-y-auto rounded-md shadow-[0_0_0_1px_var(--border)]">
                  {students.data.map((s) => (
                    <li key={s.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px]">
                      <Checkbox
                        checked={retain.has(s.id)}
                        onChange={(v) =>
                          setRetain((old) => {
                            const next = new Set(old);
                            if (v) next.add(s.id);
                            else next.delete(s.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{s.fullName}</span>
                      <span className="text-[12px] text-fg-3">
                        {s.branch.name} · {s.section?.name ? `فصل ${s.section.name}` : "غير مسكّن"}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="mt-3 text-[13px]">المحددون للإعادة: <b className="tabular">{formatNumber(retain.size, prefs.digits)}</b></p>
            </section>
          ) : null}
          {step === 2 && f ? (
            <section className="grid grid-cols-1 gap-3 rounded-lg bg-card p-4 shadow-card sm:grid-cols-3">
              <Field label="اسم العام الجديد">
                <Input value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} />
              </Field>
              <Field label="بداية العام">
                <Input type="date" value={f.startDate} onChange={(e) => setForm({ ...f, startDate: e.target.value })} />
              </Field>
              <Field label="نهاية العام">
                <Input type="date" value={f.endDate} onChange={(e) => setForm({ ...f, endDate: e.target.value })} />
              </Field>
              <p className="text-[13px] text-fg-3 sm:col-span-3">تُنسخ الفصول (بأسمائها وطاقتها وقاعاتها ورواده) وأنصبة المعلمين والفصول الدراسية للعام الجديد؛ ويبقى سجل العام الحالي للاطلاع.</p>
            </section>
          ) : null}
          {step === 3 && f ? (
            <section className="rounded-lg bg-card p-4 shadow-card">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <li className="rounded-md bg-hover p-3 text-center"><b className="block text-[22px] tabular">{formatNumber(totals.promote, prefs.digits)}</b><span className="text-[12px] text-fg-3">يُرفّعون</span></li>
                <li className="rounded-md bg-hover p-3 text-center"><b className="block text-[22px] tabular">{formatNumber(retain.size, prefs.digits)}</b><span className="text-[12px] text-fg-3">للإعادة</span></li>
                <li className="rounded-md bg-hover p-3 text-center"><b className="block text-[22px] tabular">{formatNumber(totals.graduate, prefs.digits)}</b><span className="text-[12px] text-fg-3">يتخرّجون</span></li>
                <li className="rounded-md bg-hover p-3 text-center"><b className="block text-[22px] tabular">{formatNumber(p.sections, prefs.digits)}</b><span className="text-[12px] text-fg-3">فصلاً تُنسخ</span></li>
              </ul>
              <p className="mt-4 rounded-md bg-danger-50 px-3 py-2 text-[13px] text-danger-700">عملية كبيرة تُسجَّل في سجل التدقيق ولا يمكن التراجع عنها تلقائياً. للتأكيد اكتب اسم العام الحالي: «{p.year.name}»</p>
              <Input className="mt-2" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={p.year.name} />
            </section>
          ) : null}
          <div className="mt-4 flex justify-between">
            <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
              السابق
            </Button>
            {step < 3 ? (
              <Button variant="primary" onClick={() => setStep(step + 1)}>
                التالي
              </Button>
            ) : (
              <Button variant="danger" loading={close.isPending} disabled={!f || confirm.trim() !== p.year.name} onClick={() => f && close.mutate({ ...f, retainStudentIds: [...retain], confirm })}>
                إنهاء العام وفتح {f?.name}
              </Button>
            )}
          </div>
        </>
      ) : null}
    </ModuleShell>
  );
}
