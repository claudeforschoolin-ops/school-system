"use client";
/**
 * تعيين المعلمين: مصفوفة (فصل × مادة → معلم) مع المؤهلين والعبء، وأنصبة المعلمين (النصاب ويوم الراحة والمؤهلات)،
 * والإسناد التلقائي للخانات الفارغة.
 */
import { AlertTriangle, BookCheck, Check, Pencil, Sparkles, UserX, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { WEEK_DAYS } from "@/lib/students";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell, StatCard } from "@/components/modules/module-shell";
import { BranchSwitch, Meter, academicNav } from "./common";

/** «أ. محمد بن علي العسيري» ← «محمد العسيري» */
export function shortName(name: string) {
  const parts = name.replace(/^أ\.\s*/, "").split(/\s+/).filter((p) => p !== "بن" && p !== "بنت");
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : (parts[0] ?? name);
}

export function AssignmentsPage() {
  const prefs = usePrefs();
  const [branchId, setBranchId] = useState<string | null>(null);
  const [tab, setTab] = useState<"matrix" | "teachers">("matrix");
  const [editing, setEditing] = useState<string | null>(null);
  const q = trpc.assignments.board.useQuery({ branchId });
  const utils = trpc.useUtils();
  const set = trpc.assignments.set.useMutation({
    onSuccess: (r) => {
      void utils.assignments.board.invalidate();
      void utils.academic.classes.invalidate();
      if (r.overQuota) toast.error(`تجاوز النصاب: ${formatNumber(r.periods ?? 0, prefs.digits)} من ${formatNumber(r.quota ?? 0, prefs.digits)} حصة`);
      if (r.removedSlots) toast.success(`حُذفت ${formatNumber(r.removedSlots, prefs.digits)} حصة متعارضة من الجدول؛ أعد توليده أو سكّنها يدوياً`);
    },
    onError: (e) => toast.error(e.message),
  });
  const auto = trpc.assignments.auto.useMutation({
    onSuccess: (r) => {
      void utils.assignments.board.invalidate();
      toast.success(r.created ? `أُسندت ${formatNumber(r.created, prefs.digits)} مادة تلقائياً` : "لا توجد خانات قابلة للإسناد");
      if (r.skipped.length) toast.error(`تعذّر ${formatNumber(r.skipped.length, prefs.digits)}: ${r.skipped[0]!.section} — ${r.skipped[0]!.subject} (${r.skipped[0]!.reason})`);
    },
    onError: (e) => toast.error(e.message),
  });
  const data = q.data;
  const teacherBy = useMemo(() => new Map((data?.teachers ?? []).map((t) => [t.id, t])), [data]);
  const subjectBy = useMemo(() => new Map((data?.allSubjects ?? []).map((s) => [s.id, s])), [data]);
  const overloaded = data?.teachers.filter((t) => t.periods > t.quota).length ?? 0;
  return (
    <ModuleShell
      nav={academicNav("assignments")}
      wide
      actions={
        data?.canEdit && data.branchId ? (
          <Button size="sm" variant="primary" icon={<Sparkles className="size-3.5" />} loading={auto.isPending} onClick={() => auto.mutate({ branchId: data.branchId! })}>
            إسناد تلقائي للفارغ
          </Button>
        ) : undefined
      }
    >
      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="تغطية المواد" value={data ? (data.totals.required ? data.totals.assigned / data.totals.required : null) : undefined} format={(n) => formatPercent(n, prefs.digits)} icon={<BookCheck className="size-4" />} hint={data ? `${formatNumber(data.totals.assigned, prefs.digits)} من ${formatNumber(data.totals.required, prefs.digits)} مادة-فصل` : undefined} tone={data && data.totals.assigned < data.totals.required ? "warning" : "success"} />
        <StatCard label="الحصص المسندة" value={data ? data.totals.periods : undefined} icon={<Users className="size-4" />} hint={data ? `من نصاب إجمالي ${formatNumber(data.totals.quota, prefs.digits)}` : undefined} />
        <StatCard label="المعلمون" value={data ? data.teachers.length : undefined} icon={<Users className="size-4" />} />
        <StatCard label="تجاوزوا النصاب" value={data ? overloaded : undefined} icon={<AlertTriangle className="size-4" />} tone={overloaded ? "danger" : undefined} />
      </section>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض الإسناد" description={q.error.message} /> : null}
      {q.isLoading ? <SkeletonLines lines={10} /> : null}
      {data ? (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Segmented value={tab} onChange={setTab} options={[{ value: "matrix", label: "مصفوفة الإسناد" }, { value: "teachers", label: "أنصبة المعلمين" }]} />
            <span className="flex-1" />
            <BranchSwitch branches={data.branches} value={data.branchId} onChange={setBranchId} />
          </div>
          {!data.sections.length ? <EmptyState title="لا توجد فصول في هذا الفرع" description="أضف الفصول من «الصفوف والفصول» ثم أسند موادها." /> : null}
          {tab === "matrix" && data.sections.length ? (
            <div className="overflow-auto rounded-lg bg-card shadow-card" style={{ maxHeight: "70vh" }}>
              <table className="w-max min-w-full border-separate border-spacing-0 text-[12px]">
                <thead>
                  <tr>
                    <th className="sticky top-0 z-20 bg-card px-3 py-2 text-start text-[12px] font-medium text-fg-3 shadow-[inset_0_-1px_0_var(--border)] [inset-inline-start:0]">الفصل</th>
                    {data.subjects.map((s) => (
                      <th key={s.id} className="sticky top-0 z-10 min-w-28 bg-card px-2 py-2 text-start font-medium text-fg-2 shadow-[inset_0_-1px_0_var(--border)]">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="size-2 rounded-sm" style={{ background: `var(--tag-${s.color}-dot)` }} />
                          {s.name}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.sections.map((sec) => (
                    <tr key={sec.id}>
                      <th className="sticky z-10 whitespace-nowrap bg-card px-3 py-1.5 text-start text-[13px] font-medium shadow-[inset_0_-1px_0_var(--border)] [inset-inline-start:0]">{sec.label}</th>
                      {data.subjects.map((subj) => {
                        const cell = sec.cells.find((c) => c.subjectId === subj.id);
                        if (!cell) return <td key={subj.id} className="px-2 py-1.5 text-center text-fg-4 shadow-[inset_0_-1px_0_var(--border)]">—</td>;
                        const t = cell.teacherId ? teacherBy.get(cell.teacherId) : null;
                        const qualified = data.teachers.filter((x) => x.subjectIds.includes(subj.id));
                        const others = data.teachers.filter((x) => !x.subjectIds.includes(subj.id));
                        return (
                          <td key={subj.id} className="px-1 py-1 shadow-[inset_0_-1px_0_var(--border)]">
                            <Menu>
                              <MenuTrigger asChild disabled={!data.canEdit}>
                                <button className={cn("flex h-7 w-full items-center gap-1 rounded px-1.5 text-start transition-colors hover:bg-hover disabled:cursor-default disabled:hover:bg-transparent", !t && "bg-warning-50 text-warning-700")}>
                                  {t ? <span className="truncate">{shortName(t.name)}</span> : <span className="truncate">غير مسند</span>}
                                  <span className="ms-auto shrink-0 text-[11px] text-fg-3 tabular">{formatNumber(cell.weeklyPeriods, prefs.digits)}</span>
                                </button>
                              </MenuTrigger>
                              <MenuContent className="max-h-80 w-64 overflow-y-auto">
                                <MenuLabel>
                                  {subjectBy.get(subj.id)?.name} — {sec.label} ({formatNumber(cell.weeklyPeriods, prefs.digits)} حصص)
                                </MenuLabel>
                                {[...qualified, ...(qualified.length ? [null] : []), ...others].map((x, i) =>
                                  x === null ? (
                                    <MenuSeparator key={`sep${i}`} />
                                  ) : (
                                    <MenuItem key={x.id} onSelect={() => set.mutate({ sectionId: sec.id, subjectId: subj.id, teacherId: x.id })} icon={x.id === cell.teacherId ? <Check className="size-3.5" /> : <Avatar name={x.name} color={x.avatarColor ?? undefined} size={16} />}>
                                      <span className="min-w-0 flex-1 truncate">{shortName(x.name)}</span>
                                      <span className={cn("text-[11px] tabular", x.periods + cell.weeklyPeriods > x.quota ? "text-danger-700" : "text-fg-3")}>
                                        {formatNumber(x.periods, prefs.digits)}/{formatNumber(x.quota, prefs.digits)}
                                      </span>
                                    </MenuItem>
                                  ),
                                )}
                                {cell.teacherId ? (
                                  <>
                                    <MenuSeparator />
                                    <MenuItem danger icon={<UserX className="size-3.5" />} onSelect={() => set.mutate({ sectionId: sec.id, subjectId: subj.id, teacherId: null })}>
                                      إلغاء الإسناد
                                    </MenuItem>
                                  </>
                                ) : null}
                              </MenuContent>
                            </Menu>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {tab === "teachers" ? (
            <div className="overflow-x-auto rounded-lg bg-card shadow-card">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead className="text-fg-3">
                  <tr className="border-b border-line">
                    <th className="px-3 py-2 text-start font-medium">المعلم</th>
                    <th className="px-3 py-2 text-start font-medium">المؤهل لتدريس</th>
                    <th className="px-3 py-2 text-start font-medium">يوم الراحة</th>
                    <th className="w-56 px-3 py-2 text-start font-medium">العبء / النصاب</th>
                    <th className="w-12" />
                  </tr>
                </thead>
                <tbody>
                  {[...data.teachers]
                    .sort((a, b) => b.periods / Math.max(1, b.quota) - a.periods / Math.max(1, a.quota))
                    .map((t) => (
                      <tr key={t.id} className="border-b border-line last:border-0">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar name={t.name} color={t.avatarColor ?? undefined} src={t.avatarUrl} size={24} />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{t.name}</p>
                              <p className="truncate text-[12px] text-fg-3">{t.jobTitle}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {t.subjectIds.length ? (
                              t.subjectIds.map((sid) => {
                                const s = subjectBy.get(sid);
                                return s ? (
                                  <Tag key={sid} color={s.color as "navy"} size="sm">
                                    {s.name}
                                  </Tag>
                                ) : null;
                              })
                            ) : (
                              <span className="text-warning-700">لم تُحدد</span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-fg-2">{t.freeDay !== null ? WEEK_DAYS[t.freeDay] : "—"}</td>
                        <td className="px-3 py-2">
                          <Meter value={t.periods} max={t.quota} label="حصة" warnAt={1} />
                        </td>
                        <td className="px-2 py-2">
                          {data.canEdit ? (
                            <Button size="icon-sm" variant="ghost" aria-label="تعديل النصاب" onClick={() => setEditing(t.id)}>
                              <Pencil className="size-3.5" />
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {editing ? <LoadDialog teacher={data.teachers.find((t) => t.id === editing)!} subjects={data.allSubjects} onClose={() => setEditing(null)} /> : null}
        </>
      ) : null}
    </ModuleShell>
  );
}

function LoadDialog({ teacher, subjects, onClose }: { teacher: { id: string; name: string; quota: number; freeDay: number | null; subjectIds: string[] }; subjects: Array<{ id: string; name: string; color: string }>; onClose: () => void }) {
  const [quota, setQuota] = useState(teacher.quota);
  const [freeDay, setFreeDay] = useState(teacher.freeDay === null ? "none" : String(teacher.freeDay));
  const [picked, setPicked] = useState(new Set(teacher.subjectIds));
  const utils = trpc.useUtils();
  const save = trpc.assignments.saveLoad.useMutation({ onSuccess: () => (toast.success("حُفظ النصاب"), void utils.assignments.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`نصاب ${teacher.name}`} description="يستخدمه الإسناد التلقائي ومولّد الجدول." width={560}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="النصاب الأسبوعي (حصة)">
            <Input type="number" min={0} max={40} value={quota} onChange={(e) => setQuota(Number(e.target.value))} />
          </Field>
          <Field label="يوم الراحة المفضل" hint="يُحترم عند التوليد ما أمكن">
            <Select value={freeDay} onChange={setFreeDay} options={[{ value: "none", label: "بدون" }, ...[0, 1, 2, 3, 4].map((d) => ({ value: String(d), label: WEEK_DAYS[d]! }))]} />
          </Field>
        </div>
        <p className="mb-2 mt-4 text-[13px] font-medium">المواد المؤهل لتدريسها</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {subjects.map((s) => (
            <label key={s.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-hover">
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
              <span className="size-2 rounded-sm" style={{ background: `var(--tag-${s.color}-dot)` }} />
              {s.name}
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ userId: teacher.id, quota, freeDay: freeDay === "none" ? null : Number(freeDay), subjectIds: [...picked] })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
