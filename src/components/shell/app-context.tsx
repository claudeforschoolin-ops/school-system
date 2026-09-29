"use client";
/**
 * سياق التطبيق: المستخدم، المدرسة، الصلاحيات، والتفضيلات (المظهر، الأرقام، التقويم).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Action, Scope } from "@/lib/rbac/catalog";
import type { CalendarPreference } from "@/lib/dates";
import type { DigitsPreference } from "@/lib/numbers";
import { trpc, type RouterOutputs } from "@/lib/trpc/client";
import { readRegion } from "@/lib/region";

export type AppContextData = RouterOutputs["account"]["context"];

export interface Prefs {
  theme: "light" | "dark" | "system";
  digits: DigitsPreference;
  calendar: CalendarPreference;
  reducedMotion: boolean;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
}

interface AppContextValue {
  data: AppContextData;
  user: AppContextData["user"];
  tenant: AppContextData["tenant"];
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  can: (module: string, action: Action) => boolean;
  scopeOf: (module: string, action: Action) => Scope | null;
}

const Ctx = createContext<AppContextValue | null>(null);

export function applyTheme(theme: Prefs["theme"]) {
  const dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  document.cookie = `manassa_theme=${theme}; path=/; max-age=31536000; samesite=lax`;
}

export function AppProvider({ initial, children }: { initial: AppContextData; children: ReactNode }) {
  const { data = initial } = trpc.account.context.useQuery(undefined, { initialData: initial, staleTime: 60_000 });
  const saved = data.user.preferences;
  const [prefs, setPrefsState] = useState<Prefs>({
    theme: saved.theme ?? "system",
    digits: saved.digits ?? "arab",
    calendar: saved.calendar ?? "both",
    reducedMotion: saved.reducedMotion ?? false,
    sidebarWidth: saved.sidebarWidth ?? 260,
    sidebarCollapsed: saved.sidebarCollapsed ?? false,
  });
  const save = trpc.account.updatePreferences.useMutation();
  const saveMutate = save.mutate;

  const setPrefs = useCallback(
    (patch: Partial<Prefs>) => {
      setPrefsState((p) => ({ ...p, ...patch }));
      if (patch.theme) applyTheme(patch.theme);
      saveMutate(patch);
    },
    [saveMutate],
  );

  useEffect(() => {
    applyTheme(prefs.theme);
    if (prefs.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [prefs.theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-reduced-motion", String(prefs.reducedMotion));
  }, [prefs.reducedMotion]);

  const value = useMemo<AppContextValue>(() => {
    const perms = data.permissions as Record<string, Scope>;
    return {
      data,
      user: data.user,
      tenant: data.tenant,
      prefs,
      setPrefs,
      can: (module, action) => Boolean(perms[`${module}:${action}`]),
      scopeOf: (module, action) => perms[`${module}:${action}`] ?? null,
    };
  }, [data, prefs, setPrefs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

/** تنسيق حسب تفضيلات المستخدم */
export function usePrefs() {
  return useApp().prefs;
}

/** إعدادات الإقليم للمدرسة (صيغ الهوية والجوال والآيبان وجنسية المواطن) */
export function useRegion() {
  const settings = useApp().tenant.settings;
  return useMemo(() => readRegion(settings), [settings]);
}
