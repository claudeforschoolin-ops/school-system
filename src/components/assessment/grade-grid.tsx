"use client";
/**
 * رصد الدرجات: قائمة الكشوف، وجدول كالإكسل (أسهم/Tab/Enter، لصق من Excel، تحقق فوري من العظمى،
 * حفظ تلقائي)، ومسار الاعتماد (إرسال ← مراجعة ← اعتماد/إعادة)، وطلبات تعديل الدرجات المعتمدة.
 */
import { BarChart3, Check, CheckCheck, ChevronLeft, Download, Lock, MoreHorizontal, Pencil, Plus, Send, Trash2, Undo2, FileWarning } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { componentBp, parseTenths, subjectResult, bandFor, type GradeBand } from "@/lib/assessment/calc";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { Checkbox } from "@/components/ui/checkbox";
import { useApp } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { Meter } from "@/components/academic/common";
import { downloadCsv, useFmtDate } from "@/components/finance/common";
import { assessmentNav, CHANGE_STATUS, scoreTone, SHEET_STATUS, TermPicker, useScore, useTermParam } from "./common";

type Book = RouterOutputs["assessment"]["grades"]["book"];
type Col = Book["assessments"][number];

// ---------------------------------------------------------------------
// قائمة الكشوف
// ---------------------------------------------------------------------

