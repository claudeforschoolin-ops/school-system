"use client";
/**
 * محفظة المشاريع: بطاقات بالتقدم والصحة، ومخطط زمني للمحفظة (جانت على مستوى المشاريع)،
 * وإنشاء مشروع من قالب. داخل المشروع: لوحة كانبان ومخطط جانت وجدول وتقويم (محرك قواعد البيانات).
 */
import { AlertTriangle, CalendarRange, LayoutGrid, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { MODULE_NAV } from "@/lib/modules-nav";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { ModuleShell } from "@/components/modules/module-shell";
import { usePrefs } from "@/components/shell/app-context";
import { useFmtDate, useToday } from "@/components/finance/common";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";

const nav = () => MODULE_NAV.find((m) => m.key === "projects")!;
const HEALTH: Record<string, { label: string; color: "green" | "gold" | "red" | "navy" | "gray" }> = { ON_TRACK: { label: "في المسار", color: "navy" }, AT_RISK: { label: "معرّض للتأخر", color: "gold" }, LATE: { label: "متأخر", color: "red" }, DONE: { label: "مكتمل", color: "green" }, EMPTY: { label: "بلا مهام", color: "gray" } };

type Data = RouterOutputs["projects"]["list"];
type Project = Data["projects"][number];

export function ProjectsPage() {
  const params = useSearchParams();
  const router = useRouter();
  const prefs = usePrefs();
  const view = params.get("view") === "timeline" ? "timeline" : "cards";
  const q = trpc.projects.list.useQuery();
  const opts = trpc.projects.options.useQuery();
  const [creating, setCreating] = useState(false);
  const n = (v: number) => formatNumber(v, prefs.digits);
  const list = q.data?.projects ?? [];
  const running = list.filter((p) => p.health !== "DONE" && p.health !== "EMPTY");
  const overdue = list.reduce((s, p) => s + p.overdue, 0);
  return (
    <ModuleShell nav={nav()} wide actions={opts.data?.canCreate ? <Button size="sm" variant="primary" icon={<Plus className="size-3.5" />} onClick={() => setCreating(true)}>مشروع جديد</Button> : null}>
      {q.error ? <EmptyState illustration="lock" title="لا يمكن عرض المشاريع" description={q.error.message} /> : null}
      {!q.data ? (q.error ? null : <SkeletonLines lines={8} />) : list.length ? (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-card p-4 shadow-card"><p className="text-[13px] text-fg-3">مشاريع جارية</p><p className="mt-1 text-[26px] font-bold tabular">{n(running.length)}</p><p className="text-[12px] text-fg-3">من {n(list.length)} مشروعاً</p></div>
            <div className="rounded-lg bg-card p-4 shadow-card"><p className="text-[13px] text-fg-3">مهام متأخرة</p><p className={cn("mt-1 text-[26px] font-bold tabular", overdue && "text-danger-700")}>{n(overdue)}</p><p className="text-[12px] text-fg-3">تجاوزت الاستحقاق ولم تكتمل</p></div>
            <div className="rounded-lg bg-card p-4 shadow-card"><p className="text-[13px] text-fg-3">مشاريع مكتملة</p><p className="mt-1 text-[26px] font-bold tabular">{n(list.filter((p) => p.health === "DONE").length)}</p><p className="text-[12px] text-fg-3">كل مهامها منجزة</p></div>
          </div>
          <div className="mb-4">
            <Segmented value={view} onChange={(v) => router.replace(v === "timeline" ? "/projects?view=timeline" : "/projects")} options={[{ value: "cards", label: "البطاقات" }, { value: "timeline", label: "المخطط الزمني" }]} />
          </div>
          {view === "cards" ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{list.map((p) => <ProjectCard key={p.id} p={p} users={q.data.users} />)}</div>
          ) : <PortfolioTimeline projects={list} />}
        </>
      ) : (
        <EmptyState illustration="table" title="لا مشاريع بعد" description="أنشئ مشروعاً من قالب جاهز (فعالية مدرسية، اعتماد مدرسي، تطوير مقرر، تجهيز مرفق) لتحصل على لوحة مهام ومخطط جانت بمواعيد مقترحة." action={opts.data?.canCreate ? <Button variant="primary" onClick={() => setCreating(true)}>إنشاء مشروع</Button> : undefined} />
      )}
      {creating && opts.data ? <NewProjectDialog options={opts.data} onClose={() => setCreating(false)} /> : null}
    </ModuleShell>
  );
}

