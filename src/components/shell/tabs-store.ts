"use client";
/**
 * تبويبات الصفحات المفتوحة (مثل المتصفح): محفوظة محلياً لكل مستخدم.
 */
import { useSyncExternalStore } from "react";

export interface TabItem {
  id: string;
  href: string;
  title: string;
  icon: string | null;
}

interface TabsState {
  tabs: TabItem[];
  activeId: string;
}

let state: TabsState = { tabs: [{ id: "t0", href: "/home", title: "الرئيسية", icon: "lucide:house" }], activeId: "t0" };
let storageKey = "manassa:tabs";
const listeners = new Set<() => void>();
let seq = 1;

function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    /* التخزين غير متاح */
  }
}

function set(next: TabsState) {
  state = next;
  persist();
  listeners.forEach((l) => l());
}

export function initTabs(userId: string, currentHref: string) {
  storageKey = `manassa:tabs:${userId}`;
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as TabsState;
      if (Array.isArray(parsed.tabs) && parsed.tabs.length) {
        state = parsed;
        seq = parsed.tabs.length + 1;
      }
    }
  } catch {
    /* تجاهل */
  }
  const active = state.tabs.find((t) => t.id === state.activeId);
  if (!active) state = { ...state, activeId: state.tabs[0]!.id };
  // الرابط الحالي يحدد التبويب النشط
  const match = state.tabs.find((t) => t.href === currentHref);
  if (match) state = { ...state, activeId: match.id };
  else state = { ...state, tabs: state.tabs.map((t) => (t.id === state.activeId ? { ...t, href: currentHref } : t)) };
  listeners.forEach((l) => l());
}

export const tabsActions = {
  /** تحديث رابط التبويب النشط عند التنقل */
  navigateActive(href: string) {
    const existing = state.tabs.find((t) => t.href === href);
    if (existing) {
      if (existing.id !== state.activeId) set({ ...state, activeId: existing.id });
      return;
    }
    set({ ...state, tabs: state.tabs.map((t) => (t.id === state.activeId ? { ...t, href } : t)) });
  },
  setActiveMeta(href: string, meta: { title: string; icon: string | null }) {
    const tab = state.tabs.find((t) => t.id === state.activeId);
    if (!tab || tab.href !== href || (tab.title === meta.title && tab.icon === meta.icon)) return;
    set({ ...state, tabs: state.tabs.map((t) => (t.id === tab.id ? { ...t, ...meta } : t)) });
  },
  open(href: string, meta?: { title: string; icon: string | null }): TabItem {
    const tab: TabItem = { id: `t${Date.now().toString(36)}${seq++}`, href, title: meta?.title ?? "صفحة جديدة", icon: meta?.icon ?? null };
    const index = state.tabs.findIndex((t) => t.id === state.activeId);
    const tabs = [...state.tabs];
    tabs.splice(index + 1, 0, tab);
    set({ tabs: tabs.slice(-12), activeId: tab.id });
    return tab;
  },
  activate(id: string) {
    if (state.tabs.some((t) => t.id === id)) set({ ...state, activeId: id });
  },
  /** إغلاق تبويب؛ يعيد رابط التبويب الذي يجب الانتقال إليه (إن تغيّر النشط) */
  close(id: string): string | null {
    if (state.tabs.length === 1) {
      set({ tabs: [{ ...state.tabs[0]!, href: "/home", title: "الرئيسية", icon: "lucide:house" }], activeId: state.tabs[0]!.id });
      return "/home";
    }
    const index = state.tabs.findIndex((t) => t.id === id);
    const tabs = state.tabs.filter((t) => t.id !== id);
    if (id !== state.activeId) {
      set({ ...state, tabs });
      return null;
    }
    const next = tabs[Math.min(index, tabs.length - 1)]!;
    set({ tabs, activeId: next.id });
    return next.href;
  },
  reorder(fromId: string, toId: string) {
    const tabs = [...state.tabs];
    const from = tabs.findIndex((t) => t.id === fromId);
    const to = tabs.findIndex((t) => t.id === toId);
    if (from < 0 || to < 0) return;
    const [moved] = tabs.splice(from, 1);
    tabs.splice(to, 0, moved!);
    set({ ...state, tabs });
  },
};

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTabs(): TabsState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
