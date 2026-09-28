"use client";
/**
 * سجل التدقيق: كل إنشاء وتعديل وحذف ودخول وتصدير مع المستخدم والوقت وعنوان IP
 * والقيم قبل وبعد. قراءة فقط — السجل محمي من التعديل والحذف على مستوى قاعدة البيانات.
 */
import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, Download, Globe, Lock, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ACTION_LABELS, ENTITY_LABELS } from "@/server/db/audit-utils";
import { formatDate, formatRelative, formatTime, toISODate, zonedTimeToUtc } from "@/lib/dates";
import { formatNumber } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/select";
import { SkeletonLines } from "@/components/ui/skeleton";
import { Tag } from "@/components/ui/tag";
import { Tooltip } from "@/components/ui/tooltip";
import { useApp } from "@/components/shell/app-context";
import { SettingsShell } from "@/components/settings/settings-shell";

type AuditItem = RouterOutputs["audit"]["list"]["items"][number];
const ALL = "__all__";

/** لون الإجراء حسب طبيعته */
function actionColor(action: string): string {
  if (action.startsWith("CREATE") || action === "RESTORE" || action === "APPROVE" || action === "TWO_FACTOR_ENABLE") return "green";
  if (action.startsWith("DELETE") || action === "SOFT_DELETE" || action === "REJECT" || action === "LOGIN_FAILED" || action === "LOCKED" || action === "TWO_FACTOR_DISABLE") return "red";
  if (action.startsWith("UPDATE")) return "navy";
  if (action === "EXPORT") return "purple";
  if (action === "PERMISSION_CHANGE" || action === "SESSION_REVOKE" || action.startsWith("PASSWORD")) return "orange";
  return "gray";
}

