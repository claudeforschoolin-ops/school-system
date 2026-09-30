"use client";
/**
 * الدعم الفني والتدريب: تذاكر الدعم (للمستخدم ولفريق الدعم مع الملاحظات الداخلية والتقييم)،
 * وقاعدة المعرفة بالبحث والتقييم والتحرير.
 */
import { BookOpen, Lock, MessageSquarePlus, Pencil, Plus, Search, Star, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useDeferredValue, useState, type ReactNode } from "react";
import { formatRelative } from "@/lib/dates";
import { MODULE_NAV } from "@/lib/modules-nav";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ModuleShell, type ModuleTab } from "@/components/modules/module-shell";
import { usePrefs } from "@/components/shell/app-context";
import { PageTopbar } from "@/components/shell/page-topbar";
import { useTabMeta } from "@/components/shell/tabs-bar";
import { FinTable, useFmtDate } from "@/components/finance/common";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { SwitchRow } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";

const nav = () => MODULE_NAV.find((m) => m.key === "support")!;
export const SUPPORT_TABS: ModuleTab[] = [
  { href: "/support", label: "التذاكر", exact: true },
  { href: "/help/kb", label: "قاعدة المعرفة" },
];

export const TICKET_CATEGORY: Record<string, string> = { TECHNICAL: "مشكلة تقنية", ACCOUNT: "الحساب والدخول", DATA: "تصحيح بيانات", TRAINING: "استفسار/تدريب", FEATURE: "اقتراح تحسين", OTHER: "أخرى" };
export const TICKET_STATUS: Record<string, { label: string; color: "gray" | "navy" | "gold" | "green" | "slate" }> = { OPEN: { label: "مفتوحة", color: "gray" }, IN_PROGRESS: { label: "قيد المعالجة", color: "navy" }, WAITING: { label: "بانتظار الرد", color: "gold" }, RESOLVED: { label: "محلولة", color: "green" }, CLOSED: { label: "مغلقة", color: "slate" } };
const PRIORITY: Record<string, { label: string; color: "gray" | "navy" | "orange" | "red" }> = { LOW: { label: "منخفضة", color: "gray" }, MEDIUM: { label: "متوسطة", color: "navy" }, HIGH: { label: "عالية", color: "orange" }, URGENT: { label: "عاجلة", color: "red" } };

// =====================================================================
// التذاكر
// =====================================================================

