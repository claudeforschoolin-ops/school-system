"use client";
/**
 * المقررات: الخطة الدراسية لكل صف (الحصص الأسبوعية، الثقل، الكتاب، إنجاز الفصول)، صفحة المقرر
 * (الوحدات والدروس بأسابيعها وتعليم الإنجاز لكل فصل)، وكتالوج المواد.
 */
import { ArrowDown, ArrowUp, BookOpen, CheckCircle2, ChevronLeft, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { ROOM_KINDS } from "@/lib/students";
import { OPTION_COLORS, OPTION_COLOR_LABELS, type OptionColor } from "@/lib/database/types";
import { formatDate } from "@/lib/dates";
import { formatNumber, formatPercent } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { usePrefs } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { CURRICULUM_TABS, Meter, academicNav, tagStyle } from "./common";

const NONE = "__none";

// ---------------------------------------------------------------------
// الخطة الدراسية
// ---------------------------------------------------------------------

export function CurriculumHome() {
  const prefs = usePrefs();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const grades = trpc.curriculum.grades.useQuery();
  const gradeId = params.get("grade") ?? grades.data?.[0]?.id ?? null;
  const plan = trpc.curriculum.plan.useQuery({ gradeId: gradeId! }, { enabled: Boolean(gradeId) });
  const [editing, setEditing] = useState<null | { subjectId?: string; weeklyPeriods: number; heavy: boolean; textbook: string }>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const remove = trpc.curriculum.removePlanItem.useMutation({
    onSuccess: () => (toast.success("أُزيلت المادة من الخطة"), setRemoving(null), void utils.curriculum.invalidate()),
    onError: (e) => toast.error(e.message),
  });
  const select = (id: string) => router.replace(`${pathname}?grade=${id}`, { scroll: false });
  const stages = [...new Set((grades.data ?? []).map((g) => g.stageName))];
  const p = plan.data;
  return (
    <ModuleShell nav={academicNav("curriculum")} tabs={CURRICULUM_TABS} wide>
      {grades.error ? <EmptyState illustration="lock" title="لا يمكن عرض المقررات" description={grades.error.message} /> : null}
      {grades.data && !grades.data.length ? <EmptyState title="لا توجد صفوف ضمن فصولك" description="تظهر للمعلم خطط الصفوف التي يدرّسها." /> : null}
      {grades.data?.length ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr]">
          <nav className="hidden lg:block" aria-label="الصفوف">
            {stages.map((st) => (
              <div key={st} className="mb-4">
                <h3 className="mb-1 px-2 text-[12px] font-medium text-fg-3">{st}</h3>
                <ul>
                  {grades.data!
                    .filter((g) => g.stageName === st)
                    .map((g) => (
                      <li key={g.id}>
                        <button onClick={() => select(g.id)} className={cn("flex w-full items-center justify-between rounded-md px-2 py-1.5 text-start text-[14px] transition-colors hover:bg-hover", g.id === gradeId && "bg-active font-medium")}>
                          <span className="truncate">{g.name}</span>
                          <span className="text-[12px] text-fg-3 tabular">{formatNumber(g.periods, prefs.digits)} ح</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </nav>
          <div className="min-w-0">
            <div className="mb-3 lg:hidden">
              <Select value={gradeId ?? undefined} onChange={select} options={grades.data.map((g) => ({ value: g.id, label: g.name }))} />
            </div>
            {plan.isLoading ? <SkeletonLines lines={10} /> : null}
            {plan.error ? <EmptyState illustration="lock" title="لا يمكن عرض الخطة" description={plan.error.message} /> : null}
            {p ? (
              <>
                <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 className="text-[20px] font-bold">{p.grade.name}</h2>
                    <p className="text-[13px] text-fg-3">
                      {p.grade.stageName} · الأسبوع الدراسي {formatNumber(p.week, prefs.digits)} · {formatNumber(p.subjects.length, prefs.digits)} مادة
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Meter className="w-56" value={p.totalPeriods} max={35} label="الحصص الأسبوعية من خانات الأسبوع" warnAt={0.98} />
                    {p.canManage ? (
                      <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing({ weeklyPeriods: 4, heavy: false, textbook: "" })}>
                        مادة
                      </Button>
                    ) : null}
                  </div>
                </header>
                {!p.subjects.length ? (
                  <EmptyState title="لا توجد مواد في خطة هذا الصف" description="أضف المواد وعدد حصصها الأسبوعية؛ يستخدمها الإسناد ومولّد الجدول." />
                ) : (
                  <div className="overflow-x-auto rounded-lg bg-card shadow-card">
                    <table className="w-full min-w-[760px] text-[13px]">
                      <thead className="text-fg-3">
                        <tr className="border-b border-line">
                          <th className="px-3 py-2 text-start font-medium">المادة</th>
                          <th className="px-3 py-2 text-start font-medium">حصص/أسبوع</th>
                          <th className="px-3 py-2 text-start font-medium">الكتاب</th>
                          <th className="px-3 py-2 text-start font-medium">المحتوى</th>
                          {p.sections.map((s) => (
                            <th key={s.id} className="w-40 px-3 py-2 text-start font-medium">
                              إنجاز فصل {s.label}
                              {p.sections.some((x) => x.branchName !== s.branchName) ? <span className="block text-[11px] font-normal">{s.branchName}</span> : null}
                            </th>
                          ))}
                          <th className="w-16" />
                        </tr>
                      </thead>
                      <tbody>
                        {p.subjects.map((item) => (
                          <tr key={item.id} className="group border-b border-line last:border-0 hover:bg-hover/50">
                            <td className="px-3 py-2.5">
                              <Link href={`/academic/curriculum/${item.id}`} className="flex items-center gap-2 font-medium hover:underline">
                                <span className="size-2.5 shrink-0 rounded-sm" style={{ background: `var(--tag-${item.subject.color}-dot)` }} />
                                {item.subject.name}
                              </Link>
                              <div className="mt-1 flex gap-1">
                                {item.heavy ? <Tag color="purple" size="sm">ثقيلة</Tag> : null}
                                {item.subject.roomKind ? <Tag color="gray" size="sm">{ROOM_KINDS.find((k) => k.id === item.subject.roomKind)?.name}</Tag> : null}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 tabular">{formatNumber(item.weeklyPeriods, prefs.digits)}</td>
                            <td className="px-3 py-2.5 text-fg-2">{item.textbook ?? "—"}</td>
                            <td className="px-3 py-2.5 text-fg-3">
                              {item.lessons ? `${formatNumber(item.units, prefs.digits)} وحدات · ${formatNumber(item.lessons, prefs.digits)} درساً` : <Link href={`/academic/curriculum/${item.id}`} className="text-navy-700 underline">أضف الوحدات</Link>}
                            </td>
                            {item.sections.map((s) => (
                              <td key={s.sectionId} className="px-3 py-2.5">
                                {item.lessons ? (
                                  <Tooltip content={`${s.teacherName ?? "غير مسند"} — المتوقع حتى الآن ${formatNumber(item.expected, prefs.digits)} درساً`}>
                                    <Link href={`/academic/curriculum/${item.id}?section=${s.sectionId}`} className="block">
                                      <Meter value={s.completed} max={item.lessons} label={s.completed < item.expected ? <span className="text-warning-700">متأخر {formatNumber(item.expected - s.completed, prefs.digits)}</span> : <span>{formatPercent(item.lessons ? s.completed / item.lessons : 0, prefs.digits)}</span>} warnAt={2} />
                                    </Link>
                                  </Tooltip>
                                ) : (
                                  <span className="text-fg-4">—</span>
                                )}
                              </td>
                            ))}
                            <td className="px-2 py-2.5">
                              {p.canManage ? (
                                <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                  <Button size="icon-sm" variant="ghost" aria-label="تعديل" onClick={() => setEditing({ subjectId: item.subject.id, weeklyPeriods: item.weeklyPeriods, heavy: item.heavy, textbook: item.textbook ?? "" })}>
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button size="icon-sm" variant="ghost" aria-label="إزالة" onClick={() => setRemoving(item.id)}>
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="mt-3 text-[12px] text-fg-3">«ثقيلة»: تُفضَّل في الحصص الأولى ولا تتكرر في اليوم نفسه عند التوليد. الإنجاز = الدروس المعلَّمة منجزة من معلم المادة في الفصل.</p>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      {editing && p ? <PlanItemDialog gradeId={p.grade.id} initial={editing} existing={p.subjects.map((s) => s.subject.id)} onClose={() => setEditing(null)} /> : null}
      <ConfirmDialog open={Boolean(removing)} onOpenChange={(o) => !o && setRemoving(null)} title="إزالة المادة من الخطة؟" description="يُحذف إسنادها في فصول هذا الصف ووحداتها ودروسها. لا يُسمح إن كانت لها حصص في الجدول." danger confirmLabel="إزالة" loading={remove.isPending} onConfirm={() => removing && remove.mutate({ id: removing })} />
    </ModuleShell>
  );
}

function PlanItemDialog({ gradeId, initial, existing, onClose }: { gradeId: string; initial: { subjectId?: string; weeklyPeriods: number; heavy: boolean; textbook: string }; existing: string[]; onClose: () => void }) {
  const subjects = trpc.curriculum.subjects.useQuery();
  const [form, setForm] = useState({ ...initial, subjectId: initial.subjectId ?? "" });
  const utils = trpc.useUtils();
  const save = trpc.curriculum.savePlanItem.useMutation({ onSuccess: () => (toast.success("حُفظت الخطة"), void utils.curriculum.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const options = (subjects.data?.subjects ?? []).filter((s) => s.id === initial.subjectId || !existing.includes(s.id));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={initial.subjectId ? "تعديل مادة في الخطة" : "إضافة مادة للخطة"} width={480}>
        <div className="space-y-3">
          <Field label="المادة">
            <Select value={form.subjectId || undefined} disabled={Boolean(initial.subjectId)} onChange={(v) => setForm({ ...form, subjectId: v })} options={options.map((s) => ({ value: s.id, label: s.name }))} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الحصص الأسبوعية">
              <Input type="number" min={1} max={12} value={form.weeklyPeriods} onChange={(e) => setForm({ ...form, weeklyPeriods: Number(e.target.value) })} />
            </Field>
            <Field label="الكتاب المقرر">
              <Input value={form.textbook} onChange={(e) => setForm({ ...form, textbook: e.target.value })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <Switch checked={form.heavy} onChange={(v) => setForm({ ...form, heavy: v })} />
            مادة ثقيلة (تُفضَّل في الحصص الأولى)
          </label>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} disabled={!form.subjectId || form.weeklyPeriods < 1} onClick={() => save.mutate({ gradeId, subjectId: form.subjectId, weeklyPeriods: form.weeklyPeriods, heavy: form.heavy, textbook: form.textbook || null })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// صفحة المقرر
// ---------------------------------------------------------------------

type UnitForm = { id?: string; title: string; objectives: string };
type LessonForm = { id?: string; unitId: string; title: string; week: string; periods: number; objectives: string };

export function SyllabusPage({ id }: { id: string }) {
  const prefs = usePrefs();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sectionParam = params.get("section");
  const q = trpc.curriculum.syllabus.useQuery({ id, sectionId: sectionParam });
  const data = q.data;
  const sectionId = data?.selectedSectionId ?? null;
  const utils = trpc.useUtils();
  const refresh = () => void utils.curriculum.invalidate();
  const mark = trpc.curriculum.mark.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const move = trpc.curriculum.move.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const delUnit = trpc.curriculum.deleteUnit.useMutation({ onSuccess: () => (toast.success("حُذفت الوحدة"), refresh()), onError: (e) => toast.error(e.message) });
  const delLesson = trpc.curriculum.deleteLesson.useMutation({ onSuccess: () => (toast.success("حُذف الدرس"), refresh()), onError: (e) => toast.error(e.message) });
  const [unit, setUnit] = useState<UnitForm | null>(null);
  const [lesson, setLesson] = useState<LessonForm | null>(null);
  const setSection = (sid: string) => router.replace(`${pathname}?section=${sid}`, { scroll: false });
  if (q.error) {
    return (
      <ModuleShell nav={academicNav("curriculum")} title="المقرر">
        <EmptyState illustration="lock" title="لا يمكن عرض المقرر" description={q.error.message} />
      </ModuleShell>
    );
  }
  const selected = data?.sections.find((s) => s.id === sectionId);
  const expected = data ? data.units.flatMap((u) => u.lessons).filter((l) => l.week !== null && l.week <= data.week).length : 0;
  return (
    <ModuleShell
      nav={academicNav("curriculum")}
      title={data ? `${data.subject.name} — ${data.grade.name}` : "المقرر"}
      crumbs={data ? [{ title: data.grade.name, href: `/academic/curriculum?grade=${data.grade.id}` }, { title: data.subject.name }] : []}
    >
      {!data ? <SkeletonLines lines={12} /> : null}
      {data ? (
        <>
          <header className="mb-5">
            <span className="grid size-12 place-items-center rounded-lg" style={tagStyle(data.subject.color)}>
              <BookOpen className="size-6" />
            </span>
            <h1 className="mt-3 text-[28px] font-bold leading-tight">{data.subject.name}</h1>
            <p className="mt-1 text-[14px] text-fg-3">
              {data.grade.name} · {formatNumber(data.weeklyPeriods, prefs.digits)} حصص أسبوعياً{data.textbook ? ` · كتاب «${data.textbook}»` : ""}
              {data.heavy ? " · مادة ثقيلة" : ""} · الأسبوع الدراسي {formatNumber(data.week, prefs.digits)}
            </p>
          </header>
          {data.sections.length ? (
            <section className="mb-5 flex flex-wrap gap-2">
              {data.sections.map((s) => (
                <button key={s.id} onClick={() => setSection(s.id)} className={cn("w-44 rounded-md p-2.5 text-start shadow-[0_0_0_1px_var(--border)] transition-colors hover:bg-hover", s.id === sectionId && "bg-active shadow-[0_0_0_1.5px_var(--navy-600)]")}>
                  <Meter value={s.completed} max={Math.max(1, data.totalLessons)} label={`فصل ${s.label}${data.sections.some((x) => x.branchName !== s.branchName) ? ` · ${s.branchName}` : ""}`} warnAt={2} />
                </button>
              ))}
            </section>
          ) : null}
          {selected ? (
            <p className={cn("mb-4 rounded-md px-3 py-2 text-[13px]", selected.completed < expected ? "bg-warning-50 text-warning-700" : "bg-success-50 text-success-800")}>
              فصل {selected.label}: أُنجز {formatNumber(selected.completed, prefs.digits)} من {formatNumber(data.totalLessons, prefs.digits)} درساً — المتوقع حتى الأسبوع {formatNumber(data.week, prefs.digits)}: {formatNumber(expected, prefs.digits)}.
              {!data.canMark ? " (العرض فقط؛ التعليم لمعلم المادة في الفصل)" : ""}
            </p>
          ) : (
            <p className="mb-4 text-[13px] text-fg-3">اختر فصلاً لعرض إنجازه وتعليم الدروس.</p>
          )}
          {!data.units.length ? (
            <EmptyState title="لم تُضف وحدات لهذا المقرر" description="قسّم المقرر إلى وحدات ودروس بأسابيع التنفيذ لمتابعة الإنجاز." action={data.canManage ? <Button variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setUnit({ title: "", objectives: "" })}>وحدة</Button> : undefined} />
          ) : (
            <div className="space-y-3">
              {data.units.map((u, ui) => (
                <section key={u.id} className="rounded-lg bg-card shadow-card">
                  <header className="group flex items-start gap-2 border-b border-line px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[15px] font-semibold">{u.title}</h2>
                      {u.objectives ? <p className="mt-0.5 text-[12px] text-fg-3">{u.objectives}</p> : null}
                    </div>
                    {data.canManage ? (
                      <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button size="icon-sm" variant="ghost" aria-label="للأعلى" disabled={ui === 0} onClick={() => move.mutate({ kind: "unit", id: u.id, direction: -1 })}>
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="للأسفل" disabled={ui === data.units.length - 1} onClick={() => move.mutate({ kind: "unit", id: u.id, direction: 1 })}>
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="تعديل الوحدة" onClick={() => setUnit({ id: u.id, title: u.title, objectives: u.objectives ?? "" })}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="حذف الوحدة" onClick={() => delUnit.mutate({ id: u.id })}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </header>
                  <ul className="divide-y divide-line">
                    {u.lessons.map((l, li) => {
                      const late = selected && !l.done && l.week !== null && l.week < data.week;
                      return (
                        <li key={l.id} className="group flex items-center gap-3 px-4 py-2.5 text-[14px]">
                          {selected ? (
                            <Checkbox checked={Boolean(l.done)} disabled={!data.canMark || mark.isPending} onChange={(v) => sectionId && mark.mutate({ lessonId: l.id, sectionId, done: v })} />
                          ) : (
                            <span className="w-4 text-center text-[12px] text-fg-3 tabular">{formatNumber(li + 1, prefs.digits)}</span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={cn("truncate", l.done && "text-fg-3 line-through decoration-fg-4")}>{l.title}</p>
                            {l.done ? (
                              <p className="text-[12px] text-fg-3">
                                <CheckCircle2 className="me-1 inline size-3 text-success-800" />
                                {formatDate(l.done.at, { digits: prefs.digits })}
                                {l.done.by ? ` — ${l.done.by}` : ""}
                              </p>
                            ) : null}
                          </div>
                          {late ? <Tag color="orange" size="sm">متأخر</Tag> : null}
                          {l.week !== null ? (
                            <span className={cn("flex shrink-0 items-center gap-1 text-[12px]", l.week === data.week ? "font-medium text-navy-700" : "text-fg-3")}>
                              <Clock className="size-3" />
                              الأسبوع {formatNumber(l.week, prefs.digits)}
                            </span>
                          ) : null}
                          <span className="hidden shrink-0 text-[12px] text-fg-3 sm:inline">{formatNumber(l.periods, prefs.digits)} حصة</span>
                          {!selected ? <span className="shrink-0 text-[12px] text-fg-3">{formatNumber(l.sectionsDone, prefs.digits)}/{formatNumber(data.sections.length, prefs.digits)} فصل</span> : null}
                          {data.canManage ? (
                            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                              <Button size="icon-sm" variant="ghost" aria-label="للأعلى" disabled={li === 0} onClick={() => move.mutate({ kind: "lesson", id: l.id, direction: -1 })}>
                                <ArrowUp className="size-3.5" />
                              </Button>
                              <Button size="icon-sm" variant="ghost" aria-label="للأسفل" disabled={li === u.lessons.length - 1} onClick={() => move.mutate({ kind: "lesson", id: l.id, direction: 1 })}>
                                <ArrowDown className="size-3.5" />
                              </Button>
                              <Button size="icon-sm" variant="ghost" aria-label="تعديل الدرس" onClick={() => setLesson({ id: l.id, unitId: u.id, title: l.title, week: l.week ? String(l.week) : "", periods: l.periods, objectives: l.objectives ?? "" })}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button size="icon-sm" variant="ghost" aria-label="حذف الدرس" onClick={() => delLesson.mutate({ id: l.id })}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  {data.canManage ? (
                    <button onClick={() => setLesson({ unitId: u.id, title: "", week: "", periods: 1, objectives: "" })} className="flex w-full items-center gap-1.5 px-4 py-2 text-[13px] text-fg-3 hover:bg-hover">
                      <Plus className="size-3.5" /> درس
                    </button>
                  ) : null}
                </section>
              ))}
              {data.canManage ? (
                <Button icon={<Plus className="size-3.5" />} onClick={() => setUnit({ title: "", objectives: "" })}>
                  وحدة
                </Button>
              ) : null}
            </div>
          )}
          {unit ? <UnitDialog gradeSubjectId={data.id} form={unit} onClose={() => setUnit(null)} /> : null}
          {lesson ? <LessonDialog form={lesson} onClose={() => setLesson(null)} /> : null}
          <p className="mt-6">
            <Link href={`/academic/curriculum?grade=${data.grade.id}`} className="inline-flex items-center gap-1 text-[13px] text-fg-3 hover:text-fg">
              الخطة الدراسية لـ{data.grade.name}
              <ChevronLeft className="size-3.5" />
            </Link>
          </p>
        </>
      ) : null}
    </ModuleShell>
  );
}

function UnitDialog({ gradeSubjectId, form: initial, onClose }: { gradeSubjectId: string; form: UnitForm; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const utils = trpc.useUtils();
  const save = trpc.curriculum.saveUnit.useMutation({ onSuccess: () => (void utils.curriculum.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={initial.id ? "تعديل الوحدة" : "وحدة جديدة"} width={520}>
        <div className="space-y-3">
          <Field label="عنوان الوحدة">
            <Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="الوحدة ٥: الإحصاء والاحتمالات" />
          </Field>
          <Field label="الأهداف">
            <Textarea rows={3} value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} disabled={!form.title.trim()} onClick={() => save.mutate({ id: form.id ?? null, gradeSubjectId, title: form.title, objectives: form.objectives || null })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LessonDialog({ form: initial, onClose }: { form: LessonForm; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const utils = trpc.useUtils();
  const save = trpc.curriculum.saveLesson.useMutation({ onSuccess: () => (void utils.curriculum.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={initial.id ? "تعديل الدرس" : "درس جديد"} width={520}>
        <div className="space-y-3">
          <Field label="عنوان الدرس">
            <Input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="أسبوع التنفيذ" hint="يُقارن به الإنجاز الفعلي">
              <Input type="number" min={1} max={45} value={form.week} onChange={(e) => setForm({ ...form, week: e.target.value })} />
            </Field>
            <Field label="عدد الحصص">
              <Input type="number" min={1} max={12} value={form.periods} onChange={(e) => setForm({ ...form, periods: Number(e.target.value) })} />
            </Field>
          </div>
          <Field label="الأهداف">
            <Textarea rows={2} value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} disabled={!form.title.trim() || form.periods < 1} onClick={() => save.mutate({ id: form.id ?? null, unitId: form.unitId, title: form.title, week: form.week ? Number(form.week) : null, periods: form.periods, objectives: form.objectives || null })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// المواد
// ---------------------------------------------------------------------

type SubjectForm = { id?: string; code: string; name: string; color: OptionColor; roomKind: string };

export function SubjectsPage() {
  const prefs = usePrefs();
  const q = trpc.curriculum.subjects.useQuery();
  const [form, setForm] = useState<SubjectForm | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const del = trpc.curriculum.deleteSubject.useMutation({ onSuccess: () => (toast.success("حُذفت المادة"), setDeleting(null), void utils.curriculum.invalidate()), onError: (e) => toast.error(e.message) });
  return (
    <ModuleShell nav={academicNav("curriculum")} tabs={CURRICULUM_TABS} actions={q.data?.canManage ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setForm({ code: "", name: "", color: "navy", roomKind: NONE })}>مادة</Button> : undefined}>
      {q.isLoading ? <SkeletonLines lines={10} /> : null}
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض المواد" description={q.error.message} /> : null}
      {q.data && !q.data.subjects.length ? <EmptyState title="لا توجد مواد" description="أضف مواد المدرسة ثم وزّعها على خطط الصفوف." /> : null}
      {q.data?.subjects.length ? (
        <div className="overflow-x-auto rounded-lg bg-card shadow-card">
          <table className="w-full min-w-[600px] text-[13px]">
            <thead className="text-fg-3">
              <tr className="border-b border-line">
                <th className="px-3 py-2 text-start font-medium">الرمز</th>
                <th className="px-3 py-2 text-start font-medium">المادة</th>
                <th className="px-3 py-2 text-start font-medium">القاعة المطلوبة</th>
                <th className="px-3 py-2 text-start font-medium">صفوف</th>
                <th className="px-3 py-2 text-start font-medium">مجموع الحصص الأسبوعية</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {q.data.subjects.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 font-mono text-[12px]" dir="ltr">{s.code}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-2 font-medium">
                      <span className="size-2.5 rounded-sm" style={{ background: `var(--tag-${s.color}-dot)` }} />
                      {s.name}
                    </span>
                  </td>
                  <td className="px-3 py-2">{s.roomKind ? <Tag color={ROOM_KINDS.find((k) => k.id === s.roomKind)?.color ?? "gray"} size="sm">{ROOM_KINDS.find((k) => k.id === s.roomKind)?.name}</Tag> : <span className="text-fg-3">قاعة الفصل</span>}</td>
                  <td className="px-3 py-2 tabular">{formatNumber(s.grades, prefs.digits)}</td>
                  <td className="px-3 py-2 tabular">{formatNumber(s.periods, prefs.digits)}</td>
                  <td className="px-2 py-2">
                    {q.data!.canManage ? (
                      <div className="flex justify-end gap-0.5">
                        <Button size="icon-sm" variant="ghost" aria-label="تعديل" onClick={() => setForm({ id: s.id, code: s.code, name: s.name, color: s.color as OptionColor, roomKind: s.roomKind ?? NONE })}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label="حذف" onClick={() => setDeleting(s.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {form ? <SubjectDialog form={form} onClose={() => setForm(null)} /> : null}
      <ConfirmDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)} title="حذف المادة؟" description="لا يمكن حذف مادة مستخدمة في خطط الصفوف." danger confirmLabel="حذف" loading={del.isPending} onConfirm={() => deleting && del.mutate({ id: deleting })} />
    </ModuleShell>
  );
}

function SubjectDialog({ form: initial, onClose }: { form: SubjectForm; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const utils = trpc.useUtils();
  const save = trpc.curriculum.saveSubject.useMutation({ onSuccess: () => (toast.success("حُفظت المادة"), void utils.curriculum.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={initial.id ? "تعديل مادة" : "مادة جديدة"} width={500}>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الرمز">
            <Input dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="GEO" maxLength={12} />
          </Field>
          <Field label="الاسم">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="الجغرافيا" />
          </Field>
          <Field label="اللون في الجداول">
            <Select value={form.color} onChange={(v) => setForm({ ...form, color: v as OptionColor })} options={OPTION_COLORS.map((c) => ({ value: c, label: OPTION_COLOR_LABELS[c] }))} />
          </Field>
          <Field label="القاعة المطلوبة">
            <Select value={form.roomKind} onChange={(v) => setForm({ ...form, roomKind: v })} options={[{ value: NONE, label: "قاعة الفصل" }, ...ROOM_KINDS.filter((k) => k.id !== "CLASSROOM").map((k) => ({ value: k.id, label: k.name }))]} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} disabled={!form.code.trim() || !form.name.trim()} onClick={() => save.mutate({ id: form.id ?? null, code: form.code, name: form.name, color: form.color, roomKind: form.roomKind === NONE ? null : (form.roomKind as "LAB") })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