/** أسماء عربية لأشهر الحقول في الفروقات */
const FIELD_LABELS: Record<string, string> = {
  title: "العنوان",
  name: "الاسم",
  description: "الوصف",
  status: "الحالة",
  values: "القيم",
  content: "المحتوى",
  icon: "الأيقونة",
  cover: "الغلاف",
  position: "الترتيب",
  parentId: "الأصل",
  teamspaceId: "مساحة الفريق",
  deletedAt: "تاريخ الحذف",
  archivedAt: "تاريخ الأرشفة",
  email: "البريد",
  phone: "الجوال",
  jobTitle: "المسمى الوظيفي",
  isLocked: "مقفلة",
  isPrivate: "خاصة",
  level: "مستوى الوصول",
  config: "الإعدادات",
  type: "النوع",
  body: "النص",
  resolvedAt: "تاريخ الحل",
  startAt: "البداية",
  endAt: "النهاية",
  scope: "النطاق",
  permissions: "الصلاحيات",
  roles: "الأدوار",
  enabled: "مفعّلة",
  twoFactorEnabled: "المصادقة الثنائية",
  lockedUntil: "مقفل حتى",
  platformName: "اسم المنصة",
  accentColor: "اللون الرئيسي",
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function AuditPage() {
  const { can, prefs, tenant } = useApp();
  const [search, setSearch] = useState("");
  const [userId, setUserId] = useState(ALL);
  const [entityType, setEntityType] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const debounced = useDebounced(search, 300);

  const facets = trpc.audit.facets.useQuery();
  const filters = useMemo(
    () => ({
      userId: userId === ALL ? null : userId,
      entityType: entityType === ALL ? null : entityType,
      action: action === ALL ? null : action,
      from: from ? zonedTimeToUtc(`${from}T00:00`, tenant.timezone) : null,
      to: to ? new Date(zonedTimeToUtc(`${to}T00:00`, tenant.timezone).getTime() + 86_400_000 - 1) : null,
      search: debounced.trim() || null,
    }),
    [userId, entityType, action, from, to, debounced, tenant.timezone],
  );
  const list = trpc.audit.list.useInfiniteQuery(filters, { getNextPageParam: (last) => last.nextCursor ?? undefined });
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const active = Boolean(filters.userId || filters.entityType || filters.action || from || to || filters.search);

  const groups = useMemo(() => {
    const out: Array<{ day: string; items: AuditItem[] }> = [];
    for (const item of items) {
      const day = toISODate(item.createdAt, tenant.timezone);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(item);
      else out.push({ day, items: [item] });
    }
    return out;
  }, [items, tenant.timezone]);

  const exportHref = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.userId) p.set("userId", filters.userId);
    if (filters.entityType) p.set("entityType", filters.entityType);
    if (filters.action) p.set("action", filters.action);
    if (filters.from) p.set("from", filters.from.toISOString());
    if (filters.to) p.set("to", filters.to.toISOString());
    if (filters.search) p.set("search", filters.search);
    return `/api/export/audit?${p.toString()}`;
  }, [filters]);

  const now = new Date();
  const today = toISODate(now, tenant.timezone);
  const yesterday = toISODate(new Date(now.getTime() - 86_400_000), tenant.timezone);
  const dayTitle = (day: string) => (day === today ? "اليوم" : day === yesterday ? "أمس" : formatDate(day, { digits: prefs.digits, calendar: prefs.calendar, style: "full" }));

  const clear = () => {
    setSearch("");
    setUserId(ALL);
    setEntityType(ALL);
    setAction(ALL);
    setFrom("");
    setTo("");
  };

  return (
    <SettingsShell
      title="سجل التدقيق"
      description="كل إنشاء وتعديل وحذف ودخول وتصدير، مع المستخدم والوقت وعنوان IP والقيم قبل وبعد."
      actions={
        can("audit", "export") ? (
          <a href={exportHref} download className="inline-flex h-8 items-center gap-2 rounded-md bg-card px-3 text-[14px] text-fg shadow-[0_0_0_1px_var(--border)] transition-colors hover:bg-hover">
            <Download className="size-4" />
            تصدير CSV
          </a>
        ) : null
      }
    >
      <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-navy-50 px-3.5 py-2.5 text-[13px] text-navy-700 dark:bg-hover dark:text-fg-2">
        <Lock className="mt-0.5 size-4 shrink-0" />
        <p>السجل غير قابل للتعديل أو الحذف من أي مستخدم — بما في ذلك المالك — وهو محمي على مستوى قاعدة البيانات. الحقول الحساسة (كلمات المرور والرموز) محجوبة.</p>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-[240px]">
          <Search className="pointer-events-none absolute start-2.5 top-2 size-4 text-fg-3" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث في الوصف أو الاسم أو IP" className="h-8 w-full rounded-md bg-hover pe-2 ps-8 text-[14px] outline-none" />
        </div>
        <Select
          size="sm"
          className="w-[170px]"
          value={userId}
          onChange={setUserId}
          options={[{ value: ALL, label: "كل المستخدمين" }, ...(facets.data?.users ?? []).map((u) => ({ value: u.id, label: u.name }))]}
        />
        <Select
          size="sm"
          className="w-[150px]"
          value={entityType}
          onChange={setEntityType}
          options={[{ value: ALL, label: "كل الكيانات" }, ...(facets.data?.entityTypes ?? []).map((e) => ({ value: e.value, label: `${ENTITY_LABELS[e.value] ?? e.value} (${formatNumber(e.count, prefs.digits)})` }))]}
        />
        <Select
          size="sm"
          className="w-[160px]"
          value={action}
          onChange={setAction}
          options={[{ value: ALL, label: "كل الإجراءات" }, ...(facets.data?.actions ?? []).map((a) => ({ value: a.value, label: `${ACTION_LABELS[a.value] ?? a.value} (${formatNumber(a.count, prefs.digits)})` }))]}
        />
        <label className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-2 shadow-[0_0_0_1px_var(--border)]">
          من
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="bg-transparent text-fg outline-none" aria-label="من تاريخ" />
        </label>
        <label className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[13px] text-fg-2 shadow-[0_0_0_1px_var(--border)]">
          إلى
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="bg-transparent text-fg outline-none" aria-label="إلى تاريخ" />
        </label>
        {active ? (
          <button onClick={clear} className="flex h-7 items-center gap-1 rounded-md px-2 text-[13px] text-fg-2 hover:bg-hover">
            <X className="size-3.5" />
            مسح المرشحات
          </button>
        ) : null}
      </div>

      {list.isLoading ? <SkeletonLines lines={10} /> : null}
      {list.error ? <EmptyState illustration="lock" title="تعذّر تحميل السجل" description={list.error.message} compact /> : null}
      {!list.isLoading && !list.error && items.length === 0 ? (
        <EmptyState illustration="search" title={active ? "لا توجد قيود مطابقة" : "لا توجد قيود بعد"} description={active ? "جرّب توسيع الفترة أو إزالة بعض المرشحات." : undefined} compact />
      ) : null}

      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.day}>
            <h3 className="sticky top-0 z-[1] mb-1 bg-app py-1 text-[12px] font-semibold text-fg-3">
              {dayTitle(g.day)}
              <span className="ms-2 font-normal">{formatNumber(g.items.length, prefs.digits)} قيد</span>
            </h3>
            <ul className="overflow-hidden rounded-lg shadow-card">
              {g.items.map((item) => (
                <AuditEntry key={item.id} item={item} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {list.hasNextPage ? (
        <div className="mt-4 flex justify-center">
          <Button onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
            تحميل المزيد
          </Button>
        </div>
      ) : items.length > 0 ? (
        <p className="mt-4 text-center text-[12px] text-fg-3">نهاية السجل — {formatNumber(items.length, prefs.digits)} قيد</p>
      ) : null}
    </SettingsShell>
  );
}

function AuditEntry({ item }: { item: AuditItem }) {
  const { prefs, tenant } = useApp();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => diffRows(item.oldValue, item.newValue), [item.oldValue, item.newValue]);
  const expandable = rows.length > 0 || Boolean(item.userAgent);
  const entity = ENTITY_LABELS[item.entityType] ?? item.entityType;

  return (
    <li className="border-b border-line last:border-b-0">
      <button
        onClick={() => expandable && setOpen((o) => !o)}
        className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-start transition-colors", expandable ? "hover:bg-hover" : "cursor-default")}
        aria-expanded={expandable ? open : undefined}
      >
        {item.userName ? <Avatar name={item.userName} size={26} /> : <span className="grid size-[26px] place-items-center rounded-full bg-hover text-fg-3"><Globe className="size-3.5" /></span>}
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
            <span className="font-medium">{item.userName ?? "النظام"}</span>
            <Tag color={actionColor(item.action)} size="sm">
              {ACTION_LABELS[item.action] ?? item.action}
            </Tag>
            <span className="text-fg-2">{entity}</span>
          </span>
          {item.summary ? <span className="mt-0.5 block truncate text-[13px] text-fg-2">{item.summary}</span> : null}
        </span>
        {item.ip ? (
          <span className="hidden text-[12px] text-fg-3 sm:block" dir="ltr">
            {item.ip}
          </span>
        ) : null}
        <Tooltip content={formatDate(item.createdAt, { digits: prefs.digits, calendar: "both", withTime: true, timeZone: tenant.timezone })}>
          <span className="w-[76px] shrink-0 text-end text-[12px] tabular text-fg-3">{formatTime(item.createdAt, prefs.digits, tenant.timezone)}</span>
        </Tooltip>
        {expandable ? <ChevronLeft className={cn("size-4 shrink-0 text-fg-3 transition-transform duration-150", open && "-rotate-90")} /> : <span className="w-4" />}
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }} className="overflow-hidden">
            <div className="space-y-3 bg-sidebar px-4 pb-3.5 pt-2 ps-[54px]">
              {rows.length ? (
                <table className="w-full table-fixed text-[13px]">
                  <thead>
                    <tr className="text-start text-[12px] text-fg-3">
                      <th className="w-[26%] py-1 text-start font-medium">الحقل</th>
                      <th className="py-1 text-start font-medium">القيمة السابقة</th>
                      <th className="py-1 text-start font-medium">القيمة الجديدة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.key} className="border-t border-line align-top">
                        <td className="py-1.5 pe-2 text-fg-2">{r.label}</td>
                        <td className="py-1.5 pe-2">
                          <ValueCell value={r.before} tone="old" />
                        </td>
                        <td className="py-1.5">
                          <ValueCell value={r.after} tone="new" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-fg-3">
                <div className="flex gap-1">
                  <dt>الوقت:</dt>
                  <dd>
                    {formatDate(item.createdAt, { digits: prefs.digits, calendar: prefs.calendar, withTime: true, timeZone: tenant.timezone })} ({formatRelative(item.createdAt, new Date(), prefs.digits)})
                  </dd>
                </div>
                {item.entityId ? (
                  <div className="flex gap-1">
                    <dt>المعرّف:</dt>
                    <dd dir="ltr" className="font-mono">
                      {item.entityId}
                    </dd>
                  </div>
                ) : null}
                {item.ip ? (
                  <div className="flex gap-1">
                    <dt>IP:</dt>
                    <dd dir="ltr">{item.ip}</dd>
                  </div>
                ) : null}
                {item.userAgent ? (
                  <div className="flex min-w-0 gap-1">
                    <dt>المتصفح:</dt>
                    <dd dir="ltr" className="truncate" title={item.userAgent}>
                      {item.userAgent.slice(0, 90)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

interface DiffRow {
  key: string;
  label: string;
  before: unknown;
  after: unknown;
}

/** صفوف الفروقات؛ الكائنات المتداخلة (مثل قيم السجل) تُفرد إلى مفاتيحها المتغيرة فقط */
function diffRows(oldValue: unknown, newValue: unknown): DiffRow[] {
  const a = isPlainObject(oldValue) ? oldValue : {};
  const b = isPlainObject(newValue) ? newValue : {};
  const rows: DiffRow[] = [];
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const before = a[key];
    const after = b[key];
    const label = FIELD_LABELS[key] ?? key;
    if (isPlainObject(before) && isPlainObject(after) && !("__summary" in after)) {
      for (const sub of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (JSON.stringify(before[sub]) === JSON.stringify(after[sub])) continue;
        rows.push({ key: `${key}.${sub}`, label: `${label} › ${sub}`, before: before[sub], after: after[sub] });
      }
    } else {
      rows.push({ key, label, before, after });
    }
  }
  return rows;
}

function ValueCell({ value, tone }: { value: unknown; tone: "old" | "new" }) {
  const { prefs } = useApp();
  const cls = tone === "old" ? "bg-danger-50 text-danger-700 line-through decoration-danger-700/40 dark:bg-transparent" : "bg-success-50 text-success-800 dark:bg-transparent";
  if (value === undefined || value === null || value === "") return <span className="text-fg-3">—</span>;
  if (typeof value === "boolean") return <span className={cn("rounded px-1", cls)}>{value ? "نعم" : "لا"}</span>;
  if (typeof value === "number") return <span className={cn("rounded px-1 tabular", cls)}>{formatNumber(value, prefs.digits)}</span>;
  if (isPlainObject(value) && typeof value.__summary === "string") return <span className="text-fg-2">{value.__summary}</span>;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return <span className={cn("rounded px-1", cls)}>{formatDate(value, { digits: prefs.digits, withTime: true })}</span>;
    return (
      <span className={cn("rounded px-1 [overflow-wrap:anywhere]", cls)} dir="auto">
        {value.length > 240 ? `${value.slice(0, 240)}…` : value}
      </span>
    );
  }
  const json = JSON.stringify(value);
  return (
    <code className={cn("block rounded px-1 font-mono text-[12px] [overflow-wrap:anywhere]", cls)} dir="ltr">
      {json.length > 300 ? `${json.slice(0, 300)}…` : json}
    </code>
  );
}