export function GradesHome() {
  const { termId, terms, setTerm } = useTermParam();
  const score = useScore();
  const fmtDate = useFmtDate();
  const [mineOnly, setMineOnly] = useState(true);
  const sheets = trpc.assessment.grades.sheets.useQuery({ termId: termId ?? "" }, { enabled: Boolean(termId) });
  const pending = trpc.assessment.grades.pending.useQuery();
  const rows = sheets.data ?? [];
  const hasMine = rows.some((r) => r.mine);
  const list = hasMine && mineOnly ? rows.filter((r) => r.mine) : rows;
  return (
    <ModuleShell nav={assessmentNav("grades")} wide actions={<TermPicker value={termId} terms={terms} onChange={setTerm} />}>
      {pending.data?.length ? (
        <section className="mb-6 rounded-lg bg-card p-4 shadow-card">
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
            <CheckCheck className="size-4 text-fg-3" /> بانتظار قرارك ({formatNumber(pending.data.length, score.digits)})
          </h2>
          <ul className="divide-y divide-line/60">
            {pending.data.slice(0, 12).map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 text-[14px]">
                <Link href={`/assessment/grades/${p.sectionId}/${p.subjectId}?term=${p.termId}`} className="font-medium hover:underline">
                  {p.subject} — {p.section}
                </Link>
                <span className="text-fg-3">«{p.title}»</span>
                <Tag color={SHEET_STATUS[p.status]!.color}>{SHEET_STATUS[p.status]!.label}</Tag>
                <span className="ms-auto text-[12px] text-fg-3">{fmtDate(p.submittedAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-semibold">كشوف الرصد</h2>
        {hasMine ? (
          <label className="flex items-center gap-2 text-[13px] text-fg-2">
            <Checkbox checked={mineOnly} onChange={setMineOnly} /> موادي فقط
          </label>
        ) : null}
      </div>
      {sheets.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الكشوف" description={sheets.error.message} />
      ) : !sheets.data ? (
        <SkeletonLines lines={8} />
      ) : !list.length ? (
        <EmptyState illustration="table" title="لا كشوف رصد لك في هذا الفصل" description="تظهر هنا المواد المسندة إليك في «تعيين المعلمين» أو التي ترأس قسمها." />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
          <table className="w-full min-w-[760px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
            <thead>
              <tr>
                <th>الفصل</th>
                <th>المادة</th>
                <th>المعلم</th>
                <th>البنود</th>
                <th>الحالة</th>
                <th className="w-[180px]">اكتمال الرصد</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={`${r.sectionId}:${r.subject.id}`} className="hover:bg-hover/60">
                  <td className="font-medium">
                    {r.section}
                    <span className="ms-2 text-[12px] font-normal text-fg-3">{r.branch}</span>
                  </td>
                  <td>
                    <Tag color={r.subject.color}>{r.subject.name}</Tag>
                  </td>
                  <td className="text-fg-2">{r.teacher ?? "—"}</td>
                  <td className="tabular">{formatNumber(r.assessments, score.digits)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(Object.keys(r.byStatus) as Array<keyof typeof r.byStatus>)
                        .filter((k) => r.byStatus[k])
                        .map((k) => (
                          <Tag key={k} size="sm" color={SHEET_STATUS[k]!.color}>
                            {SHEET_STATUS[k]!.label} {formatNumber(r.byStatus[k], score.digits)}
                          </Tag>
                        ))}
                      {!r.assessments ? <span className="text-fg-3">لم تُنشأ بنود</span> : null}
                    </div>
                  </td>
                  <td>
                    <Meter value={Math.round(r.completionBp / 100)} max={100} warnAt={2} />
                  </td>
                  <td className="text-end">
                    <Link href={`/assessment/grades/${r.sectionId}/${r.subject.id}?term=${termId}`}>
                      <Button size="xs" variant="ghost" icon={<ChevronLeft className="size-3.5" />}>
                        فتح الكشف
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// جدول الرصد
// ---------------------------------------------------------------------

type Parsed = { ok: true; scoreTenths: number | null; absent: boolean; excused: boolean } | { ok: false; error: string };

/** تحليل خلية: رقم بفاصلة عشرية واحدة، أو «غ» غائب، أو «ع» غياب بعذر، أو فارغ */
export function parseCell(text: string, maxTenths: number): Parsed {
  const t = text.trim();
  if (!t) return { ok: true, scoreTenths: null, absent: false, excused: false };
  if (/^(غ|غائب|a)$/i.test(t)) return { ok: true, scoreTenths: null, absent: true, excused: false };
  if (/^(ع|عذر|e)$/i.test(t)) return { ok: true, scoreTenths: null, absent: false, excused: true };
  const v = parseTenths(t);
  if (v === null) return { ok: true, scoreTenths: null, absent: false, excused: false };
  if (Number.isNaN(v)) return { ok: false, error: "قيمة غير صالحة: رقم بخانة عشرية واحدة، أو «غ» للغياب، أو «ع» للعذر" };
  if (v > maxTenths) return { ok: false, error: "أعلى من الدرجة العظمى" };
  return { ok: true, scoreTenths: v, absent: false, excused: false };
}

function markText(m: { scoreTenths: number | null; absent: boolean; excused: boolean } | undefined, fmt: (t: number) => string) {
  if (!m) return "";
  if (m.absent) return "غ";
  if (m.excused) return "ع";
  return m.scoreTenths === null ? "" : fmt(m.scoreTenths);
}

export function GradeBookPage({ sectionId, subjectId }: { sectionId: string; subjectId: string }) {
  const { termId, terms, setTerm } = useTermParam();
  const utils = trpc.useUtils();
  const score = useScore();
  const key = useMemo(() => ({ sectionId, subjectId, termId: termId ?? "" }), [sectionId, subjectId, termId]);
  const q = trpc.assessment.grades.book.useQuery(key, { enabled: Boolean(termId) });
  const changes = trpc.assessment.grades.changeRequests.useQuery(key, { enabled: Boolean(termId) && Boolean(q.data) });
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});
  const [dialog, setDialog] = useState<null | { kind: "new" } | { kind: "edit"; col: Col } | { kind: "return"; ids: string[] } | { kind: "change"; col: Col; studentId: string } | { kind: "analysis"; col: Col }>(null);
  const [focus, setFocus] = useState<{ r: number; c: number } | null>(null);
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const book = q.data;
  const onError = (e: { message: string }) => toast.error(e.message);
  const refresh = () => void utils.assessment.grades.invalidate();
  const save = trpc.assessment.grades.saveMarks.useMutation({ onError });
  const transition = trpc.assessment.grades.transition.useMutation({
    onSuccess: (r) => (toast.success(`حُدّثت ${formatNumber(r.updated, score.digits)} بنود`), refresh()),
    onError,
  });
  const del = trpc.assessment.grades.deleteAssessment.useMutation({ onSuccess: () => (toast.success("حُذف البند"), refresh()), onError });

  const cols = useMemo(() => {
    if (!book) return [] as Col[];
    const order = book.scheme.components.map((c) => c.key);
    return [...book.assessments].sort((a, b) => order.indexOf(a.componentKey) - order.indexOf(b.componentKey));
  }, [book]);
  const editable = (c: Col) => Boolean(book?.permissions.canEdit) && c.status === "DRAFT";
  const cellText = useCallback(
    (c: Col, studentId: string) => edits[c.id]?.[studentId] ?? markText(c.marks[studentId], (t) => score.tenths(t)),
    [edits, score],
  );

  // الحفظ التلقائي بعد توقف الكتابة
  const pendingCount = Object.values(edits).reduce((n, m) => n + Object.keys(m).length, 0);
  const saveAll = useCallback(async () => {
    if (!book) return;
    const snapshot = edits;
    let bad = 0;
    for (const [aid, cells] of Object.entries(snapshot)) {
      const col = book.assessments.find((a) => a.id === aid);
      if (!col || col.status !== "DRAFT") continue;
      const marks: Array<{ studentId: string; scoreTenths: number | null; absent: boolean; excused: boolean }> = [];
      for (const [sid, text] of Object.entries(cells)) {
        const p = parseCell(text, col.maxTenths);
        if (!p.ok) {
          bad += 1;
          continue;
        }
        marks.push({ studentId: sid, scoreTenths: p.scoreTenths, absent: p.absent, excused: p.excused });
      }
      if (!marks.length) continue;
      await save.mutateAsync({ assessmentId: aid, marks });
      setEdits((cur) => {
        const next = { ...cur, [aid]: { ...cur[aid] } };
        for (const m of marks) if (next[aid]![m.studentId] === snapshot[aid]![m.studentId]) delete next[aid]![m.studentId];
        if (!Object.keys(next[aid]!).length) delete next[aid];
        return next;
      });
    }
    await utils.assessment.grades.book.invalidate(key);
    if (bad) toast.error(`${formatNumber(bad, score.digits)} خلية غير صالحة لم تُحفظ`);
  }, [book, edits, save, utils, key, score.digits]);
  const saveRef = useRef(saveAll);
  useEffect(() => {
    saveRef.current = saveAll;
  }, [saveAll]);
  useEffect(() => {
    if (!pendingCount) return;
    const t = setTimeout(() => void saveRef.current().catch(() => undefined), 1200);
    return () => clearTimeout(t);
  }, [edits, pendingCount]);

  const setCell = (c: Col, studentId: string, text: string) => setEdits((cur) => ({ ...cur, [c.id]: { ...cur[c.id], [studentId]: text } }));

  const move = (r: number, c: number) => {
    if (!book) return;
    const rr = Math.max(0, Math.min(book.students.length - 1, r));
    const cc = Math.max(0, Math.min(cols.length - 1, c));
    const el = inputs.current.get(`${rr}:${cc}`);
    if (el) {
      el.focus();
      el.select();
    }
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>, r: number, c: number) => {
    // الاتجاه من اليمين لليسار: السهم الأيسر للعمود التالي
    const map: Record<string, [number, number]> = { ArrowDown: [1, 0], ArrowUp: [-1, 0], ArrowLeft: [0, 1], ArrowRight: [0, -1], Enter: [e.shiftKey ? -1 : 1, 0] };
    const d = map[e.key];
    if (!d) return;
    const input = e.currentTarget;
    const atEdge = e.key === "ArrowLeft" ? input.selectionStart === input.value.length : e.key === "ArrowRight" ? input.selectionStart === 0 : true;
    if (!atEdge && input.selectionStart !== input.selectionEnd) return;
    if (!atEdge) return;
    e.preventDefault();
    move(r + d[0], c + d[1]);
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>, r: number, c: number) => {
    if (!book) return;
    const text = e.clipboardData.getData("text/plain");
    if (!/[\t\n]/.test(text.trim())) return;
    e.preventDefault();
    const grid = text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t"));
    let applied = 0;
    let skipped = 0;
    setEdits((cur) => {
      const next = { ...cur };
      grid.forEach((line, i) => {
        const st = book.students[r + i];
        if (!st) return;
        line.forEach((val, j) => {
          const col = cols[c + j];
          if (!col) return;
          if (!editable(col)) {
            skipped += 1;
            return;
          }
          next[col.id] = { ...next[col.id], [st.id]: val.trim() };
          applied += 1;
        });
      });
      return next;
    });
    setTimeout(() => toast.success(`لُصقت ${formatNumber(applied, score.digits)} خلية${skipped ? ` (تُجوهلت ${formatNumber(skipped, score.digits)} في بنود مقفلة)` : ""}`), 0);
  };

  // النتيجة الحية لكل طالب من القيم المعروضة
  const live = useMemo(() => {
    const out: Record<string, { comps: Record<string, number | null>; bp: number | null; missing: number }> = {};
    if (!book) return out;
    for (const st of book.students) {
      const comps: Record<string, number | null> = {};
      for (const comp of book.scheme.components) {
        comps[comp.key] = componentBp(
          cols
            .filter((c) => c.componentKey === comp.key)
            .map((c) => {
              const p = parseCell(cellText(c, st.id), c.maxTenths);
              return p.ok ? { maxTenths: c.maxTenths, scoreTenths: p.scoreTenths, absent: p.absent, excused: p.excused } : { maxTenths: c.maxTenths, scoreTenths: null };
            }),
        );
      }
      const r = subjectResult(book.scheme.components, comps);
      out[st.id] = { comps, bp: r.bp, missing: r.missing.length };
    }
    return out;
  }, [book, cols, cellText]);

  if (q.error) {
    return (
      <ModuleShell nav={assessmentNav("grades")} title="كشف الرصد">
        <EmptyState illustration="lock" title="لا يمكن فتح الكشف" description={q.error.message} />
      </ModuleShell>
    );
  }
  if (!book) {
    return (
      <ModuleShell nav={assessmentNav("grades")} title="كشف الرصد">
        <SkeletonLines lines={14} />
      </ModuleShell>
    );
  }
  const perms = book.permissions;
  const byStatus = (s: string) => cols.filter((c) => c.status === s).map((c) => c.id);
  const returned = cols.filter((c) => c.status === "DRAFT" && c.returnNote);
  const exportCsv = () =>
    downloadCsv(`${book.subject.name}-${book.section.grade}-${book.section.name}.csv`, [
      ["الطالب", "الرقم الأكاديمي", ...cols.map((c) => `${c.title} (${score.tenths(c.maxTenths)})`), "الدرجة ٪"],
      ...book.students.map((st) => [st.fullName, st.academicNumber, ...cols.map((c) => cellText(c, st.id)), live[st.id]?.bp === null || live[st.id]?.bp === undefined ? "" : score.pct(live[st.id]!.bp)]),
    ]);

  const actions = (
    <>
      <TermPicker value={termId} terms={terms} onChange={setTerm} />
      {perms.canEdit ? (
        <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setDialog({ kind: "new" })}>
          بند تقييم
        </Button>
      ) : null}
    </>
  );
  return (
    <ModuleShell nav={assessmentNav("grades")} wide title={`${book.subject.name} — ${book.section.grade} / ${book.section.name}`} crumbs={[{ title: `${book.subject.name} — ${book.section.grade} / ${book.section.name}` }]} actions={actions}>
      <header className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <h1 className="text-[26px] font-bold leading-tight">
            {book.subject.name} <span className="text-fg-3">—</span> {book.section.grade} / {book.section.name}
          </h1>
          <p className="mt-1 text-[14px] text-fg-3">
            {book.term.name} · {book.term.year} · {book.section.branch} · المعلم: {book.teacher?.name ?? "غير مسند"}
          </p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
          <span aria-live="polite" className={cn("rounded-full px-2 py-0.5", pendingCount ? "bg-warning-50 text-warning-700" : "bg-hover")}>
            {save.isPending ? "جارٍ الحفظ…" : pendingCount ? `${formatNumber(pendingCount, score.digits)} تعديل غير محفوظ` : "كل التعديلات محفوظة"}
          </span>
          {pendingCount ? (
            <Button size="xs" onClick={() => void saveAll()}>
              حفظ الآن
            </Button>
          ) : null}
          <Button size="xs" variant="ghost" icon={<Download className="size-3.5" />} onClick={exportCsv}>
            تصدير
          </Button>
        </div>
      </header>

      {returned.length ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-warning-50 px-4 py-3 text-[14px] text-warning-700" role="status">
          <FileWarning className="mt-0.5 size-4 shrink-0" />
          <div>
            {returned.map((c) => (
              <p key={c.id}>
                أُعيد «{c.title}» للتعديل: {c.returnNote}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <div className="no-print mb-3 flex flex-wrap items-center gap-2">
        {perms.canEdit && byStatus("DRAFT").length ? (
          <Button size="sm" icon={<Send className="size-3.5" />} loading={transition.isPending} disabled={pendingCount > 0} onClick={() => transition.mutate({ ids: byStatus("DRAFT"), action: "SUBMIT" })}>
            إرسال المسودات للاعتماد ({formatNumber(byStatus("DRAFT").length, score.digits)})
          </Button>
        ) : null}
        {perms.canReview && perms.headUserId && byStatus("SUBMITTED").length ? (
          <Button size="sm" icon={<Check className="size-3.5" />} loading={transition.isPending} onClick={() => transition.mutate({ ids: byStatus("SUBMITTED"), action: "REVIEW" })}>
            مراجعة المرسل ({formatNumber(byStatus("SUBMITTED").length, score.digits)})
          </Button>
        ) : null}
        {perms.canApprove && [...byStatus("REVIEWED"), ...(perms.headUserId ? [] : byStatus("SUBMITTED"))].length ? (
          <Button size="sm" variant="primary" icon={<CheckCheck className="size-3.5" />} loading={transition.isPending} onClick={() => transition.mutate({ ids: [...byStatus("REVIEWED"), ...(perms.headUserId ? [] : byStatus("SUBMITTED"))], action: "APPROVE" })}>
            اعتماد وقفل ({formatNumber([...byStatus("REVIEWED"), ...(perms.headUserId ? [] : byStatus("SUBMITTED"))].length, score.digits)})
          </Button>
        ) : null}
        {perms.canReview && [...byStatus("SUBMITTED"), ...byStatus("REVIEWED")].length ? (
          <Button size="sm" variant="ghost" icon={<Undo2 className="size-3.5" />} onClick={() => setDialog({ kind: "return", ids: [...byStatus("SUBMITTED"), ...byStatus("REVIEWED")] })}>
            إعادة للمعلم
          </Button>
        ) : null}
        <span className="ms-auto text-[12px] text-fg-3">الأسهم وEnter للتنقل · الصق من Excel مباشرة · «غ» غائب · «ع» غياب بعذر</span>
      </div>

      {!book.students.length ? (
        <EmptyState illustration="table" title="لا طلاب في هذا الفصل" description="وزّع الطلاب على الفصل من «الصفوف والفصول» أولاً." />
      ) : !cols.length ? (
        <EmptyState
          illustration="table"
          title="لا بنود تقييم بعد"
          description={`أضف بنود التقييم (${book.scheme.components.map((c) => `${c.name} ${formatNumber(c.weight, score.digits)}٪`).join("، ")}) ثم ارصد الدرجات.`}
          action={
            perms.canEdit ? (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setDialog({ kind: "new" })}>
                أول بند تقييم
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
          <table className="border-separate border-spacing-0 text-[13px]" role="grid" aria-label="جدول رصد الدرجات">
            <thead className="text-fg-3">
              <tr>
                <th rowSpan={2} className="sticky start-0 z-20 min-w-[200px] border-b border-e border-line bg-card px-3 py-2 text-start font-medium">
                  الطالب
                </th>
                {book.scheme.components.map((comp) => {
                  const n = cols.filter((c) => c.componentKey === comp.key).length;
                  return n ? (
                    <th key={comp.key} colSpan={n} className="border-b border-e border-line/60 px-2 py-1.5 text-center text-[12px] font-medium">
                      {comp.name} <span className="tabular text-fg-3">({formatNumber(comp.weight, score.digits)}٪)</span>
                    </th>
                  ) : null;
                })}
                <th rowSpan={2} className="border-b border-line px-3 py-2 text-center font-medium">
                  درجة المادة
                </th>
              </tr>
              <tr>
                {cols.map((c) => (
                  <th key={c.id} className="min-w-[96px] border-b border-e border-line/60 px-1 py-1 align-bottom font-normal">
                    <div className="flex items-start gap-1">
                      <div className="min-w-0 flex-1 text-center">
                        <div className="truncate text-[12px] font-medium text-fg-2" title={c.title}>
                          {c.status !== "DRAFT" ? <Lock className="me-0.5 inline size-3" aria-label="مقفل" /> : null}
                          {c.title}
                        </div>
                        <div className="text-[11px] tabular">من {score.tenths(c.maxTenths)}</div>
                        <Tag size="sm" dot={false} color={SHEET_STATUS[c.status]!.color} className="mt-0.5">
                          {SHEET_STATUS[c.status]!.label.split(" ")[0]}
                        </Tag>
                      </div>
                      <ColumnMenu
                        col={c}
                        perms={perms}
                        onEdit={() => setDialog({ kind: "edit", col: c })}
                        onDelete={() => del.mutate({ id: c.id })}
                        onAnalysis={() => setDialog({ kind: "analysis", col: c })}
                        onAction={(action) => (action === "RETURN" ? setDialog({ kind: "return", ids: [c.id] }) : transition.mutate({ ids: [c.id], action }))}
                        pendingEdits={Boolean(edits[c.id])}
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {book.students.map((st, r) => {
                const res = live[st.id];
                return (
                  <tr key={st.id} className={cn(focus?.r === r && "bg-hover/50")}>
                    <th scope="row" className="sticky start-0 z-10 border-b border-e border-line/60 bg-card px-3 py-1 text-start font-normal">
                      <span className="block truncate font-medium text-fg">{st.fullName}</span>
                      <span className="text-[11px] tabular text-fg-3">{st.academicNumber}</span>
                    </th>
                    {cols.map((c, ci) => {
                      const text = cellText(c, st.id);
                      const p = parseCell(text, c.maxTenths);
                      const canEdit = editable(c);
                      const dirty = edits[c.id]?.[st.id] !== undefined;
                      return (
                        <td key={c.id} className={cn("border-b border-e border-line/60 p-0", focus?.c === ci && "bg-hover/40")}>
                          {canEdit ? (
                            <input
                              ref={(el) => {
                                if (el) inputs.current.set(`${r}:${ci}`, el);
                                else inputs.current.delete(`${r}:${ci}`);
                              }}
                              dir="ltr"
                              inputMode="decimal"
                              aria-label={`${st.fullName} — ${c.title}`}
                              aria-invalid={!p.ok}
                              title={!p.ok ? p.error : undefined}
                              value={text}
                              onChange={(e) => setCell(c, st.id, e.target.value)}
                              onKeyDown={(e) => onKey(e, r, ci)}
                              onPaste={(e) => onPaste(e, r, ci)}
                              onFocus={(e) => (setFocus({ r, c: ci }), e.currentTarget.select())}
                              onBlur={() => setFocus(null)}
                              className={cn(
                                "h-9 w-full bg-transparent px-2 text-center tabular outline-none transition-colors focus:bg-card focus:shadow-[inset_0_0_0_2px_var(--navy-600)]",
                                !p.ok && "bg-danger-50 text-danger-700 shadow-[inset_0_0_0_1px_var(--danger-700)]",
                                p.ok && p.absent && "text-danger-700",
                                p.ok && p.excused && "text-fg-3",
                                dirty && p.ok && "bg-warning-50/50",
                              )}
                            />
                          ) : (
                            <button
                              type="button"
                              disabled={!(c.status === "APPROVED" && (perms.canEdit || perms.canApprove))}
                              onClick={() => setDialog({ kind: "change", col: c, studentId: st.id })}
                              title={c.status === "APPROVED" ? "درجة معتمدة: انقر لطلب تعديل" : "البند مرسل للاعتماد"}
                              className={cn("h-9 w-full px-2 text-center tabular text-fg-2 enabled:hover:bg-hover disabled:cursor-default", p.ok && p.absent && "text-danger-700")}
                            >
                              {text || "—"}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-b border-line/60 px-3 text-center">
                      <span className={cn("font-semibold tabular", scoreTone(res?.bp, book.scheme.passBp))}>{score.pct(res?.bp ?? null)}</span>
                      {res && res.bp !== null ? <span className="ms-1.5 text-[11px] text-fg-3">{bandFor(res.bp, book.scheme.bands as GradeBand[])?.label}</span> : null}
                      {res?.missing ? <span className="block text-[10px] text-fg-3">ناقص {formatNumber(res.missing, score.digits)} مكوّن</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {changes.data?.length ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[15px] font-semibold">طلبات تعديل الدرجات المعتمدة</h2>
          <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
            <table className="w-full min-w-[640px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
              <thead>
                <tr>
                  <th>الرقم</th>
                  <th>الطالب</th>
                  <th>البند</th>
                  <th>من ← إلى</th>
                  <th>السبب</th>
                  <th>مقدم الطلب</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {changes.data.map((c) => (
                  <tr key={c.id}>
                    <td className="tabular">{formatNumber(c.number, score.digits, { useGrouping: false })}</td>
                    <td>{c.student}</td>
                    <td>{c.assessment.title}</td>
                    <td className="tabular">
                      {c.oldAbsent ? "غ" : (score.tenths(c.oldTenths) || "—")} ← {c.newAbsent ? "غ" : (score.tenths(c.newTenths) || "—")}
                    </td>
                    <td className="max-w-[260px] truncate" title={c.reason}>
                      {c.reason}
                    </td>
                    <td>{c.requestedBy ?? "—"}</td>
                    <td>
                      <Tag color={CHANGE_STATUS[c.status]?.color ?? "gray"}>{CHANGE_STATUS[c.status]?.label ?? c.status}</Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {dialog?.kind === "new" || dialog?.kind === "edit" ? <AssessmentDialog book={book} col={dialog.kind === "edit" ? dialog.col : null} termId={termId!} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "return" ? <ReturnDialog ids={dialog.ids} onClose={() => setDialog(null)} onDone={refresh} /> : null}
      {dialog?.kind === "change" ? <ChangeDialog col={dialog.col} student={book.students.find((s) => s.id === dialog.studentId)!} onClose={() => setDialog(null)} onDone={refresh} /> : null}
      {dialog?.kind === "analysis" ? <AnalysisDialog col={dialog.col} onClose={() => setDialog(null)} /> : null}
    </ModuleShell>
  );
}

function ColumnMenu({ col, perms, onEdit, onDelete, onAction, onAnalysis, pendingEdits }: { col: Col; perms: Book["permissions"]; onEdit: () => void; onDelete: () => void; onAction: (a: "SUBMIT" | "REVIEW" | "APPROVE" | "RETURN") => void; onAnalysis: () => void; pendingEdits: boolean }) {
  const s = col.status;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="no-print grid size-6 shrink-0 place-items-center rounded text-fg-3 hover:bg-hover hover:text-fg" aria-label={`إجراءات ${col.title}`}>
          <MoreHorizontal className="size-3.5" />
        </button>
      </MenuTrigger>
      <MenuContent>
        {perms.canEdit && s === "DRAFT" ? (
          <>
            <MenuItem icon={<Pencil className="size-3.5" />} onSelect={onEdit}>
              تعديل البند
            </MenuItem>
            <MenuItem icon={<Send className="size-3.5" />} disabled={pendingEdits} onSelect={() => onAction("SUBMIT")}>
              إرسال للاعتماد
            </MenuItem>
          </>
        ) : null}
        {perms.canReview && perms.headUserId && s === "SUBMITTED" ? (
          <MenuItem icon={<Check className="size-3.5" />} onSelect={() => onAction("REVIEW")}>
            مراجعة (رئيس القسم)
          </MenuItem>
        ) : null}
        {perms.canApprove && (s === "REVIEWED" || (s === "SUBMITTED" && !perms.headUserId)) ? (
          <MenuItem icon={<CheckCheck className="size-3.5" />} onSelect={() => onAction("APPROVE")}>
            اعتماد وقفل
          </MenuItem>
        ) : null}
        {perms.canReview && (s === "SUBMITTED" || s === "REVIEWED") ? (
          <MenuItem icon={<Undo2 className="size-3.5" />} onSelect={() => onAction("RETURN")}>
            إعادة للمعلم
          </MenuItem>
        ) : null}
        <MenuItem icon={<BarChart3 className="size-3.5" />} onSelect={onAnalysis}>
          تحليل البند
        </MenuItem>
        {perms.canEdit && s === "DRAFT" ? (
          <>
            <MenuSeparator />
            <MenuItem danger icon={<Trash2 className="size-3.5" />} onSelect={onDelete}>
              حذف البند ودرجاته
            </MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}

function AssessmentDialog({ book, col, termId, onClose }: { book: Book; col: Col | null; termId: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const score = useScore();
  const [v, setV] = useState({ componentKey: col?.componentKey ?? book.scheme.components[0]!.key, title: col?.title ?? "", max: col ? score.tenths(col.maxTenths) : "10", date: col?.date ? new Date(col.date).toISOString().slice(0, 10) : "" });
  const maxTenths = parseTenths(v.max);
  const onSuccess = () => (toast.success(col ? "عُدّل البند" : "أُضيف البند"), void utils.assessment.grades.invalidate(), onClose());
  const create = trpc.assessment.grades.createAssessment.useMutation({ onSuccess, onError: (e) => toast.error(e.message) });
  const update = trpc.assessment.grades.updateAssessment.useMutation({ onSuccess, onError: (e) => toast.error(e.message) });
  const valid = v.title.trim().length >= 2 && maxTenths !== null && !Number.isNaN(maxTenths) && maxTenths > 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={col ? "تعديل بند التقييم" : "بند تقييم جديد"} description="يُحتسب البند ضمن مكوّنه بنسبة درجته إلى عظماه، ويُوزن المكوّن حسب نظام التقييم.">
        <div className="space-y-3 px-5 pb-4">
          <Field label="المكوّن">
            <Select value={v.componentKey} onChange={(componentKey) => setV({ ...v, componentKey })} options={book.scheme.components.map((c) => ({ value: c.key, label: `${c.name} (${c.weight}٪)` }))} />
          </Field>
          <Field label="العنوان">
            <Input autoFocus value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="مثال: اختبار قصير ١ — الكسور" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الدرجة العظمى" error={v.max && (maxTenths === null || Number.isNaN(maxTenths)) ? "رقم بخانة عشرية واحدة" : null}>
              <Input dir="ltr" inputMode="decimal" className="text-end tabular" value={v.max} onChange={(e) => setV({ ...v, max: e.target.value })} />
            </Field>
            <Field label="التاريخ">
              <Input type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            loading={create.isPending || update.isPending}
            onClick={() =>
              col
                ? update.mutate({ id: col.id, title: v.title, maxTenths: maxTenths!, componentKey: v.componentKey, date: v.date || null })
                : create.mutate({ sectionId: book.section.id, subjectId: book.subject.id, termId, componentKey: v.componentKey, title: v.title, maxTenths: maxTenths!, date: v.date || null })
            }
          >
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDialog({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const m = trpc.assessment.grades.transition.useMutation({ onSuccess: () => (toast.success("أُعيدت البنود للمعلم"), onDone(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="إعادة الدرجات للمعلم" description="تعود البنود مسودةً قابلة للتعديل، ويصل المعلمَ إشعار بالسبب.">
        <div className="px-5 pb-4">
          <Field label="سبب الإعادة">
            <Textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثال: درجات الطالب … تحتاج مراجعة" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={note.trim().length < 3} loading={m.isPending} onClick={() => m.mutate({ ids, action: "RETURN", note })}>
            إعادة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangeDialog({ col, student, onClose, onDone }: { col: Col; student: Book["students"][number]; onClose: () => void; onDone: () => void }) {
  const score = useScore();
  const current = col.marks[student.id];
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const p = parseCell(text, col.maxTenths);
  const m = trpc.assessment.grades.requestChange.useMutation({ onSuccess: () => (toast.success("أُرسل طلب التعديل لاعتماد المدير"), onDone(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="طلب تعديل درجة معتمدة" description={`${student.fullName} — «${col.title}». لا يُطبّق التعديل إلا بعد موافقة المدير، ويُسجَّل في سجل التدقيق بالقيمتين.`}>
        <div className="space-y-3 px-5 pb-4">
          <p className="text-[14px]">
            الدرجة الحالية: <b className="tabular">{markText(current, (t) => score.tenths(t)) || "—"}</b> من {score.tenths(col.maxTenths)}
          </p>
          <Field label="الدرجة الجديدة (أو «غ» للغياب)" error={text && !p.ok ? p.error : null}>
            <Input autoFocus dir="ltr" className="text-end tabular" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Field label="السبب">
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: خطأ في جمع درجات ورقة الإجابة بعد التظلم" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={!text.trim() || !p.ok || p.excused || reason.trim().length < 5} loading={m.isPending} onClick={() => p.ok && m.mutate({ assessmentId: col.id, studentId: student.id, newTenths: p.scoreTenths, newAbsent: p.absent, reason })}>
            إرسال الطلب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AnalysisDialog({ col, onClose }: { col: { id: string; title: string }; onClose: () => void }) {
  const q = trpc.assessment.grades.itemAnalysis.useQuery({ assessmentId: col.id });
  const score = useScore();
  const d = q.data;
  const max = d ? Math.max(1, ...d.histogram.map((h) => h.count)) : 1;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={`تحليل البند: ${col.title}`} width={620} description="معامل السهولة = المتوسط ÷ العظمى، ومعامل التمييز = (متوسط أعلى ٢٧٪ − أدنى ٢٧٪ حسب درجة المادة) ÷ العظمى.">
        <div className="px-5 pb-5">
          {q.error ? (
            <p className="text-[14px] text-danger-700">{q.error.message}</p>
          ) : !d ? (
            <SkeletonLines lines={5} />
          ) : !d.stats ? (
            <p className="text-[14px] text-fg-3">لا درجات مرصودة بعد لهذا البند.</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["عدد الدرجات", formatNumber(d.n, score.digits)],
                  ["المتوسط", score.tenths(d.stats.mean)],
                  ["الوسيط", score.tenths(d.stats.median)],
                  ["الانحراف المعياري", score.tenths(d.stats.sd)],
                  ["الأدنى / الأعلى", `${score.tenths(d.stats.min)} / ${score.tenths(d.stats.max)}`],
                  ["نسبة النجاح", score.pct(d.stats.passRateBp, 0)],
                  ["معامل السهولة", `${score.pct(d.stats.difficultyBp, 0)} — ${d.interpretation}`],
                  ["معامل التمييز", `${score.pct(d.stats.discriminationBp, 0)} — ${d.discrimination}`],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md bg-hover/60 px-3 py-2">
                    <dt className="text-[12px] text-fg-3">{k}</dt>
                    <dd className="mt-0.5 text-[14px] font-semibold tabular">{v}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mb-2 mt-5 text-[13px] font-medium text-fg-3">توزيع الدرجات (نسبة من العظمى)</h3>
              <div className="flex h-28 items-end gap-1" role="img" aria-label="مدرج تكراري للدرجات">
                {d.histogram.map((h) => (
                  <div key={h.from} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[10px] tabular text-fg-3">{h.count ? formatNumber(h.count, score.digits) : ""}</span>
                    <div className={cn("w-full rounded-t", h.from < 50 ? "bg-danger-700/70" : "bg-chart-1")} style={{ height: `${(h.count / max) * 80}px` }} />
                    <span className="text-[10px] tabular text-fg-3">{formatNumber(h.from, score.digits)}</span>
                  </div>
                ))}
              </div>
              {d.absents ? <p className="mt-3 text-[12px] text-fg-3">غائبون: {formatNumber(d.absents, score.digits)} (لا يدخلون في التحليل)</p> : null}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useCanManageGrades() {
  const { can } = useApp();
  return can("grade_entry", "approve");
}
