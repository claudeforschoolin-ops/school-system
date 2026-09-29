"use client";
/**
 * صفحات التفاصيل: التحويل (مسار الموافقات، التنفيذ، شهادة النقل)، الإجازة (الاعتماد)،
 * الملاحظة السلوكية، والحالة الإرشادية (الخطة، الجلسات، استدعاء ولي الأمر).
 */
import { CalendarPlus, Check, CircleDot, FileText, HeartPulse, Megaphone, Printer, X } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { BEHAVIOR_CATEGORIES, BEHAVIOR_KIND, CASE_CATEGORIES, CASE_STATUS, LEAVE_KIND, REQUEST_STATUS, SEVERITY, TRANSFER_STATUS, TRANSFER_TYPE } from "@/lib/students";
import { formatDate, toISODate } from "@/lib/dates";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageSkeleton } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/components/shell/app-context";
import { SettlementCard } from "@/components/finance/settlement-card";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";
import { shiftDay } from "@/components/attendance/roll-call";
import { BlockEditor } from "@/components/editor/block-editor";
import { SaveStatus, useAutosave } from "@/components/database/row-view";

function Shell({ crumbs, children, title, icon }: { crumbs: Array<{ title: string; href?: string; icon?: string }>; children: ReactNode; title: string; icon: string }) {
  useTabMeta(title, icon);
  return (
    <>
      <PageTopbar crumbs={[{ title: "شؤون الطلاب", icon: "lucide:users" }, ...crumbs]} />
      <div className="mx-auto w-full max-w-[960px] px-6 pb-24 pt-10 md:px-12">{children}</div>
    </>
  );
}

