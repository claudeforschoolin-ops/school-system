"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { COMPACT, Diagram, WIDE } from "@/components/hero-schematic";
import { Params, Schema } from "@/components/module-detail";
import { systems, type ModuleId } from "@/content/site";

const modules = systems.pillarA.modules;

/** Select a module to light its route through the diagram and read its schema. */
export function ModuleExplorer() {
  const [active, setActive] = useState<ModuleId>("inventory");
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = modules.find((m) => m.id === active) ?? modules[0]!;

  const move = (to: number) => {
    const next = (to + modules.length) % modules.length;
    setActive(modules[next]!.id);
    tabs.current[next]?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const to =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? i + 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? modules.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    move(to);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-5">
        <h4 className="text-title text-ink">Select a module. Follow the data.</h4>
        <p className="text-caption mt-2 text-ink-3">
          Choose Inventory, Units or Ledger to trace which sources feed it, which record it owns, and what it sends
          to your infrastructure.
        </p>
        <div role="tablist" aria-label="Turnkey modules" aria-orientation="vertical" className="mt-6 border-t border-hairline">
          {modules.map((m, i) => {
            const on = m.id === active;
            return (
              <button
                key={m.id}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                role="tab"
                id={`tab-${m.id}`}
                type="button"
                aria-selected={on}
                aria-controls="explorer-panel"
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(m.id)}
                onKeyDown={(e) => onKey(e, i)}
                className={`relative block w-full border-b border-hairline px-4 py-4 text-left transition-colors duration-300 ${
                  on ? "bg-mist-soft" : "hover:bg-mist-soft/50"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 w-[3px] origin-top bg-sanad transition-transform duration-500 ${
                    on ? "scale-y-100" : "scale-y-0"
                  }`}
                />
                <span className="flex items-baseline gap-3">
                  <span className="font-mono text-[0.78rem] text-ink-3">A.{i + 1}</span>
                  <span className="text-body font-medium text-ink">{m.name}</span>
                </span>
                <span className="text-caption mt-1 block pl-[2.1rem] text-ink-3">{m.summary}</span>
              </button>
            );
          })}
        </div>
      </div>

      <figure className="intro m-0 min-w-0 lg:col-span-7">
        <div className="overflow-hidden rounded-card border border-hairline bg-paper">
          <div className="text-caption flex items-center justify-between border-b border-hairline px-4 py-2.5 text-ink-3">
            <span className="font-mono text-[0.72rem] tracking-wide">FIG. 2</span>
            <span>
              Route: <span className="font-medium text-sanad">{current.name}</span>
            </span>
          </div>
          <div className="p-3 sm:p-5">
            <div className="hidden sm:block">
              <Diagram g={WIDE} id="ex-wide" active={active} intro />
            </div>
            <div className="sm:hidden">
              <Diagram g={COMPACT} id="ex-compact" active={active} intro />
            </div>
          </div>
        </div>
      </figure>

      <div
        key={active}
        id="explorer-panel"
        role="tabpanel"
        aria-labelledby={`tab-${active}`}
        className="panel-in grid gap-6 border-t border-hairline pt-8 md:grid-cols-2 lg:col-span-12 lg:gap-10"
      >
        <div className="grid min-w-0 content-start gap-5">
          <div>
            <p className="text-caption text-ink-3">Owns</p>
            <p className="text-title mt-1 text-ink">{current.owns}</p>
          </div>
          <div>
            <p className="text-caption text-ink-3">Fed by</p>
            <ul className="mt-1 flex flex-wrap gap-2">
              {current.sources.map((s) => (
                <li key={s} className="text-caption rounded-control border border-hairline bg-paper px-3 py-1 text-ink">
                  {s}
                </li>
              ))}
            </ul>
          </div>
          <Schema module={current} />
        </div>
        <Params params={current.params} />
      </div>
    </div>
  );
}