export function SupportPage() {
  const params = useSearchParams();
  const router = useRouter();
  const prefs = usePrefs();
  const status = params.get("status") ?? "ACTIVE";
  const mine = params.get("mine") === "1";
  const q = trpc.support.tickets.useQuery({ status: status === "ALL" ? null : status, mine }, { placeholderData: (p) => p });
  const [creating, setCreating] = useState(params.get("new") === "1");
  const n = (v: number) => formatNumber(v, prefs.digits);
  const hours = (h: number | null) => (h === null ? "—" : h < 24 ? `${n(h)} ساعة` : `${n(Math.round((h / 24) * 10) / 10)} يوم`);
  const set = (k: string, v: string | null) => {
    const s = new URLSearchParams(params.toString());
    if (v) s.set(k, v);
    else s.delete(k);
    s.delete("new");
    router.replace(`/support?${s.toString()}`);
  };
  const stats = q.data?.stats;
  return (
    <ModuleShell nav={nav()} tabs={SUPPORT_TABS} wide actions={<Button size="sm" variant="primary" icon={<MessageSquarePlus className="size-3.5" />} onClick={() => setCreating(true)}>تذكرة جديدة</Button>}>
      {stats ? (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {(["OPEN", "IN_PROGRESS", "WAITING"] as const).map((s) => (
            <button key={s} type="button" onClick={() => set("status", s)} className="rounded-lg bg-card p-4 text-start shadow-card hover:shadow-card-hover">
              <p className="text-[13px] text-fg-3">{TICKET_STATUS[s]!.label}</p>
              <p className="mt-1 text-[24px] font-bold tabular">{n(stats.byStatus[s] ?? 0)}</p>
            </button>
          ))}
          <div className="rounded-lg bg-card p-4 shadow-card">
            <p className="text-[13px] text-fg-3">متوسط أول رد · الحل</p>
            <p className="mt-1 text-[18px] font-bold">{hours(stats.avgFirstResponseHours)} · {hours(stats.avgResolveHours)}</p>
            <p className="text-[12px] text-fg-3">آخر ٩٠ يوماً</p>
          </div>
          <div className="rounded-lg bg-card p-4 shadow-card">
            <p className="text-[13px] text-fg-3">رضا المستخدمين</p>
            <p className="mt-1 flex items-center gap-1 text-[24px] font-bold">{stats.satisfaction === null ? "—" : n(stats.satisfaction)}<span className="text-[13px] font-normal text-fg-3">/ {n(5)}</span></p>
          </div>
        </div>
      ) : null}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={status} onChange={(s) => set("status", s)} options={[{ value: "ACTIVE", label: "النشطة" }, { value: "RESOLVED", label: "المحلولة" }, { value: "CLOSED", label: "المغلقة" }, { value: "ALL", label: "الكل" }]} />
        {q.data?.agent ? <Segmented value={mine ? "1" : "0"} onChange={(m) => set("mine", m === "1" ? "1" : null)} options={[{ value: "0", label: "كل المدرسة" }, { value: "1", label: "تذاكري أنا" }]} /> : null}
      </div>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض التذاكر" description={q.error.message} /> : null}
      {!q.data ? (q.error ? null : <SkeletonLines lines={6} />) : q.data.rows.length ? (
        <FinTable head={<tr><th>الرقم</th><th>الموضوع</th><th>التصنيف</th><th>الأولوية</th><th>الحالة</th>{q.data.agent ? <><th>مقدّمها</th><th>المسؤول</th></> : null}<th>آخر تحديث</th></tr>}>
          {q.data.rows.map((t) => (
            <tr key={t.id} className="cursor-pointer hover:bg-hover" onClick={() => router.push(`/support/${t.id}`)}>
              <td className="tabular">{n(t.number)}</td>
              <td><Link href={`/support/${t.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{t.title}</Link>{t.replies ? <span className="ms-2 text-[12px] text-fg-3">{n(t.replies)} رد</span> : null}</td>
              <td>{TICKET_CATEGORY[t.category] ?? t.category}</td>
              <td><Tag color={PRIORITY[t.priority]?.color ?? "gray"}>{PRIORITY[t.priority]?.label ?? t.priority}</Tag></td>
              <td><Tag color={TICKET_STATUS[t.status]?.color ?? "gray"}>{TICKET_STATUS[t.status]?.label ?? t.status}</Tag></td>
              {q.data.agent ? (
                <>
                  <td>{t.requester?.name ?? "—"}</td>
                  <td className="text-fg-3">{t.assignee?.name ?? "غير مُسندة"}</td>
                </>
              ) : null}
              <td className="whitespace-nowrap text-fg-3">{formatRelative(t.updatedAt, new Date(), prefs.digits)}</td>
            </tr>
          ))}
        </FinTable>
      ) : (
        <EmptyState illustration="inbox" title={status === "ACTIVE" ? "لا تذاكر نشطة" : "لا تذاكر هنا"} description="واجهت مشكلة أو لديك سؤال؟ ابحث في قاعدة المعرفة أولاً، أو افتح تذكرة ويرد عليك فريق الدعم." action={<Button variant="primary" onClick={() => setCreating(true)}>فتح تذكرة</Button>} />
      )}
      {creating ? <NewTicketDialog from={params.get("from")} onClose={() => setCreating(false)} /> : null}
    </ModuleShell>
  );
}

function NewTicketDialog({ from, onClose }: { from: string | null; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [v, setV] = useState({ title: "", description: "", category: "TECHNICAL" as keyof typeof TICKET_CATEGORY, priority: "MEDIUM" as "LOW" | "MEDIUM" | "HIGH" | "URGENT", pageUrl: from ?? "" });
  const deferred = useDeferredValue(v.title.trim());
  const suggestions = trpc.support.articles.useQuery({ q: deferred }, { enabled: deferred.length >= 4 });
  const create = trpc.support.create.useMutation({ onSuccess: (t) => (toast.success(`فُتحت التذكرة رقم ${t.number}`), void utils.support.invalidate(), router.push(`/support/${t.id}`)), onError: (e) => toast.error(e.message) });
  const hits = suggestions.data?.rows.filter((a) => a.isPublished).slice(0, 3) ?? [];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="تذكرة دعم جديدة" width={600}>
        <div className="space-y-3 px-5 pb-4">
          <Field label="الموضوع"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="مثال: لا يظهر كشف الرصد لفصل ٣/أ" autoFocus /></Field>
          {hits.length ? (
            <div className="rounded-md bg-navy-50 p-3 text-[13px] dark:bg-hover">
              <p className="font-medium">قد تجد الحل هنا:</p>
              <ul className="mt-1 space-y-0.5">{hits.map((a) => <li key={a.id}><Link href={`/help/kb/${a.slug}`} className="text-navy-600 underline" target="_blank">{a.title}</Link></li>)}</ul>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="التصنيف"><Select value={v.category} onChange={(category) => setV({ ...v, category })} options={Object.entries(TICKET_CATEGORY).map(([value, label]) => ({ value, label }))} /></Field>
            <Field label="الأولوية"><Select value={v.priority} onChange={(priority) => setV({ ...v, priority: priority as typeof v.priority })} options={Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label }))} /></Field>
          </div>
          <Field label="الوصف" hint="ما الذي حاولت فعله؟ وما الذي حدث؟ وما الذي توقعته؟"><Textarea rows={6} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
          <Field label="الصفحة المتعلقة (اختياري)"><Input dir="ltr" value={v.pageUrl} onChange={(e) => setV({ ...v, pageUrl: e.target.value })} placeholder="/assessment/grades" /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={create.isPending} disabled={v.title.trim().length < 5 || v.description.trim().length < 10} onClick={() => create.mutate({ ...v, category: v.category as "TECHNICAL", pageUrl: v.pageUrl || null })}>إرسال</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TicketDetail = RouterOutputs["support"]["ticket"];

export function TicketPage({ id }: { id: string }) {
  const q = trpc.support.ticket.useQuery({ id });
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const n = (v: number) => formatNumber(v, prefs.digits);
  if (!q.data) {
    return (
      <ModuleShell nav={nav()} title="تذكرة" crumbs={[{ title: "تذكرة" }]}>
        {q.error ? <EmptyState illustration="lock" title="لا يمكن فتح التذكرة" description={q.error.message} /> : <SkeletonLines lines={8} />}
      </ModuleShell>
    );
  }
  const { ticket: t, replies, requester, assignee, agent } = q.data;
  return (
    <ModuleShell nav={nav()} title={t.title} crumbs={[{ title: `تذكرة ${n(t.number)}` }]} wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <h1 className="text-[24px] font-bold leading-tight">{t.title}</h1>
            <Tag color={TICKET_STATUS[t.status]?.color ?? "gray"}>{TICKET_STATUS[t.status]?.label ?? t.status}</Tag>
          </div>
          <ol className="space-y-3">
            <Message name={requester?.name ?? "—"} color={requester?.avatarColor} at={t.createdAt} body={t.description} />
            {replies.map((r) => <Message key={r.id} name={r.author?.name ?? "—"} color={r.author?.avatarColor} at={r.createdAt} body={r.body} internal={r.isInternal} agent={r.fromAgent} />)}
          </ol>
          {t.status !== "CLOSED" ? <Composer ticket={q.data} /> : <p className="mt-4 rounded-md bg-hover px-3 py-2 text-[13px] text-fg-3">أُغلقت التذكرة{t.satisfaction ? ` · تقييم ${n(t.satisfaction)} من ${n(5)}` : ""}. افتح تذكرة جديدة إن احتجت.</p>}
        </div>
        <aside className="space-y-3">
          <div className="rounded-lg bg-card p-4 text-[13px] shadow-card">
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
              <dt className="text-fg-3">الرقم</dt><dd className="tabular">{n(t.number)}</dd>
              <dt className="text-fg-3">التصنيف</dt><dd>{TICKET_CATEGORY[t.category]}</dd>
              <dt className="text-fg-3">الأولوية</dt><dd><Tag color={PRIORITY[t.priority]?.color ?? "gray"}>{PRIORITY[t.priority]?.label}</Tag></dd>
              <dt className="text-fg-3">مقدّمها</dt><dd>{requester?.name}{requester?.jobTitle ? <span className="text-fg-3"> — {requester.jobTitle}</span> : null}</dd>
              <dt className="text-fg-3">المسؤول</dt><dd>{assignee?.name ?? "غير مُسندة"}</dd>
              <dt className="text-fg-3">فُتحت</dt><dd>{fmtDate(t.createdAt)}</dd>
              {t.pageUrl ? <><dt className="text-fg-3">الصفحة</dt><dd><Link href={t.pageUrl.startsWith("/") ? t.pageUrl : "#"} dir="ltr" className="text-navy-600 underline">{t.pageUrl}</Link></dd></> : null}
              {t.resolution ? <><dt className="text-fg-3">الحل</dt><dd>{t.resolution}</dd></> : null}
            </dl>
          </div>
          {agent ? <AgentPanel ticket={q.data} /> : null}
          <CloseCard ticket={q.data} />
        </aside>
      </div>
    </ModuleShell>
  );
}

function Message({ name, color, at, body, internal, agent }: { name: string; color?: string | null; at: Date | string; body: string; internal?: boolean; agent?: boolean }) {
  const prefs = usePrefs();
  return (
    <li className={cn("rounded-lg p-4 shadow-card", internal ? "bg-gold-50" : "bg-card")}>
      <div className="mb-2 flex items-center gap-2 text-[13px]">
        <Avatar name={name} color={color} size={24} />
        <span className="font-medium">{name}</span>
        {agent ? <Tag color="navy">الدعم الفني</Tag> : null}
        {internal ? <Tag color="gold"><Lock className="me-0.5 inline size-3" aria-hidden />ملاحظة داخلية</Tag> : null}
        <span className="text-fg-3">{formatRelative(at, new Date(), prefs.digits)}</span>
      </div>
      <p className="whitespace-pre-wrap text-[14px] leading-7">{body}</p>
    </li>
  );
}

function Composer({ ticket }: { ticket: TicketDetail }) {
  const utils = trpc.useUtils();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [status, setStatus] = useState<string>("KEEP");
  const reply = trpc.support.reply.useMutation({ onSuccess: () => (setBody(""), setInternal(false), setStatus("KEEP"), toast.success(internal ? "أُضيفت الملاحظة" : "أُرسل الرد"), void utils.support.invalidate()), onError: (e) => toast.error(e.message) });
  return (
    <div className="mt-4 rounded-lg bg-card p-4 shadow-card">
      <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? "ملاحظة لا يراها مقدّم التذكرة…" : "اكتب ردك…"} aria-label="الرد" className={internal ? "bg-gold-50" : undefined} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {ticket.agent ? (
          <div className="flex flex-wrap items-center gap-3">
            <SwitchRow size="sm" checked={internal} onChange={setInternal} label="ملاحظة داخلية" />
            {!internal ? <Select size="sm" className="w-44" value={status} onChange={setStatus} options={[{ value: "KEEP", label: "إبقاء الحالة" }, { value: "WAITING", label: "بانتظار رد المستخدم" }, { value: "RESOLVED", label: "تعيينها محلولة" }]} /> : null}
          </div>
        ) : <span />}
        <Button size="sm" variant="primary" loading={reply.isPending} disabled={body.trim().length < 2} onClick={() => reply.mutate({ id: ticket.ticket.id, body, isInternal: internal, status: status === "KEEP" || internal ? null : (status as "WAITING") })}>{internal ? "إضافة ملاحظة" : "إرسال"}</Button>
      </div>
    </div>
  );
}

function AgentPanel({ ticket }: { ticket: TicketDetail }) {
  const utils = trpc.useUtils();
  const t = ticket.ticket;
  const [resolution, setResolution] = useState(t.resolution ?? "");
  const update = trpc.support.update.useMutation({ onSuccess: () => (toast.success("حُدّثت التذكرة"), void utils.support.invalidate()), onError: (e) => toast.error(e.message) });
  return (
    <div className="space-y-3 rounded-lg bg-card p-4 shadow-card">
      <p className="text-[14px] font-semibold">إدارة التذكرة</p>
      <Field label="المسؤول"><Select size="sm" value={t.assigneeId ?? "NONE"} onChange={(a) => update.mutate({ id: t.id, assigneeId: a === "NONE" ? null : a })} options={[{ value: "NONE", label: "غير مُسندة" }, ...ticket.team.map((u) => ({ value: u.id, label: u.name }))]} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="الحالة"><Select size="sm" value={t.status} onChange={(s) => update.mutate({ id: t.id, status: s as "OPEN" })} options={Object.entries(TICKET_STATUS).map(([value, s]) => ({ value, label: s.label }))} /></Field>
        <Field label="الأولوية"><Select size="sm" value={t.priority} onChange={(p) => update.mutate({ id: t.id, priority: p as "LOW" })} options={Object.entries(PRIORITY).map(([value, p]) => ({ value, label: p.label }))} /></Field>
      </div>
      <Field label="ملخص الحل"><Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
      <Button size="sm" variant="secondary" disabled={resolution === (t.resolution ?? "")} loading={update.isPending} onClick={() => update.mutate({ id: t.id, resolution: resolution || null })}>حفظ الحل</Button>
    </div>
  );
}

function CloseCard({ ticket }: { ticket: TicketDetail }) {
  const utils = trpc.useUtils();
  const prefs = usePrefs();
  const [rating, setRating] = useState(0);
  const t = ticket.ticket;
  const close = trpc.support.close.useMutation({ onSuccess: () => (toast.success("شكراً لتقييمك، أُغلقت التذكرة"), void utils.support.invalidate()), onError: (e) => toast.error(e.message) });
  const { data } = trpc.account.context.useQuery();
  if (t.status === "CLOSED" || data?.user.id !== t.requesterId) return null;
  return (
    <div className="rounded-lg bg-card p-4 shadow-card">
      <p className="text-[14px] font-semibold">{t.status === "RESOLVED" ? "هل حُلّت مشكلتك؟" : "إغلاق التذكرة"}</p>
      <p className="mt-1 text-[12px] text-fg-3">قيّم الخدمة ثم أغلق التذكرة.</p>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label="التقييم">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" role="radio" aria-checked={rating === i} aria-label={`${formatNumber(i, prefs.digits)} من ٥`} onClick={() => setRating(i)} className="rounded p-0.5 text-gold-700 hover:bg-hover">
            <Star className={cn("size-5", i <= rating ? "fill-current" : "")} />
          </button>
        ))}
      </div>
      <Button size="sm" variant="primary" className="mt-3" disabled={!rating} loading={close.isPending} onClick={() => close.mutate({ id: t.id, satisfaction: rating })}>إغلاق التذكرة</Button>
    </div>
  );
}

// =====================================================================
// قاعدة المعرفة
// =====================================================================

type Article = RouterOutputs["support"]["articles"]["rows"][number];

export function KnowledgeBasePage() {
  const params = useSearchParams();
  const router = useRouter();
  const prefs = usePrefs();
  const category = params.get("c");
  const [q, setQ] = useState(params.get("q") ?? "");
  const deferred = useDeferredValue(q.trim());
  const list = trpc.support.articles.useQuery({ q: deferred || null, category }, { placeholderData: (p) => p });
  const [editing, setEditing] = useState<"new" | null>(null);
  const groups = new Map<string, Article[]>();
  for (const a of list.data?.rows ?? []) groups.set(a.category, [...(groups.get(a.category) ?? []), a]);
  return (
    <ModuleShell nav={nav()} tabs={SUPPORT_TABS} actions={list.data?.canEdit ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setEditing("new")}>مقال جديد</Button> : null}>
      <label className="relative mb-4 block max-w-[520px]">
        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث: كيف أرصد الدرجات؟ استرداد رسوم؟ نسيت كلمة المرور…" className="h-10 ps-9 text-[15px]" aria-label="بحث في قاعدة المعرفة" />
      </label>
      {list.data?.categories.length ? (
        <div className="mb-5 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => router.replace("/help/kb")} className={cn("rounded-full px-3 py-1 text-[13px]", !category ? "bg-navy-700 text-on-primary" : "bg-hover text-fg-2 hover:bg-active")}>الكل</button>
          {list.data.categories.map((c) => <button key={c} type="button" onClick={() => router.replace(`/help/kb?c=${encodeURIComponent(c)}`)} className={cn("rounded-full px-3 py-1 text-[13px]", category === c ? "bg-navy-700 text-on-primary" : "bg-hover text-fg-2 hover:bg-active")}>{c}</button>)}
        </div>
      ) : null}
      {list.error ? <EmptyState illustration="lock" title="لا يمكن عرض قاعدة المعرفة" description={list.error.message} /> : null}
      {!list.data ? (list.error ? null : <SkeletonLines lines={6} />) : list.data.rows.length ? (
        <div className="space-y-6">
          {[...groups.entries()].map(([cat, rows]) => (
            <section key={cat}>
              <h2 className="mb-2 text-[15px] font-semibold text-fg-2">{cat}</h2>
              <div className="grid gap-2 md:grid-cols-2">
                {rows.map((a) => (
                  <Link key={a.id} href={`/help/kb/${a.slug}`} className="flex items-start gap-3 rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-card-hover">
                    <BookOpen className="mt-0.5 size-4 shrink-0 text-fg-3" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-medium">{a.title}{!a.isPublished ? <Tag color="gray" className="ms-2">مسودة</Tag> : null}</p>
                      {a.summary ? <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-3">{a.summary}</p> : null}
                      <p className="mt-1 text-[12px] text-fg-4">{formatNumber(a.views, prefs.digits)} مشاهدة{a.helpfulYes + a.helpfulNo ? ` · أفاد ${formatNumber(Math.round((a.helpfulYes / (a.helpfulYes + a.helpfulNo)) * 100), prefs.digits)}٪` : ""}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState illustration="search" title={deferred ? "لا مقالات مطابقة" : "لا مقالات بعد"} description={deferred ? "جرّب كلمات أخرى، أو افتح تذكرة ويجيبك فريق الدعم." : "مقالات الإرشاد تساعد المستخدمين على حل مشكلاتهم بأنفسهم."} action={<Button variant="primary" onClick={() => router.push("/support?new=1")}>فتح تذكرة دعم</Button>} />
      )}
      {editing ? <ArticleDialog article={null} onClose={() => setEditing(null)} /> : null}
    </ModuleShell>
  );
}

export function ArticlePage({ slug }: { slug: string }) {
  const q = trpc.support.article.useQuery({ slug: decodeURIComponent(slug) }, { staleTime: 60_000 });
  const fmtDate = useFmtDate();
  const [rated, setRated] = useState<boolean | null>(null);
  const [editing, setEditing] = useState(false);
  const rate = trpc.support.rateArticle.useMutation({ onError: (e) => toast.error(e.message) });
  useTabMeta(q.data?.article.title ?? "قاعدة المعرفة", "lucide:book-open");
  return (
    <>
      <PageTopbar crumbs={[{ title: "المساعدة", icon: "lucide:circle-help", href: "/help" }, { title: "قاعدة المعرفة", icon: "lucide:book-open", href: "/help/kb" }, { title: q.data?.article.title ?? "…" }]} actions={q.data?.canEdit ? <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => setEditing(true)}>تحرير</Button> : null} />
      <div className="mx-auto w-full max-w-[760px] px-6 pb-24 pt-10 md:px-12">
        {q.error ? <EmptyState illustration="search" title="المقال غير موجود" description={q.error.message} action={<Link href="/help/kb" className="text-navy-600 underline">العودة لقاعدة المعرفة</Link>} /> : !q.data ? <SkeletonLines lines={10} /> : (
          <>
            <p className="text-[13px] text-fg-3">{q.data.article.category}</p>
            <h1 className="mt-1 text-[32px] font-bold leading-tight">{q.data.article.title}</h1>
            {q.data.article.summary ? <p className="mt-2 text-[16px] text-fg-2">{q.data.article.summary}</p> : null}
            <p className="mt-2 text-[12px] text-fg-4">آخر تحديث {fmtDate(q.data.article.updatedAt)}</p>
            <div className="mt-6"><SimpleMarkdown text={q.data.article.body} /></div>
            <div className="mt-10 flex flex-wrap items-center gap-3 rounded-lg bg-card p-4 shadow-card">
              {rated === null ? (
                <>
                  <span className="text-[14px] font-medium">هل أفادك هذا المقال؟</span>
                  <Button size="sm" variant="secondary" icon={<ThumbsUp className="size-3.5" />} onClick={() => (setRated(true), rate.mutate({ id: q.data.article.id, helpful: true }))}>نعم</Button>
                  <Button size="sm" variant="secondary" icon={<ThumbsDown className="size-3.5" />} onClick={() => (setRated(false), rate.mutate({ id: q.data.article.id, helpful: false }))}>لا</Button>
                </>
              ) : rated ? <span className="text-[14px]">شكراً لك! سعداء بأنه أفادك.</span> : <span className="text-[14px]">نأسف لذلك. <Link href={`/support?new=1&from=${encodeURIComponent(`/help/kb/${q.data.article.slug}`)}`} className="text-navy-600 underline">افتح تذكرة</Link> ويساعدك فريق الدعم.</span>}
            </div>
            {q.data.related.length ? (
              <section className="mt-8">
                <h2 className="text-[15px] font-semibold">مقالات ذات صلة</h2>
                <ul className="mt-2 space-y-1 text-[14px]">{q.data.related.map((r) => <li key={r.slug}><Link href={`/help/kb/${r.slug}`} className="text-navy-600 underline">{r.title}</Link></li>)}</ul>
              </section>
            ) : null}
          </>
        )}
      </div>
      {editing && q.data ? <ArticleDialog article={q.data.article} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

function ArticleDialog({ article, onClose }: { article: { id: string; title: string; category: string; summary: string | null; body: string; isPublished: boolean } | null; onClose: () => void }) {
  const utils = trpc.useUtils();
  const router = useRouter();
  const [v, setV] = useState({ title: article?.title ?? "", category: article?.category ?? "عام", summary: article?.summary ?? "", body: article?.body ?? "", isPublished: article?.isPublished ?? true });
  const save = trpc.support.saveArticle.useMutation({ onSuccess: (a) => (toast.success("حُفظ المقال"), void utils.support.invalidate(), onClose(), router.push(`/help/kb/${a.slug}`)), onError: (e) => toast.error(e.message) });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={article ? "تحرير المقال" : "مقال جديد"} width={760}>
        <div className="space-y-3 px-5 pb-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <Field label="العنوان"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></Field>
            <Field label="التصنيف"><Input value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} /></Field>
          </div>
          <Field label="ملخص"><Input value={v.summary} onChange={(e) => setV({ ...v, summary: e.target.value })} /></Field>
          <Field label="المحتوى" hint="سطر يبدأ بـ ## عنوان فرعي، و- لقائمة نقطية، و١. أو 1. لخطوات مرقّمة"><Textarea rows={14} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} className="leading-7" /></Field>
          <SwitchRow checked={v.isPublished} onChange={(isPublished) => setV({ ...v, isPublished })} label="منشور للجميع" hint="المسودة يراها فريق الدعم فقط" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" loading={save.isPending} disabled={v.title.trim().length < 3 || v.body.trim().length < 20} onClick={() => save.mutate({ id: article?.id ?? null, ...v, summary: v.summary || null })}>حفظ</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** عرض نص المقال: عناوين فرعية وقوائم وفقرات (بلا HTML خام) */
export function SimpleMarkdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={`l${blocks.length}`} className={cn("my-3 space-y-1.5 ps-6 text-[15px] leading-7 text-fg-2", list.ordered ? "list-decimal" : "list-disc")}>{list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Tag>);
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = /^[-•]\s+(.*)$/.exec(line);
    const numbered = /^[0-9٠-٩]+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]!);
      continue;
    }
    flush();
    if (!line) continue;
    if (line.startsWith("## ")) blocks.push(<h2 key={`h${blocks.length}`} className="mt-6 text-[20px] font-bold">{line.slice(3)}</h2>);
    else if (line.startsWith("> ")) blocks.push(<p key={`n${blocks.length}`} className="my-3 rounded-md bg-hover px-4 py-3 text-[14px] leading-7">{inline(line.slice(2))}</p>);
    else blocks.push(<p key={`p${blocks.length}`} className="my-3 text-[15px] leading-7 text-fg-2">{inline(line)}</p>);
  }
  flush();
  return <div>{blocks}</div>;
}

/** **غامق** فقط داخل السطر */
function inline(s: string) {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>));
}