function Card({ title, children, action, className }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg bg-card p-4 shadow-card", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function StudentChip({ s }: { s: { id: string; fullName: string; photoUrl?: string | null; academicNumber?: string; grade?: { name: string } | null; section?: { name: string } | null; criticalHealth?: boolean } | null | undefined }) {
  if (!s) return null;
  return (
    <Link href={`/students/${s.id}`} className="flex items-center gap-3 rounded-lg p-1 hover:bg-hover">
      <Avatar name={s.fullName} src={s.photoUrl} size={40} />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[15px] font-medium">
          {s.fullName}
          {s.criticalHealth ? <HeartPulse className="size-4 text-danger-700" /> : null}
        </span>
        <span className="block text-[12px] text-fg-3">
          {s.academicNumber ? `${s.academicNumber} · ` : ""}
          {s.grade?.name}
          {s.section ? ` / ${s.section.name}` : ""}
        </span>
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------
// التحويل
// ---------------------------------------------------------------------

export function TransferDetail({ id }: { id: string }) {
  const { prefs, can } = useApp();
  const utils = trpc.useUtils();
  const q = trpc.transfers.get.useQuery({ id });
  const [confirm, setConfirm] = useState<"complete" | "cancel" | null>(null);
  const refresh = () => Promise.all([utils.transfers.get.invalidate({ id }), utils.database.rows.invalidate(), utils.transfers.overview.invalidate()]);
  const complete = trpc.transfers.complete.useMutation({ onSuccess: async () => (await refresh(), toast.success("نُفّذ التحويل")), onError: (e) => toast.error(e.message) });
  const cancel = trpc.transfers.cancel.useMutation({ onSuccess: async () => (await refresh(), toast.success("أُلغي الطلب")), onError: (e) => toast.error(e.message) });
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض التحويل" description={q.error.message} />;
  if (!q.data) return <PageSkeleton />;
  const t = q.data;
  const type = TRANSFER_TYPE[t.type as keyof typeof TRANSFER_TYPE];
  const status = TRANSFER_STATUS[t.status as keyof typeof TRANSFER_STATUS];
  const leaving = t.type === "OUTGOING" || t.type === "WITHDRAWAL";
  return (
    <Shell title={`تحويل ${t.student.fullName}`} icon="lucide:arrow-left-right" crumbs={[{ title: "التحويلات", icon: "lucide:arrow-left-right", href: "/transfers" }, { title: `طلب ${formatNumber(t.number, prefs.digits)}` }]}>
      <p className="text-[13px] text-fg-3">طلب رقم {formatNumber(t.number, prefs.digits)} · أُنشئ {formatDate(t.createdAt, { digits: prefs.digits })}</p>
      <h1 className="mt-1 text-[30px] font-bold">{type.label}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Tag color={status.color}>{status.label}</Tag>
        {leaving ? <Tag color={t.financialClearance ? "green" : "gold"}>{t.financialClearance ? "خلو طرف مالي ✓" : "بانتظار خلو الطرف المالي"}</Tag> : null}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="الطالب">
            <StudentChip s={t.student} />
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
              <div>
                <dt className="text-fg-3">من</dt>
                <dd>{t.from ?? t.student.grade.name}</dd>
              </div>
              <div>
                <dt className="text-fg-3">إلى</dt>
                <dd>{t.to ?? (t.type === "WITHDRAWAL" ? "انسحاب" : "—")}</dd>
              </div>
              <div>
                <dt className="text-fg-3">تاريخ السريان</dt>
                <dd>{formatDate(t.effectiveDate, { digits: prefs.digits, calendar: prefs.calendar })}</dd>
              </div>
            </dl>
            <p className="mt-4 whitespace-pre-line text-[14px] leading-7 text-fg-2">{t.reason}</p>
          </Card>
          {t.attachments.length ? (
            <Card title="المرفقات">
              <ul className="space-y-1.5">
                {t.attachments.map((f) => (
                  <li key={f.id}>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[13px] hover:underline">
                      <FileText className="size-4 text-fg-3" />
                      {f.name}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {t.certificateNumber ? (
            <Card title="شهادة النقل" action={<Link href={`/transfers/${t.id}/certificate`} className="flex items-center gap-1 text-[13px] text-fg-2 hover:underline"><Printer className="size-4" />عرض وطباعة</Link>}>
              <p className="text-[13px] text-fg-2">
                رقم الشهادة <b className="tabular" dir="ltr">{t.certificateNumber}</b> — صدرت {formatDate(t.certificateIssuedAt!, { digits: prefs.digits, calendar: prefs.calendar })}
              </p>
            </Card>
          ) : null}
        </div>
        <div className="space-y-4">
          {leaving && can("invoices", "view") ? <SettlementCard studentId={t.student.id} effectiveDate={new Date(t.effectiveDate).toISOString().slice(0, 10)} transferId={t.id} /> : null}
          <Card title="الموافقات">
            {t.approval ? (
              <ol className="space-y-3">
                {t.approval.steps.map((s) => (
                  <li key={s.order} className="flex items-start gap-2.5">
                    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", s.status === "APPROVED" ? "bg-success-50 text-success-800" : s.status === "REJECTED" ? "bg-danger-50 text-danger-700" : t.approval!.currentStep === s.order && t.approval!.status === "PENDING" ? "bg-gold-50 text-gold-700" : "bg-hover text-fg-4")}>
                      {s.status === "APPROVED" ? <Check className="size-3.5" /> : s.status === "REJECTED" ? <X className="size-3.5" /> : <CircleDot className="size-3" />}
                    </span>
                    <span className="min-w-0 text-[13px]">
                      <span className="block font-medium">{s.name}</span>
                      <span className="block text-[12px] text-fg-3">
                        {s.decidedBy ? `${s.decidedBy} · ${formatDate(s.decidedAt!, { digits: prefs.digits })}` : t.approval!.currentStep === s.order && t.approval!.status === "PENDING" ? "بانتظار القرار (من صندوق الوارد)" : "لاحقاً"}
                      </span>
                      {s.comment ? <span className="mt-0.5 block text-[12px] text-fg-2">«{s.comment}»</span> : null}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-[13px] text-fg-3">لا يوجد مسار موافقات.</p>
            )}
            <Link href="/inbox?tab=approvals" className="mt-3 block text-[12px] text-fg-3 underline">
              القرارات تُتخذ من «صندوق الوارد ← الموافقات»
            </Link>
          </Card>
          {t.permissions.canComplete || t.permissions.canCancel ? (
            <div className="flex flex-col gap-2">
              {t.permissions.canComplete ? (
                <Button variant="primary" className="justify-center" onClick={() => setConfirm("complete")} disabled={leaving && !t.financialClearance}>
                  تنفيذ التحويل{leaving ? " وإصدار الشهادة" : ""}
                </Button>
              ) : null}
              {t.permissions.canCancel ? (
                <Button variant="ghost" className="justify-center" onClick={() => setConfirm("cancel")}>
                  إلغاء الطلب
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === "complete" ? "تنفيذ التحويل؟" : "إلغاء طلب التحويل؟"}
        description={confirm === "complete" ? (leaving ? "ستتغير حالة الطالب ويُخرج من فصله وتصدر شهادة النقل، ويُبلغ ولي الأمر." : "سيُنقل الطالب فوراً ويُبلغ ولي الأمر.") : "تُلغى الموافقات المعلقة."}
        confirmLabel={confirm === "complete" ? "تنفيذ" : "إلغاء الطلب"}
        danger={confirm === "cancel"}
        onConfirm={() => (confirm === "complete" ? complete.mutate({ id }) : cancel.mutate({ id }))}
      />
    </Shell>
  );
}

export function TransferCertificate({ id }: { id: string }) {
  const { tenant, prefs } = useApp();
  const q = trpc.transfers.certificate.useQuery({ id });
  useTabMeta("شهادة نقل", "lucide:file-text");
  if (q.error) return <EmptyState illustration="lock" title="لا توجد شهادة" description={q.error.message} />;
  if (!q.data) return <PageSkeleton />;
  const t = q.data;
  return (
    <>
      <PageTopbar crumbs={[{ title: "التحويلات", icon: "lucide:arrow-left-right", href: "/transfers" }, { title: "شهادة نقل" }]} actions={<Button size="sm" icon={<Printer className="size-3.5" />} onClick={() => window.print()}>طباعة</Button>} />
      <div className="mx-auto my-8 w-full max-w-[760px] rounded-lg bg-card p-10 shadow-card print:my-0 print:shadow-none">
        <header className="flex items-start justify-between border-b border-line pb-5">
          <div>
            <p className="text-[18px] font-bold">{tenant.name}</p>
            <p className="text-[13px] text-fg-3">{t.student.branch.name}</p>
          </div>
          <div className="text-end text-[13px]">
            <p>
              رقم الشهادة: <b dir="ltr">{t.certificateNumber}</b>
            </p>
            <p>التاريخ: {formatDate(t.certificateIssuedAt!, { digits: prefs.digits, calendar: "both" })}</p>
          </div>
        </header>
        <h1 className="mt-8 text-center text-[26px] font-bold">{t.type === "WITHDRAWAL" ? "شهادة انسحاب" : "شهادة نقل"}</h1>
        <p className="mt-6 text-[15px] leading-9">
          تشهد إدارة {tenant.name} بأن الطالب/ـة <b>{t.student.fullName}</b>، رقم الهوية المنتهي بـ <b dir="ltr">{t.student.nationalIdLast4}</b>، المولود/ة بتاريخ {formatDate(t.student.birthDate, { digits: prefs.digits, calendar: "both" })}، كان/ت منتظماً/ة لدينا في <b>{t.student.grade.name}</b>،
          {t.type === "OUTGOING" ? <> وقد نُقل/ت إلى <b>{t.otherSchool}</b></> : <> وقد انسحب/ت من المدرسة</>} اعتباراً من {formatDate(t.effectiveDate, { digits: prefs.digits, calendar: "both" })}، مع خلو طرفه/ا المالي.
        </p>
        <p className="mt-4 text-[15px] leading-9">وقد أُعطيت هذه الشهادة بناءً على طلب ولي الأمر.</p>
        <footer className="mt-16 grid grid-cols-2 gap-10 text-center text-[14px]">
          <div>
            <p className="font-semibold">وكيل شؤون الطلاب</p>
            <p className="mt-10 border-t border-line pt-2 text-fg-3">التوقيع</p>
          </div>
          <div>
            <p className="font-semibold">مدير المدرسة</p>
            <p className="mt-10 border-t border-line pt-2 text-fg-3">التوقيع والختم</p>
          </div>
        </footer>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------
// الإجازة
// ---------------------------------------------------------------------

export function LeaveDetail({ id }: { id: string }) {
  const { prefs } = useApp();
  const utils = trpc.useUtils();
  const q = trpc.leaves.get.useQuery({ id });
  const [note, setNote] = useState("");
  const refresh = () => Promise.all([utils.leaves.get.invalidate({ id }), utils.database.rows.invalidate(), utils.transfers.overview.invalidate()]);
  const decide = trpc.leaves.decide.useMutation({ onSuccess: async () => (await refresh(), toast.success("سُجّل القرار وأُبلغ ولي الأمر")), onError: (e) => toast.error(e.message) });
  const cancel = trpc.leaves.cancel.useMutation({ onSuccess: async () => (await refresh(), toast.success("أُلغي الطلب")), onError: (e) => toast.error(e.message) });
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض الطلب" description={q.error.message} />;
  if (!q.data) return <PageSkeleton />;
  const l = q.data;
  const kind = LEAVE_KIND[l.kind as keyof typeof LEAVE_KIND];
  const status = REQUEST_STATUS[l.status as keyof typeof REQUEST_STATUS];
  const sameDay = new Date(l.startDate).getTime() === new Date(l.endDate).getTime();
  return (
    <Shell title={`${kind.label} ${l.student?.fullName ?? ""}`} icon="lucide:calendar-x" crumbs={[{ title: "الإجازات والاستئذان", icon: "lucide:calendar-x", href: "/leaves" }, { title: `طلب ${formatNumber(l.number, prefs.digits)}` }]}>
      <h1 className="text-[30px] font-bold">{kind.label}</h1>
      <div className="mt-2 flex items-center gap-2">
        <Tag color={status.color}>{status.label}</Tag>
        <span className="text-[13px] text-fg-3">
          {sameDay ? formatDate(l.startDate, { digits: prefs.digits, calendar: "both" }) : `${formatDate(l.startDate, { digits: prefs.digits })} ← ${formatDate(l.endDate, { digits: prefs.digits })}`}
        </span>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="الطالب">
            <StudentChip s={l.student} />
            <p className="mt-4 text-[14px] leading-7">{l.reason}</p>
            <p className="mt-2 text-[12px] text-fg-3">
              {l.requestedBy ? `بطلب: ${l.requestedBy} · ` : ""}سجّله {l.createdBy ?? "—"}
            </p>
          </Card>
          {l.attachments.length ? (
            <Card title="المرفقات">
              {l.attachments.map((f) => (
                <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 py-1 text-[13px] hover:underline">
                  <FileText className="size-4 text-fg-3" />
                  {f.name}
                </a>
              ))}
            </Card>
          ) : null}
        </div>
        <Card title="القرار">
          {l.status === "PENDING" && l.canDecide ? (
            <div className="space-y-3">
              <Field label="ملاحظة (اختيارية)">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1 justify-center" loading={decide.isPending && decide.variables?.decision === "APPROVED"} onClick={() => decide.mutate({ id, decision: "APPROVED", note: note || null })}>
                  اعتماد
                </Button>
                <Button variant="danger" className="flex-1 justify-center" loading={decide.isPending && decide.variables?.decision === "REJECTED"} onClick={() => decide.mutate({ id, decision: "REJECTED", note: note || null })}>
                  رفض
                </Button>
              </div>
              <p className="text-[12px] text-fg-3">عند الاعتماد تُسجَّل أيام الإجازة في الحضور تلقائياً ({l.kind === "EARLY_DISMISSAL" ? "مستأذن" : "غائب بعذر"}).</p>
            </div>
          ) : (
            <div className="text-[13px] text-fg-2">
              {l.decidedBy ? (
                <p>
                  {status.label} بواسطة {l.decidedBy} — {formatDate(l.decidedAt!, { digits: prefs.digits })}
                </p>
              ) : (
                <p>بانتظار اعتماد الوكيل.</p>
              )}
              {l.decisionNote ? <p className="mt-1 text-fg-3">«{l.decisionNote}»</p> : null}
            </div>
          )}
          {l.canCancel ? (
            <Button variant="ghost" size="sm" className="mt-3" loading={cancel.isPending} onClick={() => cancel.mutate({ id })}>
              إلغاء الطلب
            </Button>
          ) : null}
        </Card>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// الملاحظة السلوكية
// ---------------------------------------------------------------------

export function BehaviorDetail({ id }: { id: string }) {
  const { prefs } = useApp();
  const q = trpc.behavior.get.useQuery({ id });
  useTabMeta("ملاحظة سلوكية", "lucide:clipboard-pen");
  if (q.error) return <EmptyState illustration="lock" title="لا يمكن عرض الملاحظة" description={q.error.message} />;
  if (!q.data) return <PageSkeleton />;
  const b = q.data;
  const cat = BEHAVIOR_CATEGORIES.find((c) => c.id === b.category);
  const kind = BEHAVIOR_KIND[b.kind as keyof typeof BEHAVIOR_KIND];
  const sev = SEVERITY[b.severity as keyof typeof SEVERITY];
  return (
    <Shell title={`سلوك: ${b.student.fullName}`} icon="lucide:clipboard-pen" crumbs={[{ title: "السلوك", icon: "lucide:clipboard-pen", href: "/behavior" }, { title: b.student.fullName }]}>
      <h1 className="text-[30px] font-bold">{cat?.label ?? "ملاحظة سلوكية"}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Tag color={kind.color}>{kind.label}</Tag>
        <Tag color={sev.color}>خطورة {sev.label}</Tag>
        <span className={cn("text-[14px] font-semibold tabular", b.points >= 0 ? "text-success-800" : "text-danger-700")}>
          {b.points > 0 ? "+" : ""}
          {formatNumber(b.points, prefs.digits)} نقطة
        </span>
        {b.source === "ATTENDANCE_THRESHOLD" ? <Tag color="orange">آلي: تجاوز حد الغياب</Tag> : null}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="التفاصيل" className="lg:col-span-2">
          <p className="text-[14px] leading-7">{b.description || "—"}</p>
          {b.actionTaken ? <p className="mt-2 text-[13px] text-fg-2">الإجراء المتخذ: {b.actionTaken}</p> : null}
          <p className="mt-3 text-[12px] text-fg-3">
            {formatDate(b.occurredAt, { digits: prefs.digits, withTime: true })} · سجّله {b.reportedBy ?? "النظام"} · {b.guardianNotified ? "أُبلغ ولي الأمر" : "لم يُبلغ ولي الأمر"}
          </p>
        </Card>
        <Card title="الطالب">
          <StudentChip s={b.student} />
          <Link href={`/students/${b.student.id}?tab=behavior`} className="mt-3 block text-[12px] text-fg-3 underline">
            سجل سلوك الطالب
          </Link>
        </Card>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------
// الحالة الإرشادية
// ---------------------------------------------------------------------

export function CaseDetail({ id }: { id: string }) {
  const { prefs, tenant } = useApp();
  const utils = trpc.useUtils();
  const q = trpc.behavior.getCase.useQuery({ id });
  const refresh = () => Promise.all([utils.behavior.getCase.invalidate({ id }), utils.database.rows.invalidate()]);
  const update = trpc.behavior.updateCase.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const updateSession = trpc.behavior.updateSession.useMutation({ onSuccess: refresh, onError: (e) => toast.error(e.message) });
  const summon = trpc.behavior.summon.useMutation({ onSuccess: async (r) => (await refresh(), toast.success(`أُرسل الاستدعاء (${formatNumber(r.sent, prefs.digits)})`)), onError: (e) => toast.error(e.message) });
  const planSave = trpc.behavior.updateCase.useMutation();
  const autosave = useAutosave((doc: unknown) => planSave.mutateAsync({ id, patch: { plan: doc } }));
  const [adding, setAdding] = useState(false);
  const [summoning, setSummoning] = useState(false);
  if (q.error) return <EmptyState illustration="lock" title="الحالة سرّية أو غير موجودة" description={q.error.message} />;
  if (!q.data) return <PageSkeleton />;
  const c = q.data;
  return (
    <Shell title={c.title} icon="lucide:heart-handshake" crumbs={[{ title: "الحالات الإرشادية", icon: "lucide:heart-handshake", href: "/counseling" }, { title: `حالة ${formatNumber(c.number, prefs.digits)}` }]}>
      <p className="text-[13px] text-fg-3">حالة رقم {formatNumber(c.number, prefs.digits)} · فُتحت {formatDate(c.openedAt, { digits: prefs.digits })} · سرّية</p>
      <h1 className="mt-1 text-[30px] font-bold">{c.title}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Select size="sm" className="w-[150px]" value={c.status} disabled={!c.canEdit} onChange={(v) => update.mutate({ id, patch: { status: v as "OPEN" } })} options={Object.entries(CASE_STATUS).map(([value, o]) => ({ value, label: o.label }))} />
        <Select size="sm" className="w-[130px]" value={c.severity} disabled={!c.canEdit} onChange={(v) => update.mutate({ id, patch: { severity: v as "LOW" } })} options={Object.entries(SEVERITY).map(([value, o]) => ({ value, label: `خطورة ${o.label}` }))} />
        <Select size="sm" className="w-[130px]" value={c.category} disabled={!c.canEdit} onChange={(v) => update.mutate({ id, patch: { category: v } })} options={CASE_CATEGORIES.map((o) => ({ value: o.id, label: o.name }))} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="خطة العلاج الفردية" action={<SaveStatus status={autosave.status} />}>
            <BlockEditor content={c.plan} editable={c.canEdit} onChange={(doc) => autosave.schedule(doc)} placeholder="الأهداف، التدخلات، المسؤوليات، مؤشرات التحسن…" />
          </Card>
          <Card
            title="الجلسات"
            action={
              c.canEdit ? (
                <Button size="sm" icon={<CalendarPlus className="size-3.5" />} onClick={() => setAdding(true)}>
                  جلسة
                </Button>
              ) : null
            }
          >
            {c.sessions.length ? (
              <ul className="divide-y divide-line">
                {c.sessions.map((s) => (
                  <SessionRow key={s.id} s={s} editable={c.canEdit} onUpdate={(patch) => updateSession.mutate({ id: s.id, ...patch })} />
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-fg-3">لا توجد جلسات بعد.</p>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="الطالب">
            <StudentChip s={c.student} />
            {c.student?.guardians[0] ? <p className="mt-3 text-[12px] text-fg-3">ولي الأمر: {c.student.guardians[0].guardian.name}</p> : null}
            {c.canEdit ? (
              <Button size="sm" variant="ghost" className="mt-2" icon={<Megaphone className="size-3.5" />} onClick={() => setSummoning(true)}>
                استدعاء ولي الأمر
              </Button>
            ) : null}
            {c.guardianSummonedAt ? <p className="mt-1 text-[12px] text-fg-3">آخر استدعاء: {formatDate(c.guardianSummonedAt, { digits: prefs.digits })}</p> : null}
          </Card>
          <Card title="المرشد المسؤول">
            {c.counselor ? (
              <span className="flex items-center gap-2 text-[14px]">
                <Avatar name={c.counselor.name} color={c.counselor.avatarColor} size={26} />
                {c.counselor.name}
              </span>
            ) : null}
          </Card>
          <Card title="آخر السلوكيات">
            {c.behavior.length ? (
              <ul className="space-y-1.5 text-[13px]">
                {c.behavior.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{BEHAVIOR_CATEGORIES.find((x) => x.id === b.category)?.label ?? b.category}</span>
                    <span className={cn("tabular", b.points >= 0 ? "text-success-800" : "text-danger-700")}>{formatNumber(b.points, prefs.digits)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-fg-3">لا توجد سجلات.</p>
            )}
          </Card>
        </div>
      </div>
      {adding ? <AddSessionDialog caseId={id} onClose={() => setAdding(false)} onDone={refresh} /> : null}
      {summoning ? <SummonDialog onClose={() => setSummoning(false)} onConfirm={(date) => (summon.mutate({ caseId: id, date }), setSummoning(false))} defaultDate={shiftDay(toISODate(new Date(), tenant.timezone), 1)} /> : null}
    </Shell>
  );
}

function SessionRow({ s, editable, onUpdate }: { s: { id: string; scheduledAt: Date; durationMinutes: number; status: string; summary: string | null; attendees: string | null }; editable: boolean; onUpdate: (patch: { status?: "DONE" | "MISSED" | "CANCELLED" | "SCHEDULED"; summary?: string | null }) => void }) {
  const { prefs } = useApp();
  const [summary, setSummary] = useState(s.summary ?? "");
  const labels: Record<string, [string, "gold" | "green" | "red" | "gray"]> = { SCHEDULED: ["مجدولة", "gold"], DONE: ["منفذة", "green"], MISSED: ["لم يحضر", "red"], CANCELLED: ["ملغاة", "gray"] };
  const [label, color] = labels[s.status] ?? ["—", "gray"];
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-medium">{formatDate(s.scheduledAt, { digits: prefs.digits, withTime: true })}</span>
        <span className="text-[12px] text-fg-3">{formatNumber(s.durationMinutes, prefs.digits)} دقيقة</span>
        <Tag color={color} size="sm">
          {label}
        </Tag>
        {editable && s.status === "SCHEDULED" ? (
          <span className="ms-auto flex gap-1">
            <Button size="xs" onClick={() => onUpdate({ status: "DONE", summary: summary || null })}>
              تمت
            </Button>
            <Button size="xs" variant="ghost" onClick={() => onUpdate({ status: "MISSED" })}>
              لم يحضر
            </Button>
          </span>
        ) : null}
      </div>
      {s.attendees ? <p className="mt-1 text-[12px] text-fg-3">الحضور: {s.attendees}</p> : null}
      {editable ? (
        <Textarea rows={2} className="mt-2" value={summary} onChange={(e) => setSummary(e.target.value)} onBlur={() => summary !== (s.summary ?? "") && onUpdate({ summary: summary || null })} placeholder="ملخص الجلسة…" />
      ) : s.summary ? (
        <p className="mt-1 text-[13px] text-fg-2">{s.summary}</p>
      ) : null}
    </li>
  );
}

function AddSessionDialog({ caseId, onClose, onDone }: { caseId: string; onClose: () => void; onDone: () => void }) {
  const [at, setAt] = useState("");
  const [duration, setDuration] = useState("30");
  const [attendees, setAttendees] = useState("");
  const add = trpc.behavior.addSession.useMutation({ onSuccess: () => (toast.success("جُدولت الجلسة"), onDone(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="جلسة إرشاد" width={440}>
        <div className="space-y-3">
          <Field label="الموعد">
            <Input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />
          </Field>
          <Field label="المدة (دقيقة)">
            <Input type="number" min={10} max={180} value={duration} onChange={(e) => setDuration(e.target.value)} />
          </Field>
          <Field label="الحضور">
            <Input value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="الطالب، ولي الأمر، رائد الفصل…" />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" disabled={!at} loading={add.isPending} onClick={() => add.mutate({ caseId, scheduledAt: new Date(at), durationMinutes: Number(duration) || 30, attendees: attendees || null })}>
            جدولة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SummonDialog({ onClose, onConfirm, defaultDate }: { onClose: () => void; onConfirm: (date: string) => void; defaultDate: string }) {
  const [date, setDate] = useState(defaultDate);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="استدعاء ولي الأمر" description="تُرسل رسالة لأولياء الأمور المسجلين لتلقي الإشعارات دون ذكر تفاصيل الحالة." width={420}>
        <Field label="موعد الحضور">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button onClick={onClose}>إلغاء</Button>
          <Button variant="primary" onClick={() => onConfirm(date)}>
            إرسال الاستدعاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
