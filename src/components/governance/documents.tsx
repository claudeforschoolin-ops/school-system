"use client";
/**
 * التوثيق الإلكتروني: قائمة المستندات والبحث النصي، محرر المسودة والموقّعين،
 * وصفحة المستند بالتوقيع (رسم أو كتابة الاسم) وسلامة المحتوى وشهادة التوقيع المطبوعة.
 */
import { Archive, ArchiveRestore, BellRing, Check, Eraser, FileText, Link2, Paperclip, PenLine, Plus, Printer, Search, Send, ShieldAlert, ShieldCheck, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useRef, useState } from "react";
import { MODULE_NAV } from "@/lib/modules-nav";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { formatBytes, pickFile, uploadFile } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { ModuleShell } from "@/components/modules/module-shell";
import { useApp, usePrefs } from "@/components/shell/app-context";
import { FinTable, printPage, useFmtDate } from "@/components/finance/common";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";

const nav = () => MODULE_NAV.find((m) => m.key === "documents")!;

export const DOC_KIND: Record<string, string> = { CONTRACT: "عقد", ACKNOWLEDGMENT: "إقرار", POLICY: "سياسة/لائحة", FORM: "نموذج", OTHER: "أخرى" };
export const DOC_STATUS: Record<string, { label: string; color: "gray" | "gold" | "green" | "red" | "slate" }> = { DRAFT: { label: "مسودة", color: "gray" }, SENT: { label: "بانتظار التوقيع", color: "gold" }, COMPLETED: { label: "مكتمل التوقيع", color: "green" }, DECLINED: { label: "مرفوض", color: "red" }, CANCELLED: { label: "ملغى", color: "slate" } };
const SIGNER_STATUS: Record<string, { label: string; color: "gray" | "green" | "red" }> = { PENDING: { label: "بانتظار", color: "gray" }, SIGNED: { label: "وقّع", color: "green" }, DECLINED: { label: "رفض", color: "red" } };
type Tab = "TO_SIGN" | "SENT" | "ALL" | "ARCHIVE";

// =====================================================================
// القائمة
// =====================================================================

