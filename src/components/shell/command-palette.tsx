"use client";
/**
 * لوحة الأوامر (Ctrl/⌘+K): بحث شامل في الصفحات والسجلات والمستخدمين والأحداث،
 * وإجراءات سريعة، وسجل الصفحات الأخيرة.
 */
import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import {
  CalendarDays,
  CheckSquare,
  Clock,
  CornerDownLeft,
  Database,
  FileText,
  Inbox,
  LogOut,
  MessageCircle,
  Moon,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { formatDate } from "@/lib/dates";
import { trpc } from "@/lib/trpc/client";
import { matchesSearch } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { PageIcon } from "@/components/ui/icon";
import { Kbd } from "@/components/ui/kbd";
import { useApp } from "./app-context";
import { usePageActions } from "./use-page-actions";

let open = false;
const listeners = new Set<() => void>();
function setOpen(v: boolean) {
  open = v;
  listeners.forEach((l) => l());
}
export function openCommandPalette() {
  setOpen(true);
}
export function toggleCommandPalette() {
  setOpen(!open);
}
function useOpen() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => open,
    () => false,
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface ActionDef {
  id: string;
  label: string;
  keywords: string;
  icon: ReactNode;
  run: () => void;
  shortcut?: string;
}

export function CommandPalette() {
  const isOpen = useOpen();
  const router = useRouter();
  const { can, prefs, setPrefs } = useApp();
  const actions = usePageActions();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query.trim(), 160);
  const recents = trpc.workspace.recents.useQuery({ limit: 8 }, { enabled: isOpen });
  const search = trpc.workspace.search.useQuery({ query: debounced }, { enabled: isOpen && debounced.length > 0, placeholderData: (prev) => prev });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => router.replace("/login") });

  // مسح البحث عند الإغلاق (تعديل الحالة أثناء العرض بدل التأثير)
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) setQuery("");
  }

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const allActions: ActionDef[] = useMemo(() => {
    const list: ActionDef[] = [
      { id: "new-page", label: "صفحة خاصة جديدة", keywords: "انشاء صفحة جديدة", icon: <Plus className="size-4" />, run: () => void actions.createPage({ teamspaceId: null }) },
      { id: "new-db", label: "قاعدة بيانات جديدة", keywords: "انشاء قاعدة بيانات جدول", icon: <Database className="size-4" />, run: () => void actions.createPage({ teamspaceId: null, kind: "DATABASE" }) },
      { id: "new-chat", label: "محادثة جديدة", keywords: "رسالة محادثة", icon: <MessageCircle className="size-4" />, run: () => router.push("/chat?new=1"), shortcut: "O" },
      { id: "inbox", label: "فتح صندوق الوارد", keywords: "اشعارات وارد", icon: <Inbox className="size-4" />, run: () => router.push("/inbox") },
      { id: "calendar", label: "فتح التقويم", keywords: "تقويم احداث", icon: <CalendarDays className="size-4" />, run: () => router.push("/calendar") },
      { id: "tasks", label: "مهامي", keywords: "مهام مسندة", icon: <CheckSquare className="size-4" />, run: () => router.push("/tasks") },
      { id: "profile", label: "الملف الشخصي", keywords: "حساب ملف", icon: <UserRound className="size-4" />, run: () => router.push("/settings/profile") },
      { id: "security", label: "الأمان والمصادقة الثنائية", keywords: "كلمة مرور امان جلسات", icon: <ShieldCheck className="size-4" />, run: () => router.push("/settings/security") },
      { id: "trash", label: "المهملات", keywords: "محذوفات سلة", icon: <Trash2 className="size-4" />, run: () => router.push("/trash") },
      {
        id: "theme",
        label: prefs.theme === "dark" ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن",
        keywords: "مظهر داكن فاتح ليلي",
        icon: prefs.theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />,
        run: () => setPrefs({ theme: prefs.theme === "dark" ? "light" : "dark" }),
      },
    ];
    if (can("users", "view")) list.push({ id: "users", label: "إدارة المستخدمين", keywords: "مستخدمين دعوة اعضاء", icon: <Users className="size-4" />, run: () => router.push("/settings/users") });
    if (can("settings", "view")) list.push({ id: "settings", label: "إعدادات المدرسة", keywords: "اعدادات مدرسة فروع", icon: <Settings className="size-4" />, run: () => router.push("/settings/school") });
    if (can("audit", "view")) list.push({ id: "audit", label: "سجل التدقيق", keywords: "تدقيق سجلات", icon: <ShieldCheck className="size-4" />, run: () => router.push("/settings/audit") });
    list.push({ id: "logout", label: "تسجيل الخروج", keywords: "خروج", icon: <LogOut className="size-4" />, run: () => logout.mutate() });
    return list;
  }, [actions, can, logout, prefs.theme, router, setPrefs]);

  const filteredActions = query ? allActions.filter((a) => matchesSearch(`${a.label} ${a.keywords}`, query)) : allActions.slice(0, 6);
  const results = search.data;
  const hasResults = results && (results.pages.length || results.rows.length || results.users.length || results.events.length);

  const item = "flex h-10 cursor-pointer select-none items-center gap-3 rounded-md px-3 text-[14px] text-fg outline-none data-[selected=true]:bg-hover";

  return (
    <D.Root open={isOpen} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="anim-overlay fixed inset-0 z-[60] bg-overlay" />
        <D.Content
          aria-describedby={undefined}
          className="anim-pop fixed left-1/2 top-[12vh] z-[60] w-[calc(100vw-24px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-xl bg-elevated shadow-popover outline-none"
        >
          <D.Title className="sr-only">لوحة الأوامر</D.Title>
          <Command shouldFilter={false} loop label="لوحة الأوامر">
            <div className="flex items-center gap-2 border-b border-line px-4">
              <Search className="size-[18px] text-fg-3" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="ابحث عن صفحة أو زميل أو اكتب أمراً…"
                className="h-12 flex-1 bg-transparent text-[16px] outline-none placeholder:text-fg-3"
              />
              {search.isFetching ? <span className="skeleton h-1.5 w-10" /> : null}
            </div>
            <Command.List className="thin-scroll max-h-[min(60vh,440px)] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-[14px] text-fg-3">
                {debounced && !search.isFetching ? "لا توجد نتائج مطابقة" : "اكتب للبحث…"}
              </Command.Empty>

              {!query && recents.data?.length ? (
                <Command.Group heading="الأخيرة" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-3">
                  {recents.data.map((r) => (
                    <Command.Item key={`r-${r.targetId}`} value={`recent-${r.targetId}`} onSelect={() => go(r.href)} className={item}>
                      <PageIcon icon={r.icon} size={18} fallback={r.kind === "DATABASE" ? Database : FileText} />
                      <span className="flex-1 truncate">{r.title || "بدون عنوان"}</span>
                      {r.context ? <span className="text-[12px] text-fg-3">{r.context}</span> : <Clock className="size-3.5 text-fg-4" />}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {hasResults ? (
                <>
                  {results.pages.length ? (
                    <Group heading="الصفحات">
                      {results.pages.map((p) => (
                        <Command.Item key={p.id} value={`page-${p.id}`} onSelect={() => go(`/p/${p.id}`)} className={item}>
                          <PageIcon icon={p.icon} size={18} fallback={p.kind === "DATABASE" ? Database : FileText} />
                          <span className="flex-1 truncate">{p.title || "بدون عنوان"}</span>
                          {p.context ? <span className="text-[12px] text-fg-3">{p.context}</span> : null}
                        </Command.Item>
                      ))}
                    </Group>
                  ) : null}
                  {results.rows.length ? (
                    <Group heading="السجلات">
                      {results.rows.map((r) => (
                        <Command.Item key={r.id} value={`row-${r.id}`} onSelect={() => go(`/r/${r.id}`)} className={item}>
                          <PageIcon icon={r.icon} size={18} />
                          <span className="flex-1 truncate">{r.title || "بدون عنوان"}</span>
                          <span className="flex items-center gap-1 text-[12px] text-fg-3">
                            <PageIcon icon={r.database.page.icon} size={12} />
                            {r.database.page.title}
                          </span>
                        </Command.Item>
                      ))}
                    </Group>
                  ) : null}
                  {results.users.length ? (
                    <Group heading="الأشخاص">
                      {results.users.map((u) => (
                        <Command.Item key={u.id} value={`user-${u.id}`} onSelect={() => go(`/chat?with=${u.id}`)} className={item}>
                          <Avatar name={u.name} color={u.avatarColor} size={22} />
                          <span className="flex-1 truncate">{u.name}</span>
                          <span className="text-[12px] text-fg-3">{u.jobTitle ?? u.email}</span>
                        </Command.Item>
                      ))}
                    </Group>
                  ) : null}
                  {results.events.length ? (
                    <Group heading="الأحداث">
                      {results.events.map((e) => (
                        <Command.Item key={e.id} value={`event-${e.id}`} onSelect={() => go(`/calendar?date=${new Date(e.startAt).toISOString().slice(0, 10)}`)} className={item}>
                          <CalendarDays className="size-[18px] text-fg-3" />
                          <span className="flex-1 truncate">{e.title}</span>
                          <span className="text-[12px] text-fg-3">{formatDate(e.startAt, { digits: prefs.digits })}</span>
                        </Command.Item>
                      ))}
                    </Group>
                  ) : null}
                </>
              ) : null}

              {filteredActions.length ? (
                <Group heading="إجراءات سريعة">
                  {filteredActions.map((a) => (
                    <Command.Item key={a.id} value={`action-${a.id}`} onSelect={() => run(a.run)} className={item}>
                      <span className="grid size-[18px] place-items-center text-fg-2">{a.icon}</span>
                      <span className="flex-1 truncate">{a.label}</span>
                    </Command.Item>
                  ))}
                </Group>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-4 border-t border-line px-4 py-2 text-[12px] text-fg-3">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> للتنقل
              </span>
              <span className="flex items-center gap-1">
                <Kbd>
                  <CornerDownLeft className="size-3" />
                </Kbd>
                للفتح
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Esc</Kbd> للإغلاق
              </span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[12px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-3"
    >
      {children}
    </Command.Group>
  );
}
