"use client";
/**
 * الاختبارات: دورات الاختبار، الجدول (يدوي أو تلقائي)، اللجان وأرقام الجلوس، كشف اللجنة للطباعة،
 * ومحضر المراقبة (الغياب والمخالفات)، وتوليد كشوف الرصد من الجلسات.
 */
import { CalendarPlus, ChevronLeft, ClipboardList, FilePlus2, LayoutGrid, Pencil, Plus, Printer, Trash2, Users, Wand2 } from "lucide-react";
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
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { useFmtDate } from "@/components/finance/common";
import { parseTenths } from "@/lib/assessment/calc";
import { assessmentNav, EXAM_PHASE, TermPicker, useScore, useTermParam } from "./common";

type ExamList = RouterOutputs["assessment"]["exams"]["list"];
type ExamDetail = RouterOutputs["assessment"]["exams"]["get"];
type Options = RouterOutputs["assessment"]["exams"]["options"];
const iso = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export function ExamsHome() {
  const { can } = useApp();
  const { termId, terms, setTerm } = useTermParam();
  const score = useScore();
  const fmtDate = useFmtDate();
  const list = trpc.assessment.exams.list.useQuery({ termId }, { enabled: Boolean(termId) });
  const mine = trpc.assessment.exams.mine.useQuery();
  const [open, setOpen] = useState<ExamList[number] | "new" | null>(null);
  const canCreate = can("exams", "create");
  return (
    <ModuleShell
      nav={assessmentNav("exams")}
      wide
      actions={
        <>
          <TermPicker value={termId} terms={terms} onChange={setTerm} />
          {canCreate ? (
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setOpen("new")}>
              اختبار جديد
            </Button>
          ) : null}
        </>
      }
    >
      {mine.data?.length ? (
        <section className="mb-6 rounded-lg bg-card p-4 shadow-card">
          <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold">
            <ClipboardList className="size-4 text-fg-3" /> لجاني في المراقبة
          </h2>
          <div className="flex flex-wrap gap-2">
            {mine.data.map((c) => (
              <Link key={c.id} href={`/assessment/exams/committees/${c.id}`} className="rounded-md bg-hover px-3 py-2 text-[13px] hover:bg-active">
                <b>{c.name}</b> — {c.exam.title} <span className="text-fg-3">({formatNumber(c.seats, score.digits)} طالباً)</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
      {list.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الاختبارات" description={list.error.message} />
      ) : !list.data ? (
        <SkeletonLines lines={6} />
      ) : !list.data.length ? (
        <EmptyState
          illustration="calendar"
          title="لا اختبارات في هذا الفصل"
          description="أنشئ دورة اختبار (شهري، منتصف الفصل، نهائي) ثم ولّد جدولها ولجانها تلقائياً."
          action={
            canCreate ? (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setOpen("new")}>
                اختبار جديد
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((e) => (
            <Link key={e.id} href={`/assessment/exams/${e.id}`} className="group rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] duration-[140ms] hover:-translate-y-px hover:shadow-card-hover">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[16px] font-semibold leading-snug">{e.title}</h3>
                <Tag color={EXAM_PHASE[e.phase]!.color}>{EXAM_PHASE[e.phase]!.label}</Tag>
              </div>
              <p className="mt-1 text-[13px] text-fg-3">
                {e.term} · {e.branch} · {fmtDate(e.startDate)} ← {fmtDate(e.endDate)}
              </p>
              <p className="mt-2 line-clamp-2 text-[13px] text-fg-2">{e.grades.join("، ")}</p>
              <div className="mt-3 flex gap-4 text-[12px] text-fg-3">
                <span>{formatNumber(e._count.sessions, score.digits)} جلسة</span>
                <span>{formatNumber(e._count.committees, score.digits)} لجنة</span>
                <span>{formatNumber(e._count.seats, score.digits)} مقعد</span>
              </div>
            </Link>
          ))}
        </div>
      )}
      {open ? <ExamDialog exam={open === "new" ? null : open} termId={termId} terms={terms} onClose={() => setOpen(null)} /> : null}
    </ModuleShell>
  );
}

function ExamDialog({ exam, termId, terms, onClose }: { exam: { id: string; title: string; kind: string; componentKey: string; gradeIds: string[]; branchId: string | null; startDate: Date | string; endDate: Date | string; termId: string; instructions: string | null } | null; termId: string | null; terms: Array<{ id: string; name: string; startDate: Date | string; endDate: Date | string }>; onClose: () => void }) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const opts = trpc.assessment.exams.options.useQuery();
  const term = terms.find((t) => t.id === (exam?.termId ?? termId));
  const [v, setV] = useState({
    termId: exam?.termId ?? termId ?? "",
    title: exam?.title ?? "",
    kind: (exam?.kind ?? "MIDTERM") as "DAILY" | "MONTHLY" | "MIDTERM" | "FINAL",
    gradeIds: exam?.gradeIds ?? [],
    branchId: exam?.branchId ?? "",
    startDate: exam ? iso(exam.startDate) : term ? iso(term.startDate) : "",
    endDate: exam ? iso(exam.endDate) : term ? iso(term.startDate) : "",
    instructions: exam?.instructions ?? "",
  });
  const onSuccess = (r: { id: string }) => (toast.success(exam ? "حُفظ الاختبار" : "أُنشئ الاختبار"), void utils.assessment.exams.invalidate(), onClose(), !exam && router.push(`/assessment/exams/${r.id}`));
  const create = trpc.assessment.exams.create.useMutation({ onSuccess, onError: (e) => toast.error(e.message) });
  const update = trpc.assessment.exams.update.useMutation({ onSuccess, onError: (e) => toast.error(e.message) });
  const payload = { ...v, branchId: v.branchId || null, componentKey: exam && exam.kind === v.kind ? exam.componentKey : null, instructions: v.instructions || null };
  const valid = v.title.trim().length >= 2 && v.gradeIds.length > 0 && v.startDate && v.endDate && v.endDate >= v.startDate && v.termId;
  const stages = [...new Set((opts.data?.grades ?? []).map((g) => g.stage))];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={exam ? "تعديل الاختبار" : "دورة اختبار جديدة"} description="يُغذّي الاختبار مكوّن التقييم المقابل (منتصف الفصل ← «اختبار منتصف الفصل»…) عند توليد كشوف الرصد." width={620}>
        <div className="space-y-3 px-5 pb-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="العنوان">
              <Input autoFocus value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="اختبارات منتصف الفصل الأول" />
            </Field>
            <Field label="النوع">
              <Select value={v.kind} onChange={(kind) => setV({ ...v, kind: kind as typeof v.kind })} options={opts.data?.kinds ?? []} />
            </Field>
            <Field label="الفصل الدراسي">
              <Select value={v.termId} onChange={(t) => setV({ ...v, termId: t })} options={terms.map((t) => ({ value: t.id, label: t.name }))} />
            </Field>
            <Field label="الفرع">
              <Select value={v.branchId || "ALL"} onChange={(b) => setV({ ...v, branchId: b === "ALL" ? "" : b })} options={[{ value: "ALL", label: "كل الفروع" }, ...(opts.data?.branches ?? []).map((b) => ({ value: b.id, label: b.name }))]} />
            </Field>
            <Field label="من">
              <Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} />
            </Field>
            <Field label="إلى">
              <Input type="date" value={v.endDate} min={v.startDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} />
            </Field>
          </div>
          <Field label="الصفوف">
            <div className="space-y-2 rounded-md bg-hover/50 p-3">
              {stages.map((s) => (
                <div key={s}>
                  <p className="mb-1 text-[12px] font-medium text-fg-3">{s}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {(opts.data?.grades ?? [])
                      .filter((g) => g.stage === s)
                      .map((g) => (
                        <label key={g.id} className="flex items-center gap-1.5 text-[13px]">
                          <Checkbox checked={v.gradeIds.includes(g.id)} onChange={(on) => setV({ ...v, gradeIds: on ? [...v.gradeIds, g.id] : v.gradeIds.filter((x) => x !== g.id) })} />
                          {g.name}
                        </label>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </Field>
          <Field label="تعليمات للطلاب والمراقبين">
            <Textarea rows={2} value={v.instructions} onChange={(e) => setV({ ...v, instructions: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={!valid} loading={create.isPending || update.isPending} onClick={() => (exam ? update.mutate({ id: exam.id, ...payload }) : create.mutate(payload))}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExamDetailPage({ id }: { id: string }) {
  const q = trpc.assessment.exams.get.useQuery({ id });
  const { terms } = useTermParam();
  const router = useRouter();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<"schedule" | "committees">("schedule");
  const [dialog, setDialog] = useState<null | "edit" | "auto" | "committees" | "delete" | { session: ExamDetail["sessions"][number] | null } | { committee: ExamDetail["committees"][number] }>(null);
  const del = trpc.assessment.exams.delete.useMutation({ onSuccess: () => (toast.success("حُذف الاختبار"), void utils.assessment.exams.invalidate(), router.push("/assessment/exams")), onError: (e) => toast.error(e.message) });
  const d = q.data;
  if (q.error) {
    return (
      <ModuleShell nav={assessmentNav("exams")} title="الاختبار">
        <EmptyState illustration="lock" title="لا يمكن عرض الاختبار" description={q.error.message} />
      </ModuleShell>
    );
  }
  if (!d) {
    return (
      <ModuleShell nav={assessmentNav("exams")} title="الاختبار">
        <SkeletonLines lines={10} />
      </ModuleShell>
    );
  }
  const e = d.exam;
  return (
    <ModuleShell
      nav={assessmentNav("exams")}
      wide
      title={e.title}
      crumbs={[{ title: e.title }]}
      actions={
        d.canManage ? (
          <>
            <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setDialog("edit")}>
              تعديل
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setDialog("delete")}>
              حذف
            </Button>
          </>
        ) : null
      }
    >
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[28px] font-bold leading-tight">{e.title}</h1>
          <Tag color={EXAM_PHASE[e.phase]!.color}>{EXAM_PHASE[e.phase]!.label}</Tag>
          <Tag color="slate">{e.kindLabel}</Tag>
        </div>
        <ExamMeta d={d} />
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={tab} onChange={setTab} options={[{ value: "schedule", label: `الجدول (${d.sessions.length})` }, { value: "committees", label: `اللجان (${d.committees.length})` }]} />
        <div className="ms-auto flex flex-wrap gap-2">
          {d.canManage && tab === "schedule" ? (
            <>
              <Button size="sm" icon={<Wand2 className="size-3.5" />} onClick={() => setDialog("auto")}>
                جدولة تلقائية
              </Button>
              <Button size="sm" variant="primary" icon={<CalendarPlus className="size-3.5" />} onClick={() => setDialog({ session: null })}>
                جلسة
              </Button>
            </>
          ) : null}
          {d.canManage && tab === "committees" ? (
            <Button size="sm" variant="primary" icon={<LayoutGrid className="size-3.5" />} onClick={() => setDialog("committees")}>
              {d.committees.length ? "إعادة توزيع اللجان" : "توزيع اللجان وأرقام الجلوس"}
            </Button>
          ) : null}
        </div>
      </div>
      {tab === "schedule" ? <Schedule d={d} onEdit={(s) => setDialog({ session: s })} /> : <Committees d={d} onEdit={(c) => setDialog({ committee: c })} onAuto={() => setDialog("committees")} />}
      {dialog === "edit" ? <ExamDialog exam={e} termId={e.termId} terms={terms} onClose={() => setDialog(null)} /> : null}
      {dialog === "auto" ? <AutoScheduleDialog examId={e.id} gradeIds={e.gradeIds} hasSessions={d.sessions.length > 0} onClose={() => setDialog(null)} /> : null}
      {dialog === "committees" ? <AutoCommitteesDialog examId={e.id} redo={d.committees.length > 0} onClose={() => setDialog(null)} /> : null}
      {dialog && typeof dialog === "object" && "session" in dialog ? <SessionDialog d={d} session={dialog.session} onClose={() => setDialog(null)} /> : null}
      {dialog && typeof dialog === "object" && "committee" in dialog ? <CommitteeDialog examId={e.id} committee={dialog.committee} onClose={() => setDialog(null)} /> : null}
      <ConfirmDialog open={dialog === "delete"} onOpenChange={(o) => !o && setDialog(null)} title="حذف الاختبار؟" description="يُحذف الجدول واللجان. لا يُحذف اختبار أُنشئت منه كشوف رصد." danger confirmLabel="حذف" loading={del.isPending} onConfirm={() => del.mutate({ id: e.id })} />
    </ModuleShell>
  );
}

function ExamMeta({ d }: { d: ExamDetail }) {
  const fmtDate = useFmtDate();
  const score = useScore();
  const e = d.exam;
  return (
    <p className="mt-1 text-[14px] text-fg-3">
      {e.term} · {e.branch} · {fmtDate(e.startDate)} ← {fmtDate(e.endDate)} · {d.grades.map((g) => g.name).join("، ")} · {formatNumber(d.totals.seats, score.digits)} مقعداً
    </p>
  );
}

function Schedule({ d, onEdit }: { d: ExamDetail; onEdit: (s: ExamDetail["sessions"][number]) => void }) {
  const fmtDate = useFmtDate();
  const score = useScore();
  const utils = trpc.useUtils();
  const sheets = trpc.assessment.exams.createSheets.useMutation({
    onSuccess: (r) => (toast.success(r.created ? `أُنشئ ${formatNumber(r.created, score.digits)} كشف رصد (${formatNumber(r.absences, score.digits)} غياب من المحاضر)` : "الكشوف منشأة مسبقاً"), void utils.assessment.invalidate()),
    onError: (e) => toast.error(e.message),
  });
  const delSession = trpc.assessment.exams.deleteSession.useMutation({ onSuccess: () => void utils.assessment.exams.invalidate(), onError: (e) => toast.error(e.message) });
  if (!d.sessions.length) return <EmptyState illustration="calendar" title="لا جلسات بعد" description="ولّد الجدول تلقائياً من خطط الصفوف (المواد الثقيلة أولاً، جلسة يومياً) أو أضف الجلسات يدوياً." />;
  const days = [...new Set(d.sessions.map((s) => iso(s.date)))];
  return (
    <div className="space-y-4">
      {days.map((day) => (
        <section key={day} className="rounded-lg bg-card shadow-card">
          <h3 className="border-b border-line px-4 py-2 text-[14px] font-semibold">{fmtDate(day, "long")}</h3>
          <div className="overflow-x-auto thin-scroll">
            <table className="w-full min-w-[720px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2">
              <tbody>
                {d.sessions
                  .filter((s) => iso(s.date) === day)
                  .map((s) => (
                    <tr key={s.id}>
                      <td className="w-[90px] tabular text-fg-2">{s.startTime}</td>
                      <td className="w-[160px] font-medium">{s.grade}</td>
                      <td>
                        <Tag color={s.color}>{s.subject}</Tag>
                      </td>
                      <td className="tabular text-fg-3">
                        {formatNumber(s.durationMin, score.digits)} د · من {score.tenths(s.maxTenths)}
                      </td>
                      <td className="text-fg-3">{s.reports ? `${formatNumber(s.reports, score.digits)} محضر · ${formatNumber(s.absent, score.digits)} غائب` : "لا محاضر"}</td>
                      <td>{s.sheets ? <Tag color={s.sheetsApproved === s.sheets ? "green" : "gold"}>{`${formatNumber(s.sheets, score.digits)} كشف${s.sheetsApproved ? ` · ${formatNumber(s.sheetsApproved, score.digits)} معتمد` : ""}`}</Tag> : null}</td>
                      <td className="text-end">
                        {d.canManage ? (
                          <div className="flex justify-end gap-1">
                            <Button size="xs" variant="ghost" icon={<FilePlus2 className="size-3.5" />} loading={sheets.isPending && sheets.variables?.sessionId === s.id} onClick={() => sheets.mutate({ sessionId: s.id })}>
                              {s.sheets ? "استكمال الكشوف" : "كشوف الرصد"}
                            </Button>
                            <Button size="icon-sm" variant="ghost" aria-label="تعديل الجلسة" onClick={() => onEdit(s)}>
                              <Pencil className="size-3.5" />
                            </Button>
                            {!s.sheets ? (
                              <Button size="icon-sm" variant="ghost" aria-label="حذف الجلسة" onClick={() => delSession.mutate({ id: s.id })}>
                                <Trash2 className="size-3.5" />
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function Committees({ d, onEdit, onAuto }: { d: ExamDetail; onEdit: (c: ExamDetail["committees"][number]) => void; onAuto: () => void }) {
  const score = useScore();
  if (!d.committees.length)
    return (
      <EmptyState
        illustration="table"
        title={d.canManage ? "لم تُوزَّع اللجان بعد" : "لا لجان مسندة إليك"}
        description="التوزيع التلقائي يملأ القاعات بسعتها، ويُداخل الصفوف حتى لا يتجاور طالبان من الصف نفسه، ويعيّن المراقبين بالتناوب."
        action={
          d.canManage ? (
            <Button variant="primary" icon={<LayoutGrid className="size-4" />} onClick={onAuto}>
              توزيع اللجان
            </Button>
          ) : undefined
        }
      />
    );
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {d.committees.map((c) => (
        <article key={c.id} className={cn("rounded-lg bg-card p-4 shadow-card", c.mine && "shadow-[0_0_0_2px_var(--navy-600)]")}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-[16px] font-semibold">{c.name}</h3>
              <p className="text-[12px] text-fg-3">
                {c.branch} · {c.room ?? "بلا قاعة"}
              </p>
            </div>
            {c.seatRange ? (
              <span className="rounded-md bg-hover px-2 py-1 text-[12px] tabular">
                {formatNumber(c.seatRange[0]!, score.digits, { useGrouping: false })} – {formatNumber(c.seatRange[1]!, score.digits, { useGrouping: false })}
              </span>
            ) : null}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[13px] text-fg-2">
            <Users className="size-3.5 text-fg-3" /> {c.invigilators.length ? c.invigilators.join("، ") : <span className="text-warning-700">بلا مراقب</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {c.byGrade.map((g) => (
              <Tag key={g.grade} size="sm" color="slate">
                {g.grade} {formatNumber(g.count, score.digits)}
              </Tag>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Link href={`/assessment/exams/committees/${c.id}`}>
              <Button size="xs" icon={<Printer className="size-3.5" />}>
                الكشف والمحضر
              </Button>
            </Link>
            {d.canManage ? (
              <Button size="xs" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => onEdit(c)}>
                القاعة والمراقبون
              </Button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

function AutoScheduleDialog({ examId, gradeIds, hasSessions, onClose }: { examId: string; gradeIds: string[]; hasSessions: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const score = useScore();
  const opts = trpc.assessment.exams.options.useQuery();
  const subjects = [...new Map((opts.data?.grades ?? []).filter((g) => gradeIds.includes(g.id)).flatMap((g) => g.subjects).map((x) => [x.id, x])).values()];
  const [excluded, setExcluded] = useState<string[]>([]);
  const [v, setV] = useState({ startTime: "08:00", durationMin: "90", max: "" });
  const maxTenths = v.max ? parseTenths(v.max) : null;
  const m = trpc.assessment.exams.autoSchedule.useMutation({
    onSuccess: (r) => (toast.success(`جُدولت ${formatNumber(r.sessions, score.digits)} جلسة على ${formatNumber(r.days, score.digits)} أيام`), void utils.assessment.exams.invalidate(), onClose()),
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="جدولة تلقائية" description={`${hasSessions ? "يُستبدل الجدول الحالي. " : ""}تُوزَّع مواد كل صف من خطته على أيام الاختبار (الأحد–الخميس)، المواد الثقيلة أولاً، وجلستان يومياً إن زادت المواد عن الأيام.`}>
        <div className="grid grid-cols-3 gap-3 px-5 pb-4">
          {subjects.length ? (
            <div className="col-span-3">
              <p className="mb-1 text-[13px] font-medium text-fg-3">المواد المختبرة (أزل مواد النشاط كالتربية البدنية والفنية)</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {subjects.map((x) => (
                  <label key={x.id} className="flex items-center gap-1.5 text-[13px]">
                    <Checkbox checked={!excluded.includes(x.id)} onChange={(on) => setExcluded(on ? excluded.filter((e) => e !== x.id) : [...excluded, x.id])} />
                    {x.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <Field label="بداية الجلسة">
            <Input type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} />
          </Field>
          <Field label="المدة (دقيقة)">
            <Input dir="ltr" inputMode="numeric" className="text-end" value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="الدرجة العظمى" hint="فارغ = وزن المكوّن">
            <Input dir="ltr" inputMode="decimal" className="text-end" value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!/^\d{2}:\d{2}$/.test(v.startTime) || Number(v.durationMin) < 10 || (maxTenths !== null && Number.isNaN(maxTenths))} onClick={() => m.mutate({ examId, startTime: v.startTime, durationMin: Number(v.durationMin), maxTenths, excludeSubjectIds: excluded })}>
            توليد الجدول
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AutoCommitteesDialog({ examId, redo, onClose }: { examId: string; redo: boolean; onClose: () => void }) {
  const utils = trpc.useUtils();
  const score = useScore();
  const [v, setV] = useState({ capacity: "20", invigilators: "2", interleave: true, firstSeat: "1001" });
  const m = trpc.assessment.exams.autoCommittees.useMutation({
    onSuccess: (r) => (toast.success(`${formatNumber(r.committees, score.digits)} لجنة و${formatNumber(r.seats, score.digits)} رقم جلوس${r.withoutRoom ? ` — ${formatNumber(r.withoutRoom, score.digits)} لجنة بلا قاعة` : ""}`), void utils.assessment.exams.invalidate(), onClose()),
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="توزيع اللجان وأرقام الجلوس" description={`${redo ? "تُستبدل اللجان الحالية (ما لم تُرفع محاضر). " : ""}تُملأ القاعات حسب سعتها، ويُعيَّن المراقبون من معلمي الفرع بالتناوب ويصلهم إشعار.`}>
        <div className="space-y-3 px-5 pb-4">
          <div className="grid grid-cols-3 gap-3">
            <Field label="سعة اللجنة">
              <Input dir="ltr" inputMode="numeric" className="text-end" value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="مراقبون لكل لجنة">
              <Input dir="ltr" inputMode="numeric" className="text-end" value={v.invigilators} onChange={(e) => setV({ ...v, invigilators: e.target.value.replace(/\D/g, "") })} />
            </Field>
            <Field label="أول رقم جلوس">
              <Input dir="ltr" inputMode="numeric" className="text-end" value={v.firstSeat} onChange={(e) => setV({ ...v, firstSeat: e.target.value.replace(/\D/g, "") })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[14px]">
            <Checkbox checked={v.interleave} onChange={(interleave) => setV({ ...v, interleave })} /> مداخلة الصفوف (طالب من كل صف بالتناوب)
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={Number(v.capacity) < 5 || Number(v.invigilators) < 1} onClick={() => m.mutate({ examId, capacity: Number(v.capacity), invigilatorsPerCommittee: Math.min(4, Number(v.invigilators)), interleaveGrades: v.interleave, firstSeat: Number(v.firstSeat) || null })}>
            توزيع
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SessionDialog({ d, session, onClose }: { d: ExamDetail; session: ExamDetail["sessions"][number] | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const score = useScore();
  const opts = trpc.assessment.exams.options.useQuery();
  const [v, setV] = useState({ gradeId: session?.gradeId ?? d.grades[0]?.id ?? "", subjectId: session?.subjectId ?? "", date: session ? iso(session.date) : iso(d.exam.startDate), startTime: session?.startTime ?? "08:00", durationMin: String(session?.durationMin ?? 90), max: session ? score.tenths(session.maxTenths) : "20" });
  const subjects = (opts.data?.grades ?? []).find((g) => g.id === v.gradeId)?.subjects ?? [];
  const maxTenths = parseTenths(v.max);
  const m = trpc.assessment.exams.saveSession.useMutation({ onSuccess: () => (toast.success("حُفظت الجلسة"), void utils.assessment.exams.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={session ? "تعديل جلسة" : "جلسة اختبار"}>
        <div className="grid grid-cols-2 gap-3 px-5 pb-4">
          <Field label="الصف">
            <Select value={v.gradeId} onChange={(gradeId) => setV({ ...v, gradeId, subjectId: "" })} options={d.grades.map((g) => ({ value: g.id, label: g.name }))} />
          </Field>
          <Field label="المادة">
            <Select value={v.subjectId || undefined} onChange={(subjectId) => setV({ ...v, subjectId })} options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
          </Field>
          <Field label="التاريخ">
            <Input type="date" value={v.date} min={iso(d.exam.startDate)} max={iso(d.exam.endDate)} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </Field>
          <Field label="البداية">
            <Input type="time" value={v.startTime} onChange={(e) => setV({ ...v, startTime: e.target.value })} />
          </Field>
          <Field label="المدة (دقيقة)">
            <Input dir="ltr" inputMode="numeric" className="text-end" value={v.durationMin} onChange={(e) => setV({ ...v, durationMin: e.target.value.replace(/\D/g, "") })} />
          </Field>
          <Field label="الدرجة العظمى">
            <Input dir="ltr" inputMode="decimal" className="text-end" value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} disabled={!v.subjectId || maxTenths === null || Number.isNaN(maxTenths) || Number(v.durationMin) < 10} onClick={() => m.mutate({ examId: d.exam.id, id: session?.id ?? null, gradeId: v.gradeId, subjectId: v.subjectId, date: v.date, startTime: v.startTime, durationMin: Number(v.durationMin), maxTenths: maxTenths! })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommitteeDialog({ examId, committee, onClose }: { examId: string; committee: ExamDetail["committees"][number]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const opts = trpc.assessment.exams.options.useQuery();
  const [v, setV] = useState({ name: committee.name, roomId: committee.roomId ?? "", invigilatorIds: committee.invigilatorIds });
  const m = trpc.assessment.exams.updateCommittee.useMutation({ onSuccess: () => (toast.success("حُفظت اللجنة"), void utils.assessment.exams.get.invalidate({ id: examId }), onClose()), onError: (e) => toast.error(e.message) });
  const teachers: Options["teachers"] = opts.data?.teachers ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`تعديل ${committee.name}`}>
        <div className="space-y-3 px-5 pb-4">
          <Field label="الاسم">
            <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </Field>
          <Field label="القاعة">
            <Select value={v.roomId || "NONE"} onChange={(r) => setV({ ...v, roomId: r === "NONE" ? "" : r })} options={[{ value: "NONE", label: "بلا قاعة" }, ...(opts.data?.rooms ?? []).map((r) => ({ value: r.id, label: `${r.name} (${r.code}) — ${r.capacity}` }))]} />
          </Field>
          <Field label="المراقبون">
            <div className="max-h-[200px] space-y-1 overflow-y-auto rounded-md bg-hover/50 p-2 thin-scroll">
              {teachers.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-[13px]">
                  <Checkbox checked={v.invigilatorIds.includes(t.id)} onChange={(on) => setV({ ...v, invigilatorIds: on ? [...v.invigilatorIds, t.id] : v.invigilatorIds.filter((x) => x !== t.id) })} />
                  {t.name}
                </label>
              ))}
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" loading={m.isPending} onClick={() => m.mutate({ id: committee.id, name: v.name, roomId: v.roomId || null, invigilatorIds: v.invigilatorIds.slice(0, 6) })}>
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------
// كشف اللجنة ومحضر المراقبة
// ---------------------------------------------------------------------

type Sheet = RouterOutputs["assessment"]["exams"]["committee"];

export function CommitteePage({ id }: { id: string }) {
  const q = trpc.assessment.exams.committee.useQuery({ id });
  const fmtDate = useFmtDate();
  const score = useScore();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const d = q.data;
  if (q.error) {
    return (
      <ModuleShell nav={assessmentNav("exams")} title="كشف اللجنة">
        <EmptyState illustration="lock" title="لا يمكن عرض اللجنة" description={q.error.message} />
      </ModuleShell>
    );
  }
  if (!d) {
    return (
      <ModuleShell nav={assessmentNav("exams")} title="كشف اللجنة">
        <SkeletonLines lines={10} />
      </ModuleShell>
    );
  }
  const current = d.sessions.find((s) => s.id === sessionId) ?? null;
  return (
    <ModuleShell
      nav={assessmentNav("exams")}
      title={d.committee.name}
      crumbs={[{ title: d.exam.title, href: `/assessment/exams/${d.exam.id}` }, { title: d.committee.name }]}
      actions={
        <Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>
          طباعة الكشف
        </Button>
      }
    >
      <header className="mb-4">
        <h1 className="text-[26px] font-bold">
          {d.committee.name} — {d.exam.title}
        </h1>
        <p className="mt-1 text-[14px] text-fg-3">
          {d.committee.room ?? "بلا قاعة"} · المراقبون: {d.committee.invigilators.join("، ") || "—"} · {formatNumber(d.seats.length, score.digits)} طالباً
        </p>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <section className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll print:shadow-none">
          <table className="w-full min-w-[520px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-1.5 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
            <thead>
              <tr>
                <th>رقم الجلوس</th>
                <th>الطالب</th>
                <th>الصف / الفصل</th>
                <th className="print:table-cell hidden">التوقيع</th>
              </tr>
            </thead>
            <tbody>
              {d.seats.map((s) => (
                <tr key={s.studentId} className={cn(current?.report?.absent.includes(s.studentId) && "text-danger-700")}>
                  <td className="font-semibold tabular">{formatNumber(s.seatNumber, score.digits, { useGrouping: false })}</td>
                  <td>{s.name}</td>
                  <td className="text-fg-3">
                    {s.grade} / {s.section}
                  </td>
                  <td className="hidden w-[140px] print:table-cell" />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <aside className="no-print space-y-3">
          <h2 className="text-[15px] font-semibold">محاضر الجلسات</h2>
          {!d.sessions.length ? <p className="text-[13px] text-fg-3">لم يُجدول الاختبار بعد.</p> : null}
          {d.sessions.map((s) => (
            <button key={s.id} type="button" onClick={() => setSessionId(s.id)} className={cn("block w-full rounded-lg bg-card px-3 py-2 text-start shadow-card transition-colors hover:bg-hover", sessionId === s.id && "shadow-[0_0_0_2px_var(--navy-600)]")}>
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="font-medium">{s.subject}</span>
                {s.report ? <Tag size="sm" color="green">رُفع المحضر</Tag> : <Tag size="sm" color="gray">لم يُرفع</Tag>}
              </div>
              <p className="text-[12px] text-fg-3">
                {fmtDate(s.date)} · {s.startTime} · {d.seats.filter((x) => x.gradeId === s.gradeId).length} طالباً
              </p>
            </button>
          ))}
        </aside>
      </div>
      {current ? <ReportDialog sheet={d} session={current} onClose={() => setSessionId(null)} /> : null}
    </ModuleShell>
  );
}

function ReportDialog({ sheet, session, onClose }: { sheet: Sheet; session: Sheet["sessions"][number]; onClose: () => void }) {
  const utils = trpc.useUtils();
  const score = useScore();
  const seats = sheet.seats.filter((s) => s.gradeId === session.gradeId);
  const [absent, setAbsent] = useState<string[]>(session.report?.absent ?? []);
  const [incidents, setIncidents] = useState(session.report?.incidents ?? []);
  const [notes, setNotes] = useState(session.report?.notes ?? "");
  const m = trpc.assessment.exams.saveReport.useMutation({ onSuccess: () => (toast.success("حُفظ محضر المراقبة"), void utils.assessment.exams.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`محضر ${session.subject}`} description="الغائبون يُعبّأ لهم «غائب» تلقائياً عند توليد كشوف الرصد." width={600}>
        <div className="space-y-3 px-5 pb-4">
          <p className="text-[13px] font-medium text-fg-3">الغياب ({formatNumber(absent.length, score.digits)})</p>
          <div className="grid max-h-[260px] grid-cols-1 gap-1 overflow-y-auto rounded-md bg-hover/50 p-2 thin-scroll sm:grid-cols-2">
            {seats.map((s) => (
              <label key={s.studentId} className="flex items-center gap-2 text-[13px]">
                <Checkbox checked={absent.includes(s.studentId)} onChange={(on) => setAbsent(on ? [...absent, s.studentId] : absent.filter((x) => x !== s.studentId))} />
                <span className="tabular text-fg-3">{formatNumber(s.seatNumber, score.digits, { useGrouping: false })}</span> {s.name}
              </label>
            ))}
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[13px] font-medium text-fg-3">المخالفات</p>
              <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setIncidents([...incidents, { studentId: seats[0]?.studentId ?? "", kind: "محاولة غش", note: "" }])} disabled={!seats.length}>
                مخالفة
              </Button>
            </div>
            {incidents.map((inc, i) => (
              <div key={i} className="mb-2 grid grid-cols-[1fr_130px_1fr_auto] gap-2">
                <Select size="sm" value={inc.studentId} onChange={(studentId) => setIncidents(incidents.map((x, j) => (j === i ? { ...x, studentId } : x)))} options={seats.map((s) => ({ value: s.studentId, label: s.name }))} />
                <Select size="sm" value={inc.kind} onChange={(kind) => setIncidents(incidents.map((x, j) => (j === i ? { ...x, kind } : x)))} options={["محاولة غش", "حيازة جوال", "إخلال بالنظام", "تأخر عن الجلسة", "أخرى"].map((k) => ({ value: k, label: k }))} />
                <Input className="h-7 text-[13px]" placeholder="وصف" value={inc.note} onChange={(e) => setIncidents(incidents.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} />
                <Button size="icon-sm" variant="ghost" aria-label="حذف المخالفة" onClick={() => setIncidents(incidents.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <Field label="ملاحظات المراقب">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" icon={<ChevronLeft className="size-3.5" />} loading={m.isPending} onClick={() => m.mutate({ sessionId: session.id, committeeId: sheet.committee.id, absentStudentIds: absent, incidents: incidents.filter((x) => x.studentId), notes: notes || null })}>
            رفع المحضر
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