function ProjectCard({ p, users }: { p: Project; users: Data["users"] }) {
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const n = (v: number) => formatNumber(v, prefs.digits);
  const pct = Math.round(p.progressBp / 100);
  const members = p.members.map((id) => users.find((u) => u.id === id)).filter((u): u is Data["users"][number] => Boolean(u));
  return (
    <Link href={`/p/${p.id}`} className="flex flex-col rounded-lg bg-card p-4 shadow-card transition-[transform,box-shadow] hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-hover text-fg-2"><PageIcon icon={p.icon} size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold">{p.title}</p>
          <p className="text-[12px] text-fg-3">{p.teamspace}</p>
        </div>
        <Tag color={HEALTH[p.health]!.color}>{HEALTH[p.health]!.label}</Tag>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`إنجاز ${p.title}`}><div className="h-full rounded-full bg-chart-1" style={{ width: `${pct}%` }} /></div>
        <span className="text-[12px] tabular text-fg-2">{n(pct)}٪</span>
      </div>
      <p className="mt-2 text-[12px] text-fg-3">{n(p.done)} من {n(p.total)} مهمة{p.active ? ` · ${n(p.active)} قيد العمل` : ""}{p.overdue ? <span className="text-danger-700"> · {n(p.overdue)} متأخرة</span> : null}</p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div className="min-w-0 text-[12px] text-fg-3">
          {p.from && p.to ? <p className="flex items-center gap-1"><CalendarRange className="size-3.5" aria-hidden />{fmtDate(p.from)} ← {fmtDate(p.to)}</p> : null}
          {p.next ? <p className="truncate">التالي: {p.next.title} ({fmtDate(p.next.due)})</p> : null}
        </div>
        {members.length ? <AvatarStack people={members} size={22} max={4} /> : null}
      </div>
    </Link>
  );
}

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const dayNum = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** مخطط المحفظة: شريط لكل مشروع من أول بداية لآخر استحقاق، والجزء المعتم = نسبة الإنجاز؛ الزمن يجري من اليمين لليسار */
function PortfolioTimeline({ projects }: { projects: Project[] }) {
  const today = useToday();
  const prefs = usePrefs();
  const fmtDate = useFmtDate();
  const dated = projects.filter((p) => p.from && p.to);
  if (!dated.length) return <EmptyState illustration="calendar" title="لا مواعيد بعد" description="أضف تواريخ البداية والاستحقاق لمهام المشاريع لتظهر على المخطط." />;
  const min = Math.min(dayNum(today), ...dated.map((p) => dayNum(p.from!))) - 7;
  const max = Math.max(dayNum(today), ...dated.map((p) => dayNum(p.to!))) + 7;
  const span = max - min + 1;
  const at = (iso: string) => ((dayNum(iso) - min) / span) * 100;
  // علامات بداية كل شهر
  const ticks: Array<{ pct: number; label: string }> = [];
  const d = new Date((min + 1) * 86_400_000);
  d.setUTCDate(1);
  while (d.getTime() / 86_400_000 <= max) {
    const iso = d.toISOString().slice(0, 10);
    if (dayNum(iso) >= min) ticks.push({ pct: at(iso), label: `${MONTHS[d.getUTCMonth()]} ${formatNumber(d.getUTCFullYear(), prefs.digits).replace(/٬|,/g, "")}` });
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  const todayPct = at(today);
  return (
    <div className="rounded-lg bg-card p-4 shadow-card">
      <div className="grid grid-cols-[minmax(140px,220px)_1fr] gap-x-3">
        <div />
        <div className="relative h-6 border-b border-line text-[11px] text-fg-3" aria-hidden>
          {ticks.map((t) => <span key={t.label} className="absolute top-0 whitespace-nowrap border-s border-line ps-1" style={{ insetInlineStart: `${t.pct}%` }}>{t.label}</span>)}
        </div>
        {dated.map((p) => {
          const s = at(p.from!);
          const w = Math.max(0.8, at(p.to!) - s + 100 / span);
          const pct = p.progressBp / 100;
          const late = p.health === "LATE" || p.health === "AT_RISK";
          return (
            <div key={p.id} className="contents">
              <Link href={`/p/${p.id}`} className="flex min-w-0 items-center gap-2 py-2 text-[13px] hover:underline">
                <PageIcon icon={p.icon} size={15} className="text-fg-3" />
                <span className="truncate">{p.title}</span>
                {late ? <AlertTriangle className="size-3.5 shrink-0 text-danger-700" aria-label="متأخر" /> : null}
              </Link>
              <div className="relative h-9 border-b border-line/50">
                {ticks.map((t) => <span key={t.label} className="absolute inset-y-0 border-s border-line/40" style={{ insetInlineStart: `${t.pct}%` }} aria-hidden />)}
                <span className="absolute inset-y-0 border-s-2 border-navy-600/50" style={{ insetInlineStart: `${todayPct}%` }} aria-hidden />
                <Link
                  href={`/p/${p.id}`}
                  className={cn("absolute top-2 h-5 overflow-hidden rounded-[4px]", late ? "bg-danger-100" : "bg-navy-100 dark:bg-hover")}
                  style={{ insetInlineStart: `${s}%`, width: `${w}%` }}
                  title={`${p.title}: ${fmtDate(p.from!)} ← ${fmtDate(p.to!)} · ${formatNumber(Math.round(pct), prefs.digits)}٪`}
                  aria-label={`${p.title} من ${fmtDate(p.from!)} إلى ${fmtDate(p.to!)}، الإنجاز ${formatNumber(Math.round(pct), prefs.digits)}٪`}
                >
                  <span className={cn("block h-full", late ? "bg-danger-700/70" : "bg-chart-1")} style={{ width: `${pct}%` }} />
                </Link>
              </div>
            </div>
          );
        })}
        <div />
        <div className="relative h-5 text-[11px]">
          <span className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-navy-600 rtl:translate-x-1/2" style={{ insetInlineStart: `${todayPct}%` }}>▲ اليوم</span>
        </div>
      </div>
      <p className="mt-2 flex flex-wrap gap-4 text-[12px] text-fg-3">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm bg-chart-1" />المنجز</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm bg-navy-100 dark:bg-hover" />المتبقي</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-5 rounded-sm bg-danger-100" />متأخر</span>
      </p>
    </div>
  );
}

function NewProjectDialog({ options, onClose }: { options: RouterOutputs["projects"]["options"]; onClose: () => void }) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const today = useToday();
  const prefs = usePrefs();
  const [v, setV] = useState({ templateKey: options.templates[0]?.key ?? "blank", title: "", description: "", teamspaceId: options.teamspaces[0]?.id ?? "", startDate: today });
  const create = trpc.projects.create.useMutation({ onSuccess: (r) => (toast.success("أُنشئ المشروع"), void utils.projects.invalidate(), void utils.workspace.sidebar.invalidate(), router.push(`/p/${r.pageId}`)), onError: (e) => toast.error(e.message) });
  const tpl = options.templates.find((t) => t.key === v.templateKey);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="مشروع جديد" description="اختر قالباً لتحصل على المهام والمراحل بمواعيد مقترحة من تاريخ البداية، ثم عدّلها كما تشاء." width={720}>
        <div className="space-y-3 px-5 pb-4">
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="القالب">
            {options.templates.map((t) => (
              <button key={t.key} type="button" role="radio" aria-checked={v.templateKey === t.key} onClick={() => setV({ ...v, templateKey: t.key, title: v.title || (t.key === "blank" ? "" : t.name) })} className={cn("flex items-start gap-2.5 rounded-lg p-3 text-start shadow-[0_0_0_1px_var(--border)] transition-shadow hover:bg-hover", v.templateKey === t.key && "shadow-[0_0_0_2px_var(--navy-600)]")}>
                <PageIcon icon={t.icon} size={18} className="mt-0.5 text-fg-2" />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium">{t.name}</span>
                  <span className="block text-[12px] text-fg-3">{t.description}</span>
                  {t.tasks ? <span className="mt-1 block text-[11px] text-fg-4">{formatNumber(t.tasks, prefs.digits)} مهمة · {formatNumber(t.phases.length, prefs.digits)} مراحل · نحو {formatNumber(t.days, prefs.digits)} يوماً</span> : null}
                </span>
              </button>
            ))}
          </div>
          <Field label="اسم المشروع"><Input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder={tpl?.name} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="مساحة الفريق" hint="يرى المشروع أعضاء المساحة حسب صلاحياتهم"><Select value={v.teamspaceId} onChange={(teamspaceId) => setV({ ...v, teamspaceId })} options={options.teamspaces.map((t) => ({ value: t.id, label: t.name }))} /></Field>
            <Field label="تاريخ البداية"><Input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value })} /></Field>
          </div>
          <Field label="وصف مختصر (اختياري)"><Textarea rows={2} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>إلغاء</Button>
          <Button variant="primary" icon={<LayoutGrid className="size-3.5" />} loading={create.isPending} disabled={v.title.trim().length < 3 || !v.teamspaceId || !v.startDate} onClick={() => create.mutate({ ...v, description: v.description || null })}>إنشاء المشروع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
