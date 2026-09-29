"use client";
/**
 * الشهادات: الإصدار الجماعي (بعد اعتماد الدرجات) بلقطة ورمز تحقق، ونشر النتائج في تاريخ يحدده المدير
 * مع حجب المدينين، ومصمم القوالب بالسحب، والطباعة الجماعية (حفظ PDF من المتصفح)، وعرض الأسرة.
 */
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, FileCheck2, GripVertical, ImageUp, Lock, Plus, Printer, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { CardSnapshot, ReportBlock, ReportBlockType } from "@/server/services/assessment/results.service";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { pickFile, uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import { ModuleShell } from "@/components/modules/module-shell";
import { SettingsCard } from "@/components/settings/settings-shell";
import { useFmtDate, useMoney } from "@/components/finance/common";
import { assessmentNav, CARDS_TABS, RESULT_STATUS, TermPicker, useScore, useTermParam } from "./common";

const BLOCK_LABEL: Record<ReportBlockType, string> = {
  header: "ترويسة المدرسة والشعار",
  student: "بيانات الطالب",
  grades: "جدول درجات المواد",
  components: "تفصيل المكونات",
  summary: "المعدل والترتيب والنتيجة",
  attendance: "ملخص الحضور",
  notes: "ملاحظات وتوجيهات",
  signatures: "التواقيع والختم",
  qr: "رمز التحقق",
};

// ---------------------------------------------------------------------
// الإصدار والنشر
// ---------------------------------------------------------------------

export function ReportCardsPage() {
  const { can } = useApp();
  const { termId, terms, setTerm } = useTermParam();
  const score = useScore();
  const money = useMoney();
  const fmtDate = useFmtDate();
  const utils = trpc.useUtils();
  const sections = trpc.assessment.results.sections.useQuery();
  const templates = trpc.assessment.cards.templates.useQuery();
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [progress, setProgress] = useState(true);
  const sid = sectionId ?? sections.data?.sections[0]?.id ?? null;
  const list = trpc.assessment.cards.list.useQuery({ termId: termId ?? "", sectionId: sid ?? "" }, { enabled: Boolean(termId && sid) });
  const issue = trpc.assessment.cards.issue.useMutation({
    onSuccess: (r) => (toast.success(`صدرت ${formatNumber(r.issued, score.digits)} شهادة بقالب «${r.template}»`), void utils.assessment.cards.invalidate()),
    onError: (e) => toast.error(e.message),
  });
  const d = list.data;
  const issued = d?.rows.filter((r) => r.card).length ?? 0;
  return (
    <ModuleShell nav={assessmentNav("report-cards")} wide tabs={CARDS_TABS} actions={<TermPicker value={termId} terms={terms} onChange={setTerm} />}>
      {sections.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الشهادات" description={sections.error.message} />
      ) : !sections.data || !termId ? (
        <SkeletonLines lines={10} />
      ) : (
        <>
          {can("report_cards", "approve") ? <PublicationCard termId={termId} key={termId} /> : null}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select className="w-[260px]" value={sid ?? undefined} onChange={setSectionId} options={sections.data.sections.map((s) => ({ value: s.id, label: `${s.name} — ${s.branch}` }))} />
            <Select className="w-[200px]" value={templateId ?? templates.data?.[0]?.id} onChange={setTemplateId} options={(templates.data ?? []).map((t) => ({ value: t.id, label: t.name }))} />
            <Select className="w-[220px]" value={progress ? "PROGRESS" : "TERM"} onChange={(k) => setProgress(k === "PROGRESS")} options={[{ value: "PROGRESS", label: "تقرير متابعة (أثناء الفصل)" }, { value: "TERM", label: "شهادة نهاية الفصل" }]} />
            <div className="ms-auto flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={<FileCheck2 className="size-3.5" />} loading={issue.isPending} disabled={!sid || Boolean(d?.pendingApproval)} onClick={() => sid && issue.mutate({ termId, sectionIds: [sid], templateId: templateId ?? templates.data?.[0]?.id ?? null, progress })}>
                {issued ? "إعادة إصدار شهادات الفصل" : "إصدار شهادات الفصل"}
              </Button>
              {issued ? (
                <Link href={`/assessment/report-cards/print?term=${termId}&section=${sid}`} target="_blank">
                  <Button size="sm" icon={<Printer className="size-3.5" />}>
                    طباعة الكل / PDF
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>
          {d?.pendingApproval ? (
            <p className="mb-3 flex items-center gap-2 rounded-md bg-warning-50 px-3 py-2 text-[13px] text-warning-700">
              <Lock className="size-4" /> {formatNumber(d.pendingApproval, score.digits)} بند تقييم لم يُعتمد في هذا الفصل؛ تُصدر الشهادات بعد اعتماد كل الدرجات.
            </p>
          ) : null}
          {list.error ? (
            <EmptyState illustration="lock" title="لا يمكن عرض شهادات الفصل" description={list.error.message} />
          ) : !d ? (
            <SkeletonLines lines={8} />
          ) : !d.rows.length ? (
            <EmptyState illustration="table" title="لا طلاب في هذا الفصل" />
          ) : (
            <div className="overflow-x-auto rounded-lg bg-card shadow-card thin-scroll">
              <table className="w-full min-w-[720px] text-[13px] [&_td]:border-b [&_td]:border-line/60 [&_td]:px-3 [&_td]:py-2 [&_th]:border-b [&_th]:border-line [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-medium [&_th]:text-fg-3">
                <thead>
                  <tr>
                    <th>الطالب</th>
                    <th>المعدل</th>
                    <th>الترتيب</th>
                    <th>النتيجة</th>
                    <th>صدرت</th>
                    <th>مستحقات متأخرة</th>
                    <th>للأسرة</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map((r) => (
                    <tr key={r.student.id}>
                      <td className="font-medium">{r.student.fullName}</td>
                      <td className="tabular">{r.card ? score.pct(r.card.averageBp) : "—"}</td>
                      <td className="tabular">{r.card?.rank ? formatNumber(r.card.rank, score.digits) : "—"}</td>
                      <td>{r.card ? <Tag color={RESULT_STATUS[r.card.result]!.color}>{RESULT_STATUS[r.card.result]!.label}</Tag> : <span className="text-fg-3">لم تصدر</span>}</td>
                      <td className="text-fg-3">{r.card ? fmtDate(r.card.issuedAt) : "—"}</td>
                      <td className={cn("tabular", r.debtMinor ? "text-danger-700" : "text-fg-3")}>{r.debtMinor ? money.fmt(r.debtMinor) : "—"}</td>
                      <td>{!r.card ? null : r.withheld ? <Tag color="red">محجوبة</Tag> : !d.publication ? <Tag color="gray">لم تُنشر</Tag> : new Date(d.publication.publishAt) > new Date() ? <Tag color="gold">مجدولة</Tag> : <Tag color="green">متاحة</Tag>}</td>
                      <td className="text-end">
                        {r.card ? (
                          <Link href={`/assessment/report-cards/print?term=${termId}&cards=${r.card.id}`} target="_blank">
                            <Button size="xs" variant="ghost" icon={<Printer className="size-3.5" />}>
                              عرض
                            </Button>
                          </Link>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </ModuleShell>
  );
}

function PublicationCard({ termId }: { termId: string }) {
  const utils = trpc.useUtils();
  const fmtDate = useFmtDate();
  const q = trpc.assessment.cards.publication.useQuery({ termId });
  const [v, setV] = useState<{ at: string; withhold: boolean } | null>(null);
  const current = v ?? (q.data ? { at: toLocal(q.data.publishAt), withhold: q.data.withholdOnDebt } : { at: "", withhold: true });
  const m = trpc.assessment.cards.setPublication.useMutation({ onSuccess: () => (toast.success("حُدد موعد نشر النتائج وأُشعرت الأسر"), void utils.assessment.cards.invalidate(), setV(null)), onError: (e) => toast.error(e.message) });
  return (
    <SettingsCard
      title="نشر النتائج للأسر"
      description={q.data ? `مجدولة في ${fmtDate(q.data.publishAt, "long")}${q.data.withholdOnDebt ? " — مع حجب شهادات من عليهم مستحقات متأخرة" : ""}` : "لم يُحدد موعد النشر؛ الشهادات غير مرئية لأولياء الأمور."}
      footer={
        <Button size="sm" variant="primary" icon={<CalendarClock className="size-3.5" />} disabled={!current.at} loading={m.isPending} onClick={() => m.mutate({ termId, publishAt: new Date(current.at), withholdOnDebt: current.withhold })}>
          حفظ موعد النشر
        </Button>
      }
    >
      <div className="flex flex-wrap items-end gap-4">
        <Field label="تاريخ ووقت الإتاحة" className="w-[240px]">
          <Input type="datetime-local" value={current.at} onChange={(e) => setV({ ...current, at: e.target.value })} />
        </Field>
        <label className="flex items-center gap-2 pb-1.5 text-[14px]">
          <Checkbox checked={current.withhold} onChange={(withhold) => setV({ ...current, withhold })} /> حجب شهادة من عليه مستحقات متأخرة حتى السداد (الأقساط غير المستحقة بعد لا تُحتسب)
        </label>
      </div>
    </SettingsCard>
  );
}

function toLocal(d: Date | string) {
  const x = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

// ---------------------------------------------------------------------
// عرض الشهادة
// ---------------------------------------------------------------------

type PrintData = RouterOutputs["assessment"]["cards"]["print"];
type Card = PrintData["cards"][number];

function useQr(text: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!text) return;
    let alive = true;
    void import("qrcode")
      .then((QR) => QR.toDataURL(text, { margin: 0, width: 160, errorCorrectionLevel: "M" }))
      .then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [text]);
  return url;
}

export function ReportCardView({ card, school, isDemo }: { card: Pick<Card, "verifyCode" | "issuedAt" | "snapshot" | "template">; school: PrintData["school"]; isDemo: boolean }) {
  const score = useScore();
  const fmtDate = useFmtDate();
  const s = card.snapshot as CardSnapshot;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const qr = useQr(card.verifyCode ? `${origin}/verify/${card.verifyCode}` : null);
  const shown = (bp: number | null, letter: string | null, points: number | null) => (bp === null ? "—" : s.display === "LETTER" ? (letter ?? "—") : s.display === "POINTS" ? (points === null ? "—" : formatNumber(points / 100, score.digits, { minimumFractionDigits: 2 })) : score.pct(bp));
  const componentNames = [...new Set(s.subjects.flatMap((x) => x.components.map((c) => c.name)))];
  const block = (b: ReportBlock) => {
    switch (b.type) {
      case "header":
        return (
          <div className="flex items-center gap-4 border-b-2 border-fg pb-3">
            {school.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={school.logoUrl} alt="" className="size-16 object-contain" />
            ) : (
              <span className="grid size-16 place-items-center rounded-full bg-hover text-[22px] font-bold">{school.name.slice(0, 1)}</span>
            )}
            <div className="flex-1">
              <p className="text-[20px] font-bold">{school.name}</p>
              <p className="text-[14px] text-fg-2">{s.kind === "PROGRESS" ? "تقرير متابعة أداء الطالب" : b.title || "شهادة نتيجة الطالب"}</p>
            </div>
            <div className="text-end text-[13px] text-fg-2">
              <p>{s.term.name}</p>
              <p>العام الدراسي {s.term.year}</p>
            </div>
          </div>
        );
      case "student":
        return (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[14px] sm:grid-cols-4">
            {[
              ["اسم الطالب", s.student.name],
              ["الرقم الأكاديمي", s.student.academicNumber],
              ["الصف / الفصل", `${s.student.grade} / ${s.student.section}`],
              ["الفرع", s.student.branch],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[12px] text-fg-3">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        );
      case "grades":
        return (
          <table className="w-full border-collapse text-[13px] [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1.5 [&_th]:border [&_th]:border-line [&_th]:bg-hover/60 [&_th]:px-2 [&_th]:py-1.5 [&_th]:font-medium">
            <thead>
              <tr>
                <th className="text-start">{b.title || "المادة"}</th>
                <th>الدرجة</th>
                <th>التقدير</th>
                <th>{s.kind === "PROGRESS" ? "المستوى" : "النتيجة"}</th>
              </tr>
            </thead>
            <tbody>
              {s.subjects.map((x) => (
                <tr key={x.name}>
                  <td>{x.name}</td>
                  <td className="text-center tabular">{shown(x.bp, x.letter, x.points)}</td>
                  <td className="text-center">{x.band ?? "—"}</td>
                  <td className={cn("text-center", !x.pass && x.bp !== null && "font-medium text-danger-700")}>{x.bp === null ? "—" : x.pass ? (s.kind === "PROGRESS" ? "مطمئن" : "ناجح") : s.kind === "PROGRESS" ? "يحتاج دعماً" : "دون النجاح"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "components":
        return (
          <table className="w-full border-collapse text-[12px] [&_td]:border [&_td]:border-line [&_td]:px-1.5 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:bg-hover/60 [&_th]:px-1.5 [&_th]:py-1 [&_th]:font-medium">
            <thead>
              <tr>
                <th className="text-start">{b.title || "تفصيل المكونات"}</th>
                {componentNames.map((n) => (
                  <th key={n}>{n}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {s.subjects.map((x) => (
                <tr key={x.name}>
                  <td>{x.name}</td>
                  {componentNames.map((n) => (
                    <td key={n} className="text-center tabular">
                      {score.pct(x.components.find((c) => c.name === n)?.bp ?? null, 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      case "summary":
        return (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["المعدل", score.pct(s.averageBp)],
              ["المعدل التراكمي (من ٥)", s.gpa === null ? "—" : formatNumber(s.gpa / 100, score.digits, { minimumFractionDigits: 2 })],
              ["الترتيب في الفصل", s.rank.section ? `${formatNumber(s.rank.section, score.digits)} من ${formatNumber(s.rank.sectionSize, score.digits)}` : "—"],
              ["الترتيب في الصف", s.rank.grade ? `${formatNumber(s.rank.grade, score.digits)} من ${formatNumber(s.rank.gradeSize, score.digits)}` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-line px-3 py-2">
                <p className="text-[12px] text-fg-3">{k}</p>
                <p className="text-[16px] font-bold tabular">{v}</p>
              </div>
            ))}
            {s.kind === "PROGRESS" ? (
              <p className="col-span-full text-[13px] text-fg-2">تقرير متابعة بما رُصد واعتُمد حتى تاريخه؛ النتيجة النهائية تُعلن في شهادة نهاية الفصل.</p>
            ) : (
              <p className="col-span-full text-[15px]">
                النتيجة: <b className={cn(s.result === "FAIL" && "text-danger-700", s.result === "SECOND_ROUND" && "text-warning-700")}>{RESULT_STATUS[s.result]!.label}</b>
              </p>
            )}
          </div>
        );
      case "attendance":
        return (
          <p className="text-[14px]">
            <span className="text-fg-3">{b.title || "الحضور خلال الفصل"}: </span>
            حاضر {formatNumber(s.attendance.present, score.digits)} · غائب {formatNumber(s.attendance.absent, score.digits)} · متأخر {formatNumber(s.attendance.late, score.digits)} · بعذر {formatNumber(s.attendance.excused, score.digits)}
          </p>
        );
      case "notes":
        return (
          <div className="text-[13px]">
            <p className="mb-1 text-fg-3">{b.title || "ملاحظات وتوجيهات"}</p>
            {card.template.footerNote ? <p className="whitespace-pre-line">{card.template.footerNote}</p> : <div className="h-10 border-b border-dashed border-line" />}
          </div>
        );
      case "signatures":
        return (
          <div className="relative grid gap-4 pt-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, card.template.signatures.length)}, minmax(0, 1fr))` }}>
            {card.template.signatures.map((sig, i) => (
              <div key={i} className="text-center text-[13px]">
                <p className="text-fg-3">{sig.title}</p>
                <p className="mt-6 border-t border-line pt-1 font-medium">{sig.name || " "}</p>
              </div>
            ))}
            {card.template.stampUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={card.template.stampUrl} alt="ختم المدرسة" className="pointer-events-none absolute -top-2 start-1/2 size-20 -translate-x-1/2 object-contain opacity-80" />
            ) : null}
          </div>
        );
      case "qr":
        return (
          <div className="flex items-center gap-3 text-[12px] text-fg-3">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="رمز التحقق" className="size-20" />
            ) : (
              <span className="size-20 rounded bg-hover" />
            )}
            <div>
              <p>للتحقق من صحة الشهادة امسح الرمز أو زر:</p>
              <p dir="ltr" className="font-mono text-fg-2">
                {origin}/verify/{card.verifyCode}
              </p>
              <p>تاريخ الإصدار: {fmtDate(card.issuedAt)}</p>
            </div>
          </div>
        );
    }
  };
  return (
    <article className="relative mx-auto flex w-full max-w-[794px] flex-col gap-4 bg-card p-8 text-fg shadow-card print:min-h-[1080px] print:max-w-none print:break-after-page print:shadow-none">
      {isDemo ? <span className="pointer-events-none absolute end-6 top-3 rounded-full bg-warning-50 px-2 py-0.5 text-[11px] font-medium text-warning-700">بيانات تجريبية</span> : null}
      {card.template.blocks
        .filter((b) => b.enabled)
        .map((b) => (
          <section key={b.type}>{block(b)}</section>
        ))}
    </article>
  );
}

export function PrintCardsPage() {
  const params = useSearchParams();
  const { tenant } = useApp();
  const termId = params.get("term") ?? "";
  const q = trpc.assessment.cards.print.useQuery({ termId, sectionId: params.get("section"), cardIds: params.get("cards")?.split(",").filter(Boolean) ?? null }, { enabled: Boolean(termId) });
  const score = useScore();
  return (
    <ModuleShell nav={assessmentNav("report-cards")} title="طباعة الشهادات" crumbs={[{ title: "طباعة الشهادات" }]} actions={<Button size="sm" variant="primary" icon={<Printer className="size-3.5" />} disabled={!q.data?.cards.length} onClick={() => window.print()}>طباعة / حفظ PDF</Button>}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض الشهادات" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={14} />
      ) : !q.data.cards.length ? (
        <EmptyState illustration="table" title="لا شهادات صادرة" description="أصدر شهادات الفصل أولاً من صفحة الإصدار." />
      ) : (
        <>
          <p className="no-print mb-4 text-[13px] text-fg-3">{formatNumber(q.data.cards.length, score.digits)} شهادة — كل شهادة في صفحة مستقلة عند الطباعة. اختر «حفظ بصيغة PDF» في نافذة الطباعة لملف واحد.</p>
          <div className="space-y-6 print:space-y-0">
            {q.data.cards.map((c) => (
              <ReportCardView key={c.id} card={c} school={q.data.school} isDemo={tenant.isDemo} />
            ))}
          </div>
        </>
      )}
    </ModuleShell>
  );
}

// ---------------------------------------------------------------------
// مصمم القوالب
// ---------------------------------------------------------------------

type Template = RouterOutputs["assessment"]["cards"]["templates"][number];

const SAMPLE: CardSnapshot = {
  student: { name: "عبدالله بن محمد القحطاني", academicNumber: "2026-0142", grade: "الصف الخامس", section: "أ", branch: "فرع الملقا" },
  term: { name: "الفصل الدراسي الأول", year: "2026–2027" },
  subjects: [
    { name: "الرياضيات", bp: 9250, band: "ممتاز", letter: "A", points: 500, pass: true, components: [{ name: "المشاركة", weight: 10, bp: 10000 }, { name: "الاختبار النهائي", weight: 40, bp: 9000 }] },
    { name: "لغتي", bp: 8710, band: "جيد جداً", letter: "B", points: 400, pass: true, components: [{ name: "المشاركة", weight: 10, bp: 9000 }, { name: "الاختبار النهائي", weight: 40, bp: 8500 }] },
    { name: "العلوم", bp: 7840, band: "جيد", letter: "C", points: 300, pass: true, components: [{ name: "المشاركة", weight: 10, bp: 8000 }, { name: "الاختبار النهائي", weight: 40, bp: 7700 }] },
  ],
  averageBp: 8600,
  gpa: 400,
  result: "PASS",
  rank: { section: 3, sectionSize: 26, grade: 11, gradeSize: 104 },
  attendance: { present: 78, absent: 2, late: 3, excused: 1 },
  display: "PERCENT",
  passBp: 5000,
};

export function TemplatesPage() {
  const q = trpc.assessment.cards.templates.useQuery();
  const [id, setId] = useState<string | null>(null);
  const current = q.data?.find((t) => t.id === id) ?? (id === "new" ? null : q.data?.[0]) ?? null;
  return (
    <ModuleShell nav={assessmentNav("report-cards")} wide tabs={CARDS_TABS}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض القوالب" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={10} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
          <aside className="space-y-1">
            {q.data.map((t) => (
              <button key={t.id} type="button" onClick={() => setId(t.id)} className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-start text-[14px] hover:bg-hover", current?.id === t.id && "bg-active font-medium")}>
                {t.isDefault ? <Star className="size-3.5 text-warning-700" aria-label="افتراضي" /> : null}
                <span className="truncate">{t.name}</span>
              </button>
            ))}
            <Button size="sm" variant="ghost" icon={<Plus className="size-3.5" />} onClick={() => setId("new")}>
              قالب جديد
            </Button>
          </aside>
          <TemplateEditor key={current?.id ?? "new"} template={current} onSaved={setId} />
        </div>
      )}
    </ModuleShell>
  );
}

function TemplateEditor({ template, onSaved }: { template: Template | null; onSaved: (id: string) => void }) {
  const utils = trpc.useUtils();
  const { tenant } = useApp();
  const allTypes = Object.keys(BLOCK_LABEL) as ReportBlockType[];
  const initialBlocks = template ? [...template.blocks, ...allTypes.filter((t) => !template.blocks.some((b) => b.type === t)).map((type) => ({ type, enabled: false }))] : allTypes.map((type) => ({ type, enabled: type !== "components" }));
  const [v, setV] = useState({ name: template?.name ?? "قالب جديد", blocks: initialBlocks as ReportBlock[], signatures: template?.signatures ?? [{ title: "مدير المدرسة", name: "" }], stampUrl: template?.stampUrl ?? null, footerNote: template?.footerNote ?? "", isDefault: template?.isDefault ?? false });
  const [confirm, setConfirm] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const save = trpc.assessment.cards.saveTemplate.useMutation({ onSuccess: (r) => (toast.success("حُفظ القالب"), void utils.assessment.cards.templates.invalidate(), onSaved(r.id)), onError: (e) => toast.error(e.message) });
  const del = trpc.assessment.cards.deleteTemplate.useMutation({ onSuccess: () => (toast.success("حُذف القالب"), void utils.assessment.cards.templates.invalidate(), onSaved("")), onError: (e) => toast.error(e.message) });
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const ids = v.blocks.map((b) => b.type as string);
    setV({ ...v, blocks: arrayMove(v.blocks, ids.indexOf(String(e.active.id)), ids.indexOf(String(e.over.id))) });
  };
  const uploadStamp = async () => {
    const f = await pickFile("image/png,image/jpeg,image/webp");
    if (!f) return;
    try {
      const up = await uploadFile(f);
      setV((cur) => ({ ...cur, stampUrl: up.url }));
    } catch (err) {
      toast.error((err as Error).message);
    }
  };
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px_1fr]">
      <div>
        <SettingsCard
          title="القالب"
          footer={
            <>
              {template && !template.isDefault ? (
                <Button variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirm(true)}>
                  حذف
                </Button>
              ) : null}
              <Button variant="primary" loading={save.isPending} onClick={() => save.mutate({ id: template?.id ?? null, ...v, footerNote: v.footerNote || null })}>
                حفظ القالب
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="الاسم">
              <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-[14px]">
              <Checkbox checked={v.isDefault} onChange={(isDefault) => setV({ ...v, isDefault })} /> القالب الافتراضي
            </label>
            <div>
              <p className="mb-1 text-[13px] font-medium text-fg-3">الكتل (اسحب لإعادة الترتيب)</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext items={v.blocks.map((b) => b.type)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-1">
                    {v.blocks.map((b) => (
                      <BlockRow key={b.type} block={b} onChange={(patch) => setV({ ...v, blocks: v.blocks.map((x) => (x.type === b.type ? { ...x, ...patch } : x)) })} />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </SettingsCard>
        <SettingsCard title="التواقيع والختم">
          <div className="space-y-2">
            {v.signatures.map((s, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input className="h-7 text-[13px]" placeholder="الصفة" value={s.title} onChange={(e) => setV({ ...v, signatures: v.signatures.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <Input className="h-7 text-[13px]" placeholder="الاسم" value={s.name} onChange={(e) => setV({ ...v, signatures: v.signatures.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                <Button size="icon-sm" variant="ghost" aria-label="حذف التوقيع" onClick={() => setV({ ...v, signatures: v.signatures.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {v.signatures.length < 4 ? (
                <Button size="xs" variant="ghost" icon={<Plus className="size-3" />} onClick={() => setV({ ...v, signatures: [...v.signatures, { title: "", name: "" }] })}>
                  توقيع
                </Button>
              ) : null}
              <Button size="xs" variant="ghost" icon={<ImageUp className="size-3" />} onClick={() => void uploadStamp()}>
                {v.stampUrl ? "تغيير الختم" : "رفع صورة الختم"}
              </Button>
              {v.stampUrl ? (
                <Button size="xs" variant="ghost" onClick={() => setV({ ...v, stampUrl: null })}>
                  إزالة الختم
                </Button>
              ) : null}
            </div>
            <Field label="ملاحظات التذييل">
              <Textarea rows={2} value={v.footerNote} onChange={(e) => setV({ ...v, footerNote: e.target.value })} />
            </Field>
          </div>
        </SettingsCard>
      </div>
      <div>
        <p className="mb-2 text-[13px] text-fg-3">معاينة ببيانات نموذجية</p>
        <div className="overflow-x-auto rounded-lg bg-hover/50 p-4 thin-scroll">
          <ReportCardView card={{ verifyCode: "DEMO000000", issuedAt: new Date(), snapshot: SAMPLE, template: { blocks: v.blocks, signatures: v.signatures, stampUrl: v.stampUrl, footerNote: v.footerNote || null } }} school={{ name: tenant.name, logoUrl: tenant.logoUrl }} isDemo={tenant.isDemo} />
        </div>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="حذف القالب؟" danger confirmLabel="حذف" loading={del.isPending} onConfirm={() => template && del.mutate({ id: template.id })} />
    </div>
  );
}

function BlockRow({ block, onChange }: { block: ReportBlock; onChange: (patch: Partial<ReportBlock>) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.type });
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn("flex items-center gap-2 rounded-md bg-card px-2 py-1.5 shadow-[0_0_0_1px_var(--border)]", isDragging && "z-10 shadow-popover")}>
      <button type="button" className="cursor-grab text-fg-3 active:cursor-grabbing" aria-label={`نقل ${BLOCK_LABEL[block.type]}`} {...attributes} {...listeners}>
        <GripVertical className="size-4" />
      </button>
      <span className={cn("flex-1 text-[13px]", !block.enabled && "text-fg-3")}>{BLOCK_LABEL[block.type]}</span>
      <Switch checked={block.enabled} onChange={(enabled) => onChange({ enabled })} disabled={block.type === "grades"} label={`إظهار ${BLOCK_LABEL[block.type]}`} />
    </li>
  );
}

// ---------------------------------------------------------------------
// نتائج الأسرة
// ---------------------------------------------------------------------

export function MyResultsPage() {
  const q = trpc.assessment.cards.family.useQuery();
  const { tenant } = useApp();
  const fmtDate = useFmtDate();
  const tenantInfo = { name: tenant.name, logoUrl: tenant.logoUrl };
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ModuleShell nav={assessmentNav("my-results")}>
      {q.error ? (
        <EmptyState illustration="lock" title="لا يمكن عرض النتائج" description={q.error.message} />
      ) : !q.data ? (
        <SkeletonLines lines={8} />
      ) : !q.data.students.length ? (
        <EmptyState illustration="inbox" title="لا طلاب مرتبطون بحسابك" description="تواصل مع إدارة المدرسة لربط أبنائك بحسابك." />
      ) : (
        <div className="space-y-6">
          {q.data.students.map((s) => (
            <section key={s.id}>
              <h2 className="mb-2 text-[17px] font-semibold">
                {s.name} <span className="text-[13px] font-normal text-fg-3">— {s.grade} / {s.section}</span>
              </h2>
              {!s.cards.length ? (
                <p className="rounded-lg bg-card px-4 py-3 text-[14px] text-fg-3 shadow-card">لم تصدر شهادات بعد.</p>
              ) : (
                <div className="space-y-2">
                  {s.cards.map((c) => (
                    <div key={c.id} className="rounded-lg bg-card p-4 shadow-card">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{c.term}</span>
                        {c.status === "VISIBLE" && c.snapshot ? c.snapshot.kind === "PROGRESS" ? <Tag color="navy">تقرير متابعة</Tag> : <Tag color={RESULT_STATUS[c.snapshot.result]!.color}>{RESULT_STATUS[c.snapshot.result]!.label}</Tag> : null}
                        {c.status === "NOT_YET" ? <Tag color="gold">{c.publishAt ? `تُتاح ${fmtDate(c.publishAt)}` : "لم يُحدد موعد النشر"}</Tag> : null}
                        {c.status === "WITHHELD" ? <Tag color="red">محجوبة لوجود مستحقات متأخرة</Tag> : null}
                        <div className="ms-auto flex gap-2">
                          {c.status === "VISIBLE" ? (
                            <>
                              <Button size="xs" variant="ghost" onClick={() => setOpen(open === c.id ? null : c.id)}>
                                {open === c.id ? "إخفاء" : "عرض الشهادة"}
                              </Button>
                              <Link href={`/assessment/report-cards/print?term=${c.termId}&cards=${c.id}`} target="_blank">
                                <Button size="xs" icon={<Printer className="size-3.5" />}>
                                  طباعة
                                </Button>
                              </Link>
                            </>
                          ) : c.status === "WITHHELD" ? (
                            <Link href="/finance/invoices">
                              <Button size="xs">عرض الفواتير</Button>
                            </Link>
                          ) : null}
                        </div>
                      </div>
                      {open === c.id && c.snapshot ? (
                        <div className="mt-4 overflow-x-auto thin-scroll">
                          <FamilyCard termId={c.termId} cardId={c.id} school={tenantInfo} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
    </ModuleShell>
  );
}

function FamilyCard({ termId, cardId, school }: { termId: string; cardId: string; school: PrintData["school"] }) {
  const { tenant } = useApp();
  const q = trpc.assessment.cards.print.useQuery({ termId, cardIds: [cardId] });
  const c = q.data?.cards[0];
  if (q.error) return <p className="text-[13px] text-danger-700">{q.error.message}</p>;
  if (!c) return <SkeletonLines lines={6} />;
  return <ReportCardView card={c} school={q.data?.school ?? school} isDemo={tenant.isDemo} />;
}
