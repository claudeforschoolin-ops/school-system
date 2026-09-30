"use client";
/**
 * الإطار العام (من اليمين لليسار): الشريط الجانبي ← منطقة المحتوى (تبويبات + صفحة).
 */
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { AppProvider, useApp, type AppContextData } from "./app-context";
import { CommandPalette, toggleCommandPalette } from "./command-palette";
import { PolicyGate } from "@/components/governance/privacy";
import { FloatingHelp, ShortcutsDialog } from "./floating-help";
import { Sidebar } from "./sidebar/sidebar";
import { TabsBar } from "./tabs-bar";

export function AppShell({ initial, children }: { initial: AppContextData; children: ReactNode }) {
  return (
    <AppProvider initial={initial}>
      <ShellLayout>{children}</ShellLayout>
    </AppProvider>
  );
}

function ShellLayout({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { prefs, setPrefs } = useApp();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const target = e.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, [contenteditable=true]");
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggleCommandPalette();
      } else if (mod && e.key.toLowerCase() === "o") {
        e.preventDefault();
        router.push("/chat?new=1");
      } else if (mod && e.key === "\\") {
        e.preventDefault();
        setPrefs({ sidebarCollapsed: !prefs.sidebarCollapsed });
      } else if (!typing && e.key === "?" && !mod) {
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs.sidebarCollapsed, router, setPrefs]);

  return (
    <div className="flex h-dvh overflow-hidden bg-app">
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Suspense fallback={<div className="h-10 shrink-0 border-b border-line bg-sidebar" />}>
          <TabsBar onOpenMobileSidebar={() => setMobileOpen(true)} />
        </Suspense>
        <main id="main-scroll" className="thin-scroll relative min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <CommandPalette />
      <FloatingHelp onShortcuts={() => setShortcutsOpen(true)} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <PolicyGate />
    </div>
  );
}