export function DocumentsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const tab = (params.get("tab") as Tab | null) ?? "TO_SIGN";
  const [q, setQ] = useState(params.get("q") ?? "");
  const deferred = useDeferredValue(q.trim());
  const list = trpc.documents.list.useQuery({ tab, q: deferred || null }, { placeholderData: (p) => p });
  const n = (v: number) => formatNumber(v, prefs.digits);
  const setTab = (t: string) => router.replace(`/documents?tab=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
  const toSign = list.data?.counts.toSign ?? 0;
  return (
    <ModuleShell nav={nav()} wide actions={list.data?.canCreate ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => router.push("/documents/new")}>مستند جديد</Button> : null}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: "TO_SIGN", label: toSign ? `بانتظار توقيعي (${n(toSign)})` : "بانتظار توقيعي" }, { value: "SENT", label: "أرسلتها" }, { value: "ALL", label: "الكل" }, { value: "ARCHIVE", label: "الأرشيف" }]} />
        <label className="relative w-full max-w-[340px]">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث في العناوين والنصوص والوسوم…" className="ps-8" aria-label="بحث في المستندات" />
        </label>
      </div>
      {list.error ? <EmptyState illustration="lock" title="لا يمكن عرض المستندات" description={list.error.message} /> : null}
      {!list.data ? (list.error ? null : <SkeletonLines lines={6} />) : list.data.rows.length ? (
        <FinTable head={<tr><th>الرقم</th><th>المستند</th><th>النوع</th><th>الحالة</th><th>التوقيعات</th><th>الموعد</th><th>المنشئ</th><th>توقيعي</th></tr>}>
          {list.data.rows.map((d) => (
            <tr key={d.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/documents/${d.id}`)}>
              <td className="tabular">{n(d.number)}</td>
              <td>
                <Link href={`/documents/${d.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{d.title}</Link>
                {d.tags.length ? <span className="ms-2 inline-flex flex-wrap gap-1 align-middle">{d.tags.map((t) => <Tag key={t} color="slate">{t}</Tag>)}</span> : null}
              </td>
              <td>{DOC_KIND[d.kind] ?? d.kind}</td>
              <td><Tag color={DOC_STATUS[d.status]?.color ?? "gray"}>{DOC_STATUS[d.status]?.label ?? d.status}</Tag>{d.archivedAt ? <Tag color="slate" className="ms-1">مؤرشف</Tag> : null}</td>
              <td>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={d.signed} aria-valuemin={0} aria-valuemax={d.total} aria-label="نسبة التوقيع"><span className="block h-full rounded-full bg-chart-1" style={{ width: `${d.total ? (d.signed / d.total) * 100 : 0}%` }} /></span>
                  <span className="tabular text-[13px] text-fg-3">{n(d.signed)} / {n(d.total)}</span>
                </span>
              </td>
              <td className="whitespace-nowrap text-fg-3">{d.dueDate ? fmtDate(d.dueDate) : "—"}</td>
              <td className="text-fg-3">{d.creator}</td>
              <td>{d.mine ? <Tag color={SIGNER_STATUS[d.mine]?.color ?? "gray"}>{SIGNER_STATUS[d.mine]?.label ?? d.mine}</Tag> : <span className="text-fg-4">—</span>}</td>
            </tr>
          ))}
        </FinTable>
      ) : (
        <EmptyState
          illustration="blank"
          title={deferred ? "لا نتائج مطابقة" : tab === "TO_SIGN" ? "لا مستندات بانتظار توقيعك" : "لا مستندات هنا بعد"}
          description={deferred ? "جرّب كلمات أخرى؛ البحث يتجاهل التشكيل والهمزات." : tab === "TO_SIGN" ? "عندما يُرسَل إليك عقد أو إقرار للتوقيع يظهر هنا ويصلك إشعار." : "العقود والإقرارات والنماذج المرسلة للتوقيع الإلكتروني تُحفظ هنا مع بصماتها."}
          action={list.data.canCreate && !deferred ? <Button variant="primary" onClick={() => router.push("/documents/new")}>إنشاء مستند</Button> : undefined}
        />
      )}
    </ModuleShell>
  );
}

// =====================================================================
// المحرر
// =====================================================================

interface SignerRow {
  userId: string;
  name: string;
  roleLabel: string;
}

export function DocumentEditorPage({ id }: { id?: string }) {
  const existing = trpc.documents.get.useQuery({ id: id ?? "" }, { enabled: Boolean(id) });
  if (id && !existing.data) {
    return (
      <ModuleShell nav={nav()} title="تعديل مستند" crumbs={[{ title: "تعديل" }]}>
        {existing.error ? <EmptyState illustration="lock" title="لا يمكن فتح المسودة" description={existing.error.message} /> : <SkeletonLines lines={8} />}
      </ModuleShell>
    );
  }
  return <Editor initial={existing.data ?? null} />;
}

type Detail = RouterOutputs["documents"]["get"];

function Editor({ initial }: { initial: Detail | null }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const d = initial?.doc;
  const [v, setV] = useState({
    title: d?.title ?? "",
    kind: (d?.kind ?? "ACKNOWLEDGMENT") as "CONTRACT" | "ACKNOWLEDGMENT" | "POLICY" | "FORM" | "OTHER",
    body: d?.body ?? "",
    tags: d?.tags.join("، ") ?? "",
    signingOrder: (d?.signingOrder ?? "PARALLEL") as "PARALLEL" | "SEQUENTIAL",
    dueDate: d?.dueDate ? new Date(d.dueDate).toISOString().slice(0, 10) : "",
  });
  const [file, setFile] = useState<{ id: string; name: string; size: number } | null>(initial?.file ? { id: initial.file.id, name: initial.file.name, size: initial.file.size } : null);
  const [signers, setSigners] = useState<SignerRow[]>(d?.signers.map((s) => ({ userId: s.userId ?? "", name: s.name, roleLabel: s.roleLabel ?? "" })) ?? []);
  const [uploading, setUploading] = useState(false);
  const save = trpc.documents.saveDraft.useMutation({ onError: (e) => toast.error(e.message) });
  const send = trpc.documents.send.useMutation({ onError: (e) => toast.error(e.message) });
  const payload = () => ({ id: d?.id ?? null, title: v.title, kind: v.kind, body: v.body, fileId: file?.id ?? null, tags: v.tags.split(/[،,]/).map((t) => t.trim()).filter(Boolean), signingOrder: v.signingOrder, dueDate: v.dueDate || null, signers: signers.map((s) => ({ userId: s.userId, roleLabel: s.roleLabel || null })) });
  const valid = v.title.trim().length >= 3 && (v.body.trim().length >= 20 || file);
  const submit = async (andSend: boolean) => {
    const r = await save.mutateAsync(payload());
    if (andSend) {
      await send.mutateAsync({ id: r.id });
      toast.success("أُرسل المستند للتوقيع");
    } else toast.success("حُفظت المسودة");
    await utils.documents.invalidate();
    router.push(`/documents/${r.id}`);
  };
  const attach = async () => {
    const f = await pickFile("application/pdf,image/*,.docx");
    if (!f) return;
    setUploading(true);
    try {
      const u = await uploadFile(f);
      setFile({ id: u.id, name: u.name, size: u.size });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر رفع الملف");
    } finally {
      setUploading(false);
    }
  };
  const move = (i: number, dir: -1 | 1) => setSigners((list) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  });
  return (
    <ModuleShell nav={nav()} title={d ? `تعديل: ${d.title}` : "مستند جديد"} crumbs={[{ title: d ? "تعديل" : "مستند جديد" }]}>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <Field label="عنوان المستند"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="مثال: إقرار الالتزام بلائحة السلوك" /></Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="النوع"><Select value={v.kind} onChange={(kind) => setV({ ...v, kind: kind as typeof v.kind })} options={Object.entries(DOC_KIND).map(([value, label]) => ({ value, label }))} /></Field>
            <Field label="آخر موعد للتوقيع"><Input type="date" value={v.dueDate} onChange={(e) => setV({ ...v, dueDate: e.target.value })} /></Field>
            <Field label="وسوم" hint="افصل بفاصلة"><Input value={v.tags} onChange={(e) => setV({ ...v, tags: e.target.value })} placeholder="عقود، ٢٠٢٦" /></Field>
          </div>
          <Field label="نص المستند" hint="يُقفل النص عند الإرسال وتُحسب بصمته؛ أي تعديل لاحق يُكتشف"><Textarea rows={16} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} className="leading-7" /></Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" icon={<Paperclip className="size-3.5" />} loading={uploading} onClick={attach}>{file ? "استبدال المرفق" : "إرفاق ملف (PDF أو صورة)"}</Button>
            {file ? <span className="flex items-center gap-1.5 rounded-md bg-hover px-2 py-1 text-[13px]"><FileText className="size-3.5 text-fg-3" aria-hidden />{file.name}<span className="text-fg-3">({formatBytes(file.size)})</span><button type="button" aria-label="إزالة المرفق" className="text-fg-3 hover:text-fg" onClick={() => setFile(null)}><X className="size-3.5" /></button></span> : null}
          </div>
        </div>
        <aside className="space-y-3">
          <div className="rounded-lg bg-card p-4 shadow-card">
            <p className="text-[15px] font-semibold">الموقّعون</p>
            <Field label="ترتيب التوقيع" className="mt-2">
              <Segmented value={v.signingOrder} onChange={(o) => setV({ ...v, signingOrder: o as typeof v.signingOrder })} options={[{ value: "PARALLEL", label: "معاً" }, { value: "SEQUENTIAL", label: "بالتسلسل" }]} />
            </Field>
            <ol className="mt-3 space-y-2">
              {signers.map((s, i) => (
                <li key={s.userId} className="rounded-md bg-hover/60 p-2">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-card text-[12px] font-semibold tabular">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{s.name}</span>
                    {v.signingOrder === "SEQUENTIAL" ? (
                      <>
                        <button type="button" className="rounded px-1 text-fg-3 hover:bg-card disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`تقديم ${s.name}`}>↑</button>
                        <button type="button" className="rounded px-1 text-fg-3 hover:bg-card disabled:opacity-30" disabled={i === signers.length - 1} onClick={() => move(i, 1)} aria-label={`تأخير ${s.name}`}>↓</button>
                      </>
                    ) : null}
                    <button type="button" className="text-fg-3 hover:text-danger-700" onClick={() => setSigners(signers.filter((x) => x.userId !== s.userId))} aria-label={`إزالة ${s.name}`}><Trash2 className="size-3.5" /></button>
                  </div>
                  <Input className="mt-1.5 h-7 text-[13px]" placeholder="الصفة (اختياري): الطرف الثاني، ولي الأمر…" value={s.roleLabel} onChange={(e) => setSigners(signers.map((x) => (x.userId === s.userId ? { ...x, roleLabel: e.target.value } : x)))} />
                </li>
              ))}
            </ol>
            <SignerSearch exclude={signers.map((s) => s.userId)} onPick={(u) => setSigners([...signers, { userId: u.id, name: u.name, roleLabel: "" }])} />
          </div>
          <div className="flex flex-col gap-2">
            <Button variant="primary" icon={<Send className="size-3.5" />} disabled={!valid || !signers.length} loading={send.isPending} onClick={() => void submit(true).catch(() => undefined)}>حفظ وإرسال للتوقيع</Button>
            <Button variant="ghost" disabled={!valid} loading={save.isPending && !send.isPending} onClick={() => void submit(false).catch(() => undefined)}>حفظ كمسودة</Button>
          </div>
        </aside>
      </div>
    </ModuleShell>
  );
}

function SignerSearch({ exclude, onPick }: { exclude: string[]; onPick: (u: { id: string; name: string }) => void }) {
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const r = trpc.documents.signers.useQuery({ q: deferred }, { enabled: deferred.length >= 2, placeholderData: (p) => p });
  const options = (r.data ?? []).filter((u) => !exclude.includes(u.id));
  return (
    <div className="mt-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="أضف موقّعاً: ابحث بالاسم أو البريد" aria-label="بحث عن موقّع" />
      {deferred.length >= 2 ? (
        <ul className="mt-1 max-h-56 overflow-y-auto rounded-md bg-card shadow-[0_0_0_1px_var(--border)] thin-scroll">
          {options.length ? options.map((u) => (
            <li key={u.id}>
              <button type="button" className="flex w-full items-center justify-between gap-2 px-2.5 py-1.5 text-start text-[13px] hover:bg-hover" onClick={() => (onPick(u), setQ(""))}>
                <span className="truncate">{u.name}</span>
                <span className="shrink-0 text-[12px] text-fg-3">{u.isGuardian ? "ولي أمر" : u.label}</span>
              </button>
            </li>
          )) : <li className="px-2.5 py-2 text-[13px] text-fg-3">{r.isFetching ? "جارٍ البحث…" : "لا نتائج"}</li>}
        </ul>
      ) : null}
    </div>
  );
}

// =====================================================================
// عرض المستند والتوقيع
// =====================================================================

export function DocumentViewPage({ id }: { id: string }) {
  const q = trpc.documents.get.useQuery({ id });
  const { user } = useApp();
  const router = useRouter();
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const refresh = () => void utils.documents.invalidate();
  const send = trpc.documents.send.useMutation({ onSuccess: () => (toast.success("أُرسل للتوقيع"), refresh()), onError: (e) => toast.error(e.message) });
  const remind = trpc.documents.remind.useMutation({ onSuccess: () => toast.success("أُرسل تذكير للموقّعين المنتظَرين"), onError: (e) => toast.error(e.message) });
  const archive = trpc.documents.archive.useMutation({ onSuccess: (r) => (toast.success(r.archivedAt ? "نُقل إلى الأرشيف" : "أُعيد من الأرشيف"), refresh()), onError: (e) => toast.error(e.message) });
  const cancel = trpc.documents.cancel.useMutation({ onSuccess: (r) => (toast.success(r.deleted ? "حُذفت المسودة" : "أُلغي المستند"), refresh(), r.deleted ? router.push("/documents?tab=SENT") : setCancelling(false)), onError: (e) => toast.error(e.message) });
  const n = (v: number) => formatNumber(v, prefs.digits);
  if (!q.data) {
    return (
      <ModuleShell nav={nav()} title="مستند" crumbs={[{ title: "مستند" }]}>
        {q.error ? <EmptyState illustration="lock" title="لا يمكن فتح المستند" description={q.error.message} /> : <SkeletonLines lines={10} />}
      </ModuleShell>
    );
  }
  const { doc, file, creator, canEdit, canManage, mySigner, integrity } = q.data;
  const verifyUrl = typeof window === "undefined" ? `/verify/doc/${doc.verifyCode}` : `${window.location.origin}/verify/doc/${doc.verifyCode}`;
  const fmtTime = (d: Date | string) => new Date(d).toLocaleString(prefs.digits === "arab" ? "ar-SA-u-nu-arab-ca-gregory" : "ar-SA-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short" });
  const actions = (
    <span className="flex items-center gap-1">
      {mySigner?.canSignNow ? <Button size="sm" variant="primary" icon={<PenLine className="size-3.5" />} onClick={() => setSigning(true)}>توقيع</Button> : null}
      {canEdit ? <Button size="sm" variant="ghost" onClick={() => router.push(`/documents/${doc.id}/edit`)}>تعديل</Button> : null}
      {canEdit ? <Button size="sm" variant="primary" icon={<Send className="size-3.5" />} loading={send.isPending} disabled={!doc.signers.length} onClick={() => send.mutate({ id: doc.id })}>إرسال للتوقيع</Button> : null}
      {doc.status !== "DRAFT" ? <Button size="sm" variant="ghost" icon={<Printer className="size-3.5" />} onClick={printPage}>طباعة الشهادة</Button> : null}
    </span>
  );
  return (
    <ModuleShell nav={nav()} title={doc.title} crumbs={[{ title: `مستند ${n(doc.number)}` }]} actions={actions} wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h1 className="text-[26px] font-bold leading-tight">{doc.title}</h1>
            <Tag color={DOC_STATUS[doc.status]?.color ?? "gray"}>{DOC_STATUS[doc.status]?.label ?? doc.status}</Tag>
            {doc.archivedAt ? <Tag color="slate">مؤرشف</Tag> : null}
          </div>
          <p className="mb-4 text-[13px] text-fg-3">{DOC_KIND[doc.kind]} · رقم {n(doc.number)} · أنشأه {creator}{doc.sentAt ? ` · أُرسل ${fmtDate(doc.sentAt)}` : ""}{doc.dueDate ? ` · آخر موعد ${fmtDate(doc.dueDate)}` : ""}</p>
          {mySigner && !mySigner.canSignNow ? <p className="no-print mb-3 rounded-md bg-hover px-3 py-2 text-[13px] text-fg-2">التوقيع بالتسلسل: سيُتاح لك التوقيع بعد توقيع من قبلك، وسيصلك إشعار.</p> : null}
          <article className="rounded-lg bg-paper p-8 text-paper-fg shadow-card print:shadow-none">
            <div className="whitespace-pre-wrap text-[15px] leading-8">{doc.body}</div>
            {file ? (
              <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="no-print mt-6 flex w-fit items-center gap-2 rounded-md px-3 py-2 text-[14px] shadow-[0_0_0_1px_var(--border)] hover:bg-hover">
                <Paperclip className="size-4" aria-hidden />{file.name}<span className="text-[12px] opacity-70">({formatBytes(file.size)})</span>
              </a>
            ) : null}
            {doc.signers.some((s) => s.status === "SIGNED") ? (
              <div className="mt-10 grid gap-6 border-t border-black/10 pt-6 sm:grid-cols-2">
                {doc.signers.filter((s) => s.status === "SIGNED").map((s) => (
                  <div key={s.id}>
                    <p className="text-[12px] opacity-70">{s.roleLabel ?? "الموقّع"}</p>
                    {s.method === "DRAW" && s.signatureData ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.signatureData} alt={`توقيع ${s.name}`} className="h-16 w-auto" />
                    ) : <p className="py-3 text-[26px] font-semibold text-signature-ink" style={{ fontStyle: "italic" }}>{s.typedName}</p>}
                    <p className="text-[14px] font-semibold">{s.name}</p>
                    <p className="text-[12px] opacity-70">{s.signedAt ? fmtTime(s.signedAt) : ""}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
          {/* شهادة التوقيع: تظهر في الطباعة فقط */}
          <section className="print-only mt-8 text-[12px]">
            <h2 className="text-[15px] font-bold">شهادة التوقيع الإلكتروني</h2>
            <p>بصمة المحتوى (SHA-256): <span dir="ltr" className="font-mono">{doc.contentHash}</span></p>
            <table className="mt-2 w-full border-collapse">
              <thead><tr><th className="border p-1 text-start">الموقّع</th><th className="border p-1 text-start">الحالة</th><th className="border p-1 text-start">الوقت</th><th className="border p-1 text-start">بصمة التوقيع</th></tr></thead>
              <tbody>{doc.signers.map((s) => <tr key={s.id}><td className="border p-1">{s.name}</td><td className="border p-1">{SIGNER_STATUS[s.status]?.label}</td><td className="border p-1">{s.signedAt ? fmtTime(s.signedAt) : "—"}</td><td className="border p-1 font-mono" dir="ltr">{s.signatureHash?.slice(0, 24) ?? "—"}</td></tr>)}</tbody>
            </table>
            <p className="mt-2">للتحقق: <span dir="ltr">{verifyUrl}</span></p>
          </section>
        </div>
        <aside className="no-print space-y-3">
          {integrity !== null ? (
            <div className={cn("flex items-start gap-2 rounded-lg p-3 text-[13px]", integrity ? "bg-success-50 text-success-800" : "bg-danger-50 text-danger-700")}>
              {integrity ? <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> : <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <div>
                <p className="font-semibold">{integrity ? "المحتوى سليم" : "تغيّر المحتوى بعد الإرسال!"}</p>
                <p className="mt-0.5 break-all font-mono text-[11px] opacity-80" dir="ltr">{doc.contentHash}</p>
              </div>
            </div>
          ) : null}
          <div className="rounded-lg bg-card p-4 shadow-card">
            <p className="text-[15px] font-semibold">الموقّعون {doc.signingOrder === "SEQUENTIAL" ? <span className="text-[12px] font-normal text-fg-3">· بالتسلسل</span> : null}</p>
            <ol className="mt-3 space-y-3">
              {doc.signers.map((s, i) => (
                <li key={s.id} className="flex items-start gap-2.5">
                  <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold tabular", s.status === "SIGNED" ? "bg-success-100 text-success-800" : s.status === "DECLINED" ? "bg-danger-100 text-danger-700" : "bg-hover text-fg-3")}>{s.status === "SIGNED" ? <Check className="size-3.5" /> : s.status === "DECLINED" ? <X className="size-3.5" /> : n(i + 1)}</span>
                  <div className="min-w-0 flex-1 text-[13px]">
                    <p className="font-medium">{s.name}{s.roleLabel ? <span className="font-normal text-fg-3"> — {s.roleLabel}</span> : null}</p>
                    <p className="text-fg-3">{s.status === "SIGNED" && s.signedAt ? `وقّع ${fmtTime(s.signedAt)} · ${s.method === "DRAW" ? "بالرسم" : "بكتابة الاسم"}` : s.status === "DECLINED" ? `رفض: ${s.declineReason ?? ""}` : s.remindedAt ? `بانتظار · ذُكّر ${fmtDate(s.remindedAt)}` : "بانتظار التوقيع"}</p>
                    {s.signatureHash ? <p className="truncate font-mono text-[11px] text-fg-4" dir="ltr" title={s.signatureHash}>{s.signatureHash}</p> : null}
                    {s.ip ? <p className="text-[11px] text-fg-4" dir="ltr">IP {s.ip}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>
          {doc.status !== "DRAFT" ? (
            <div className="rounded-lg bg-card p-4 text-[13px] shadow-card">
              <p className="flex items-center gap-1.5 font-semibold"><Link2 className="size-4 text-fg-3" aria-hidden />رابط التحقق العام</p>
              <p className="mt-1 text-fg-3">يعرض الحالة والموقّعين والبصمات دون نص المستند.</p>
              <div className="mt-2 flex gap-1">
                <Input readOnly value={verifyUrl} dir="ltr" className="h-7 text-[12px]" aria-label="رابط التحقق" />
                <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(verifyUrl).then(() => toast.success("نُسخ الرابط"))}>نسخ</Button>
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {mySigner ? <Button size="sm" variant="ghost" onClick={() => setDeclining(true)}>رفض التوقيع</Button> : null}
            {doc.status === "SENT" && doc.createdById === user.id ? <Button size="sm" variant="ghost" icon={<BellRing className="size-3.5" />} loading={remind.isPending} onClick={() => remind.mutate({ id: doc.id })}>تذكير المنتظرين</Button> : null}
            {canManage && doc.status !== "DRAFT" ? <Button size="sm" variant="ghost" icon={doc.archivedAt ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />} loading={archive.isPending} onClick={() => archive.mutate({ id: doc.id, archived: !doc.archivedAt })}>{doc.archivedAt ? "إعادة من الأرشيف" : "أرشفة"}</Button> : null}
            {canManage && doc.status !== "COMPLETED" && doc.status !== "CANCELLED" ? <Button size="sm" variant="ghost" icon={<Trash2 className="size-3.5" />} onClick={() => setCancelling(true)}>{doc.status === "DRAFT" ? "حذف المسودة" : "إلغاء المستند"}</Button> : null}
          </div>
        </aside>
      </div>
      {signing ? <SignDialog id={doc.id} title={doc.title} onClose={() => setSigning(false)} /> : null}
      {declining ? <DeclineDialog id={doc.id} onClose={() => setDeclining(false)} /> : null}
      <ConfirmDialog open={cancelling} onOpenChange={setCancelling} title={doc.status === "DRAFT" ? "حذف المسودة؟" : "إلغاء المستند؟"} description={doc.status === "DRAFT" ? "تُحذف المسودة وموقّعوها." : "يتوقف التوقيع وتبقى التواقيع السابقة في السجل."} danger confirmLabel={doc.status === "DRAFT" ? "حذف" : "إلغاء المستند"} loading={cancel.isPending} onConfirm={() => cancel.mutate({ id: doc.id })} />
    </ModuleShell>
  );
}

function DeclineDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [reason, setReason] = useState("");
  const decline = trpc.documents.decline.useMutation({ onSuccess: () => (toast.success("سُجّل رفضك وأُبلغ المنشئ"), void utils.documents.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="رفض التوقيع" description="يُبلَّغ منشئ المستند بالسبب ويتوقف التوقيع." width={480}>
        <div className="px-5 pb-4"><Field label="السبب"><Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>تراجع</Button>
          <Button variant="danger" loading={decline.isPending} disabled={reason.trim().length < 3} onClick={() => decline.mutate({ id, reason })}>رفض</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignDialog({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [method, setMethod] = useState<"DRAW" | "TYPE">("DRAW");
  const [typed, setTyped] = useState("");
  const [drawn, setDrawn] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const sign = trpc.documents.sign.useMutation({ onSuccess: () => (toast.success("وُقّع المستند"), void utils.documents.invalidate(), onClose()), onError: (e) => toast.error(e.message) });
  const ready = agree && (method === "DRAW" ? Boolean(drawn) : typed.trim().length >= 3);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="التوقيع الإلكتروني" description={title} width={560}>
        <div className="space-y-3 px-5 pb-4">
          <Segmented value={method} onChange={(m) => setMethod(m as "DRAW" | "TYPE")} options={[{ value: "DRAW", label: "رسم التوقيع" }, { value: "TYPE", label: "كتابة الاسم" }]} />
          {method === "DRAW" ? <SignaturePad onChange={setDrawn} /> : (
            <>
              <Field label="اسمك الكامل"><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus /></Field>
              <div className="grid h-24 place-items-center rounded-md bg-paper text-[30px] font-semibold text-signature-ink shadow-[0_0_0_1px_var(--border)]" style={{ fontStyle: "italic" }} aria-hidden>{typed || " "}</div>
            </>
          )}
          <label className="flex items-start gap-2 text-[13px] leading-6">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1.5 size-4 accent-[var(--navy-700)]" />
            أقرّ بأنني قرأت المستند كاملاً وأن هذا توقيعي الإلكتروني الملزم، وأعلم أنه يُسجَّل مع الوقت وعنوان الجهاز وبصمة المحتوى.
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" icon={<PenLine className="size-3.5" />} loading={sign.isPending} disabled={!ready} onClick={() => sign.mutate({ id, method, signatureData: method === "DRAW" ? drawn : null, typedName: method === "TYPE" ? typed : null, agree })}>توقيع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** لوحة رسم التوقيع (فأرة/لمس/قلم) وتخرج صورة PNG */
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokes = useRef(0);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = getComputedStyle(c).getPropertyValue("--signature-ink").trim() || "currentColor";
  }, []);
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    strokes.current = 0;
    onChange(null);
  };
  return (
    <div>
      <canvas
        ref={ref}
        className="h-40 w-full touch-none rounded-md bg-paper shadow-[0_0_0_1px_var(--border)]"
        aria-label="مساحة رسم التوقيع"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d")!;
          const p = pos(e);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const p = pos(e);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }}
        onPointerUp={(e) => {
          if (!drawing.current) return;
          drawing.current = false;
          strokes.current += 1;
          onChange(e.currentTarget.toDataURL("image/png"));
        }}
      />
      <div className="mt-1 flex items-center justify-between text-[12px] text-fg-3">
        <span>ارسم توقيعك داخل الإطار</span>
        <button type="button" className="flex items-center gap-1 hover:text-fg" onClick={clear}><Eraser className="size-3.5" aria-hidden />مسح</button>
      </div>
    </div>
  );
}
