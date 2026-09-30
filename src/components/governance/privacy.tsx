"use client";
/**
 * «خصوصيتي» لكل مستخدم: سياسة الخصوصية السارية وقبولها، موافقات الأبناء والموافقات الوظيفية،
 * وطلبات أصحاب البيانات (اطلاع، تصحيح، حذف، نسخة…). ونافذة القبول الإلزامية في الإطار العام.
 */
import { Download, LogOut, Mail, Plus, ShieldCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { usePrefs } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";
import { FinTable, useFmtDate } from "@/components/finance/common";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { CONSENT_LABEL, REQUEST_KIND, REQUEST_STATUS } from "./compliance";

const METHOD: Record<string, string> = { PORTAL: "عبر المنصة", PAPER: "نموذج ورقي", STAFF_ENTRY: "إدخال الإدارة" };

export function PrivacyPage() {
  useTabMeta("خصوصيتي", "lucide:shield-check");
  const current = trpc.compliance.current.useQuery();
  const mine = trpc.compliance.myConsents.useQuery();
  const requests = trpc.compliance.requests.useQuery({ status: null });
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [asking, setAsking] = useState(false);
  const [readFull, setReadFull] = useState(false);
  const n = (v: number) => formatNumber(v, prefs.digits);
  const own = requests.data?.officer ? requests.data.rows.filter((r) => r.requesterUserId) : requests.data?.rows;
  const cur = current.data;
  return (
    <>
      <PageTopbar crumbs={[{ title: "خصوصيتي", icon: "lucide:shield-check" }]} />
      <div className="mx-auto w-full max-w-[860px] px-6 pb-24 pt-10 md:px-12">
        <h1 className="text-[32px] font-bold">خصوصيتي</h1>
        <p className="mt-2 text-[15px] text-fg-3">كيف تتعامل المدرسة مع بياناتك وبيانات أبنائك، وموافقاتك، وحقك في الاطلاع على بياناتك أو تصحيحها أو حذفها.</p>

        <section className="mt-8 rounded-lg bg-card p-5 shadow-card" aria-labelledby="policy-h">
          <h2 id="policy-h" className="flex items-center gap-2 text-[17px] font-bold"><ShieldCheck className="size-5 text-fg-3" aria-hidden />سياسة الخصوصية</h2>
          {!cur ? <SkeletonLines lines={3} /> : !cur.policy ? (
            <p className="mt-3 text-[14px] text-fg-3">لم تنشر المدرسة سياسة خصوصية بعد.</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-semibold">{cur.policy.title}</p>
                <Tag color="gray">الإصدار {n(cur.policy.version)}</Tag>
                {cur.acceptedAt ? <Tag color="green">وافقت في {fmtDate(cur.acceptedAt)}</Tag> : cur.needsAcceptance ? <Tag color="gold">بانتظار موافقتك</Tag> : null}
              </div>
              {cur.policy.publishedAt ? <p className="mt-1 text-[12px] text-fg-3">نُشرت في {fmtDate(cur.policy.publishedAt)}{cur.policy.changes ? ` · ${cur.policy.changes}` : ""}</p> : null}
              <div className={readFull ? "mt-3 whitespace-pre-wrap text-[14px] leading-7 text-fg-2" : "mt-3 line-clamp-4 whitespace-pre-wrap text-[14px] leading-7 text-fg-2"}>{cur.policy.body}</div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setReadFull(!readFull)}>{readFull ? "إخفاء النص" : "قراءة السياسة كاملة"}</Button>
                {cur.needsAcceptance ? <AcceptButton policyId={cur.policy.id} /> : null}
              </div>
            </>
          )}
        </section>

        <section className="mt-6" aria-labelledby="consents-h">
          <h2 id="consents-h" className="text-[17px] font-bold">الموافقات</h2>
          <p className="mt-1 text-[13px] text-fg-3">يمكنك منح الموافقة أو سحبها في أي وقت، وتُحفظ كل مرة سجلاً لا يُعدَّل.</p>
          {!mine.data ? <SkeletonLines lines={4} /> : (
            <div className="mt-3 space-y-3">
              {mine.data.students.map((s) => (
                <ConsentCard key={s.id} title={s.name} subtitle={s.grade} items={s.consents} target={{ studentId: s.id }} />
              ))}
              {mine.data.employeeId && mine.data.staff.length ? <ConsentCard title="موافقاتي كموظف" items={mine.data.staff} target={{ employeeId: mine.data.employeeId }} /> : null}
              {!mine.data.students.length && !(mine.data.employeeId && mine.data.staff.length) ? <p className="rounded-lg bg-card p-4 text-[14px] text-fg-3 shadow-card">لا توجد موافقات مطلوبة منك حالياً.</p> : null}
              {mine.data.history.length ? (
                <details className="rounded-lg bg-card p-4 shadow-card">
                  <summary className="cursor-pointer text-[14px] font-medium">سجل موافقاتي ({n(mine.data.history.length)})</summary>
                  <ul className="mt-2 divide-y divide-line/60 text-[13px]">
                    {mine.data.history.map((h) => (
                      <li key={h.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>{h.type}{h.studentId ? ` — ${mine.data.students.find((s) => s.id === h.studentId)?.name ?? ""}` : ""}</span>
                        <span className="flex items-center gap-2 text-fg-3"><Tag color={CONSENT_LABEL[h.status]?.color ?? "gray"}>{CONSENT_LABEL[h.status]?.label ?? h.status}</Tag>{METHOD[h.method] ?? h.method} · {h.by} · {fmtDate(h.at)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          )}
        </section>

        <section className="mt-8" aria-labelledby="requests-h">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 id="requests-h" className="text-[17px] font-bold">طلبات البيانات</h2>
              <p className="mt-1 text-[13px] text-fg-3">{cur ? `تردّ المدرسة خلال ${n(cur.dpo.days)} يوماً من استلام الطلب.` : ""}</p>
            </div>
            <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setAsking(true)}>طلب جديد</Button>
          </div>
          <div className="mt-3">
            {requests.error ? <EmptyState illustration="lock" title="لا يمكن عرض طلباتك" description={requests.error.message} /> : !own ? <SkeletonLines lines={3} /> : own.length ? (
              <FinTable head={<tr><th>الرقم</th><th>النوع</th><th>بشأن</th><th>الحالة</th><th>موعد الرد</th><th>النتيجة</th></tr>}>
                {own.map((r) => (
                  <tr key={r.id}>
                    <td className="tabular">{n(r.number)}</td>
                    <td>{REQUEST_KIND[r.kind] ?? r.kind}</td>
                    <td>{r.subjectName}</td>
                    <td><Tag color={REQUEST_STATUS[r.status]?.color ?? "gray"}>{REQUEST_STATUS[r.status]?.label ?? r.status}</Tag></td>
                    <td className="whitespace-nowrap text-fg-3">{fmtDate(r.dueDate)}</td>
                    <td className="text-[13px]">
                      {r.resolution ?? "—"}
                      {r.status === "COMPLETED" && r.exportFileId ? <a href={`/api/compliance/requests/${r.id}`} className="ms-2 inline-flex items-center gap-1 text-navy-600 underline"><Download className="size-3.5" aria-hidden />تنزيل بياناتي</a> : null}
                    </td>
                  </tr>
                ))}
              </FinTable>
            ) : <p className="rounded-lg bg-card p-4 text-[14px] text-fg-3 shadow-card">لم تقدّم أي طلب بعد. يمكنك طلب نسخة من بياناتك أو تصحيحها أو حذف ما لا يلزم نظاماً.</p>}
          </div>
        </section>

        <section className="mt-8 rounded-lg bg-card p-5 shadow-card" aria-labelledby="dpo-h">
          <h2 id="dpo-h" className="flex items-center gap-2 text-[15px] font-semibold"><Mail className="size-4 text-fg-3" aria-hidden />مسؤول حماية البيانات</h2>
          <p className="mt-2 text-[14px]">{cur?.dpo.name || "إدارة المدرسة"}{cur?.dpo.email ? <a dir="ltr" href={`mailto:${cur.dpo.email}`} className="ms-2 text-navy-600 underline">{cur.dpo.email}</a> : null}</p>
        </section>
      </div>
      {asking && mine.data ? <NewRequestDialog students={mine.data.students} guardianId={mine.data.guardianId} employeeId={mine.data.employeeId} onClose={() => setAsking(false)} /> : null}
    </>
  );
}

type ConsentItem = RouterOutputs["compliance"]["myConsents"]["staff"][number];

function ConsentCard({ title, subtitle, items, target }: { title: string; subtitle?: string; items: ConsentItem[]; target: { studentId?: string; employeeId?: string } }) {
  const utils = trpc.useUtils();
  const fmtDate = useFmtDate();
  const set = trpc.compliance.setConsent.useMutation({ onSuccess: (r) => (toast.success(r.status === "GRANTED" ? "سُجّلت موافقتك" : "سُجّل سحب الموافقة"), void utils.compliance.myConsents.invalidate()), onError: (e) => toast.error(e.message) });
  return (
    <div className="rounded-lg bg-card p-4 shadow-card">
      <p className="text-[15px] font-semibold">{title}{subtitle ? <span className="ms-2 text-[13px] font-normal text-fg-3">{subtitle}</span> : null}</p>
      {items.length ? (
        <ul className="mt-2 divide-y divide-line/60">
          {items.map((c) => (
            <li key={c.typeId} className="flex items-start gap-3 py-3">
              <Switch checked={c.status === "GRANTED"} disabled={set.isPending} label={`${c.name} — ${title}`} onChange={(on) => set.mutate({ consentTypeId: c.typeId, ...target, status: on ? "GRANTED" : c.status === "GRANTED" ? "WITHDRAWN" : "DENIED" })} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                  {c.name}
                  {c.isRequired ? <Tag color="gold">مطلوبة</Tag> : null}
                  {c.status && CONSENT_LABEL[c.status] ? <Tag color={CONSENT_LABEL[c.status]!.color}>{CONSENT_LABEL[c.status]!.label}</Tag> : <Tag color="gray">لم تُحدَّد</Tag>}
                </p>
                <p className="mt-0.5 text-[13px] leading-6 text-fg-3">{c.description}</p>
                {c.at ? <p className="text-[12px] text-fg-3">آخر تحديث {fmtDate(c.at)}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-[13px] text-fg-3">لا موافقات مفعّلة من هذا النوع.</p>}
    </div>
  );
}

function NewRequestDialog({ students, guardianId, employeeId, onClose }: { students: Array<{ id: string; name: string }>; guardianId: string | null; employeeId: string | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const self = guardianId ? "GUARDIAN" : employeeId ? "EMPLOYEE" : "USER";
  const subjects = [{ value: `${self}:`, label: "بياناتي أنا" }, ...students.map((s) => ({ value: `STUDENT:${s.id}`, label: `بيانات ${s.name}` }))];
  const [kind, setKind] = useState("ACCESS");
  const [subject, setSubject] = useState(`${self}:`);
  const [description, setDescription] = useState("");
  const create = trpc.compliance.createRequest.useMutation({ onSuccess: (r) => (toast.success(`استُلم طلبك رقم ${r.number}`), void utils.compliance.requests.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const HINT: Record<string, string> = { ACCESS: "نرسل لك ملخصاً بما نحتفظ به من بيانات وسبب ذلك.", CORRECTION: "اذكر البيانات الخاطئة والصحيحة.", DELETION: "تُحذف البيانات غير المطلوبة نظاماً؛ السجلات المالية والأكاديمية الرسمية تُحفظ للمدة النظامية.", PORTABILITY: "نجهّز لك ملفاً بصيغة قابلة للقراءة الآلية.", OBJECTION: "اذكر المعالجة التي تعترض عليها وسببك." };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="طلب بيانات جديد" width={560}>
        <div className="space-y-3 px-5 pb-4">
          <Field label="نوع الطلب" hint={HINT[kind]}><Select value={kind} onChange={setKind} options={Object.entries(REQUEST_KIND).map(([value, label]) => ({ value, label }))} /></Field>
          <Field label="بشأن"><Select value={subject} onChange={setSubject} options={subjects} /></Field>
          <Field label="التفاصيل"><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="اكتب ما تحتاجه بالتحديد…" /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button
            variant="primary"
            loading={create.isPending}
            disabled={description.trim().length < 10}
            onClick={() => {
              const [subjectType, subjectId] = subject.split(":") as ["GUARDIAN" | "STUDENT" | "EMPLOYEE" | "USER", string];
              create.mutate({ kind: kind as "ACCESS", subjectType, subjectId: subjectId || null, description });
            }}
          >
            إرسال الطلب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcceptButton({ policyId, onDone }: { policyId: string; onDone?: () => void }) {
  const utils = trpc.useUtils();
  const accept = trpc.compliance.accept.useMutation({ onSuccess: () => (toast.success("شكراً، سُجّلت موافقتك"), void utils.compliance.current.invalidate(), onDone?.()), onError: (e) => toast.error(e.message) });
  return <Button size="sm" variant="primary" loading={accept.isPending} onClick={() => accept.mutate({ policyId })}>قرأت السياسة وأوافق عليها</Button>;
}

/** نافذة القبول الإلزامية: تظهر فوق أي صفحة حتى يوافق المستخدم على الإصدار الساري */
export function PolicyGate() {
  const path = usePathname();
  const router = useRouter();
  const q = trpc.compliance.current.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  const prefs = usePrefs();
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => (router.replace("/login"), router.refresh()) });
  if (!q.data?.needsAcceptance || !q.data.policy || path === "/privacy") return null;
  const p = q.data.policy;
  return (
    <Dialog open onOpenChange={() => undefined}>
      <DialogContent title={`${p.title} — الإصدار ${formatNumber(p.version, prefs.digits)}`} description={p.changes ?? "يلزم الاطلاع على سياسة الخصوصية والموافقة عليها لمتابعة استخدام المنصة."} width={720} hideClose>
        <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap px-5 pb-4 text-[14px] leading-7 text-fg-2 thin-scroll" tabIndex={0}>{p.body}</div>
        <DialogFooter className="justify-between">
          <Button variant="ghost" icon={<LogOut className="size-3.5" />} loading={logout.isPending} onClick={() => logout.mutate()}>تسجيل الخروج</Button>
          <AcceptButton policyId={p.id} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
