"use client";
import { useCallback, useSyncExternalStore } from "react";

/**
 * قيمة نصية محفوظة في localStorage كمخزن خارجي (useSyncExternalStore):
 * لا عدم تطابق عند الترطيب (الخادم يرى null)، وتتزامن بين المكوّنات والنوافذ.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredValue(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* التخزين غير متاح (وضع خاص مثلاً): نكتفي بالإخطار */
  }
  for (const l of listeners) l();
}

export function useStoredValue(key: string) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const set = useCallback((next: string | null) => writeStoredValue(key, next), [key]);
  return [value, set] as const;
}
