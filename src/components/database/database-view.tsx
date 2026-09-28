"use client";
/**
 * عرض قاعدة البيانات الكامل: شريط العروض + أدوات (فرز، تصفية، أتمتة، بحث، ملء الشاشة، إعدادات، جديد)
 * + العرض النشط + المعاينة الجانبية. يعمل كصفحة كاملة أو مضمّناً داخل صفحة.
 */
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Maximize2, Minimize2, Search, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyView, orderedProperties } from "@/lib/database/engine";
import { shortId } from "@/lib/database/defaults";
import type { ViewConfig, ViewType } from "@/lib/database/types";
import { trpc } from "@/lib/trpc/client";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { PageIcon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { useApp } from "@/components/shell/app-context";
import { AutomationsButton } from "./automations-dialog";
import { FilterButton, SortButton } from "./filter-sort";
import { NewButton } from "./new-button";
import { SidePeek } from "./side-peek";
import { useDatabase, useViewConfig } from "./use-database";
import { ViewSettingsButton } from "./view-settings";
import { ViewTabs } from "./view-tabs";
import { BoardView } from "./views/board-view";
import { CalendarView } from "./views/calendar-view";
import { GalleryView, ListView } from "./views/gallery-list-views";
import { TableView } from "./views/table-view";
import { TimelineView } from "./views/timeline-view";

export function DatabaseView({ databaseId, mode, title }: { databaseId: string; mode: "page" | "inline"; title?: string }) {
  const api = useDatabase(databaseId);
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const { prefs, setPrefs } = useApp();
  const utils = trpc.useUtils();
  const updateViewType = trpc.database.updateView.useMutation({ onSuccess: () => api.refreshBundle() });

  const views = api.bundle?.views ?? [];
  const [localViewId, setLocalViewId] = useState<string | null>(null);
  const urlViewId = mode === "page" ? search.get("v") : null;
  const activeView = views.find((v) => v.id === (urlViewId ?? localViewId)) ?? views[0];

  const selectView = (id: string) => {
    if (mode === "page") {
      const params = new URLSearchParams(search.toString());
      params.set("v", id);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } else setLocalViewId(id);
  };

  // غير المحررين: تعديلات العرض محلية ومؤقتة (لا تُحفظ للجميع)
  const canConfigure = api.canEdit || Boolean(activeView?.isPersonal);
  const [overrides, setOverrides] = useState<Record<string, Partial<ViewConfig>>>({});
  const persist = useViewConfig(databaseId, activeView);
  const config: ViewConfig = useMemo(() => ({ ...(activeView?.config ?? {}), ...(activeView ? overrides[activeView.id] : {}) }), [activeView, overrides]);
  const setConfig = useCallback(
    (patch: Partial<ViewConfig>) => {
      if (!activeView) return;
      if (canConfigure) persist(patch);
      else setOverrides((o) => ({ ...o, [activeView.id]: { ...(o[activeView.id] ?? {}), ...patch } }));
    },
    [activeView, canConfigure, persist],
  );

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [peek, setPeek] = useState<string | null>(null);

  const rows = useMemo(() => (activeView ? applyView(api.rows, config, query, api.ctx) : []), [api.rows, config, query, api.ctx, activeView]);
  const ordered = orderedProperties(api.properties, config.propertyOrder);
  const hidden = new Set(config.hiddenProperties ?? []);
  const visibleProps = ordered.filter((p) => !hidden.has(p.id));

  const open = useCallback(
    (rowId: string) => {
      if (config.openIn === "page") router.push(`/r/${rowId}`);
      else setPeek(rowId);
    },
    [config.openIn, router],
  );

  // فتح السجل المُنشأ حديثاً في اللوحات التي لا تدعم التحرير المباشر
  useEffect(() => {
    if (!api.justCreated || !activeView) return;
    if (activeView.type === "CALENDAR" || activeView.type === "TIMELINE" || activeView.type === "GALLERY" || activeView.type === "LIST") {
      setPeek(api.justCreated);
      api.clearJustCreated();
    }
  }, [api, activeView]);

  if (api.bundleQuery.error) {
    return <EmptyState illustration="lock" title="لا يمكن عرض قاعدة البيانات" description={api.bundleQuery.error.message} compact={mode === "inline"} />;
  }
  if (!api.bundle || !activeView) {
    return (
      <div className="space-y-3 py-2">
        <div className="flex gap-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-7 w-20" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const sorted = Boolean(config.sorts?.length);
  const commonProps = { api, rows, config, visibleProps, onConfig: setConfig, onOpen: open };

  return (
    <div className={cn(mode === "inline" && "rounded-lg")}>
      {mode === "inline" ? (
        <Link href={`/p/${api.bundle.page.id}`} className="mb-1 inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-[18px] font-bold hover:bg-hover">
          <PageIcon icon={api.bundle.page.icon} size={20} />
          {api.bundle.page.title || title || "بدون عنوان"}
          <ArrowUpRight className="size-4 text-fg-3" />
        </Link>
      ) : null}

      <div className="no-print flex items-center gap-2 border-b border-line pb-1.5">
        <ViewTabs api={api} views={views} activeId={activeView.id} onSelect={selectView} layoutKey={databaseId} />
        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <SortButton properties={api.properties} sorts={config.sorts} onChange={(sorts) => setConfig({ sorts })} />
          <FilterButton properties={api.properties} filter={config.filter} onChange={(filter) => setConfig({ filter })} users={api.users} currency={api.ctx.defaultCurrency ?? "SAR"} />
          <AutomationsButton api={api} />
          <div className="flex items-center">
            <AnimatePresence initial={false}>
              {searchOpen ? (
                <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 180, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                  <div className="relative">
                    <input
                      ref={searchRef}
                      autoFocus
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setQuery("");
                          setSearchOpen(false);
                        }
                      }}
                      placeholder="ابحث…"
                      className="h-7 w-[176px] rounded-md bg-hover pe-6 ps-2 text-[13px] outline-none"
                    />
                    {query ? (
                      <button onClick={() => setQuery("")} className="absolute end-1 top-1.5 text-fg-3 hover:text-fg" aria-label="مسح">
                        <X className="size-3.5" />
                      </button>
                    ) : null}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <Tooltip content="بحث">
              <button onClick={() => setSearchOpen((o) => !o)} className={cn("grid size-7 place-items-center rounded-md text-fg-2 transition-colors hover:bg-hover", query && "text-teal-700")} aria-label="بحث">
                <Search className="size-4" />
              </button>
            </Tooltip>
          </div>
          <Tooltip content={mode === "inline" ? "فتح كصفحة كاملة" : prefs.sidebarCollapsed ? "إظهار الشريط الجانبي" : "ملء الشاشة"}>
            <button
              onClick={() => (mode === "inline" ? router.push(`/p/${api.bundle!.page.id}?v=${activeView.id}`) : setPrefs({ sidebarCollapsed: !prefs.sidebarCollapsed }))}
              className="grid size-7 place-items-center rounded-md text-fg-2 transition-colors hover:bg-hover"
              aria-label="ملء الشاشة"
            >
              {mode === "page" && prefs.sidebarCollapsed ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </Tooltip>
          <ViewSettingsButton
            api={api}
            view={activeView}
            config={config}
            onConfig={setConfig}
            onType={(type: ViewType) => {
              utils.database.bundle.setData({ databaseId }, (old) => (old ? { ...old, views: old.views.map((v) => (v.id === activeView.id ? { ...v, type } : v)) } : old));
              updateViewType.mutate({ viewId: activeView.id, type });
            }}
            canEditView={canConfigure}
            visibleRows={rows}
            title={api.bundle.page.title}
          />
          <span className="ms-1">
            <NewButton api={api} onCreated={(id) => (activeView.type === "TABLE" || activeView.type === "BOARD" ? undefined : setPeek(id))} />
          </span>
        </div>
      </div>

      {!canConfigure && Object.keys(overrides[activeView.id] ?? {}).length ? (
        <p className="mt-2 text-[12px] text-fg-3">
          تعديلات التصفية والفرز مؤقتة لك فقط.{" "}
          <button className="underline" onClick={() => setOverrides((o) => ({ ...o, [activeView.id]: {} }))}>
            إعادة الضبط
          </button>
        </p>
      ) : null}
      {api.truncated ? <p className="mt-2 text-[12px] text-warning-700">تُعرض أول ٥٬٠٠٠ سجل. استخدم التصفية لتضييق النتائج.</p> : null}

      <div className="mt-3">
        {api.rowsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : api.rows.length === 0 && !api.canEdit ? (
          <EmptyState illustration="table" title="لا توجد سجلات بعد" compact={mode === "inline"} />
        ) : rows.length === 0 && (query || config.filter?.rules.length) ? (
          <EmptyState illustration="search" title="لا توجد سجلات مطابقة" description="جرّب تعديل البحث أو قواعد التصفية." compact />
        ) : activeView.type === "TABLE" ? (
          <TableView
            {...commonProps}
            canConfigure={canConfigure}
            sorted={sorted}
            onSort={(propertyId, direction) => setConfig({ sorts: [{ propertyId, direction }, ...(config.sorts ?? []).filter((s) => s.propertyId !== propertyId)] })}
            onFilterBy={(propertyId) => setConfig({ filter: { conjunction: config.filter?.conjunction ?? "and", rules: [...(config.filter?.rules ?? []), { id: shortId(), propertyId, operator: "is_not_empty" }] } })}
          />
        ) : activeView.type === "BOARD" ? (
          <BoardView {...commonProps} sorted={sorted} />
        ) : activeView.type === "CALENDAR" ? (
          <CalendarView {...commonProps} />
        ) : activeView.type === "TIMELINE" ? (
          <TimelineView {...commonProps} />
        ) : activeView.type === "GALLERY" ? (
          <GalleryView {...commonProps} />
        ) : (
          <ListView {...commonProps} />
        )}
      </div>

      <SidePeek rowId={peek} onClose={() => setPeek(null)} onNavigate={setPeek} order={rows.map((r) => r.id)} />
    </div>
  );
}
