"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { FLOW_COMPACT, FLOW_MID, Flow } from "@/components/flow";
import { Params, Schema } from "@/components/module-detail";
import { systems, type ModuleId } from "@/content/site";

const modules = systems.pillarA.modules;

/** Pick a module; the drawing redraws for it, and its schema and parameters follow. */
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
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? i + 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
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
    <div>
      <h4 className="text-title text-ink">Select a module. Follow the data.</h4>

      <div role="tablist" aria-label="Turnkey modules" className="mt-6 flex gap-8 border-b border-hairline sm:gap-12">
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
              className={`text-title relative pb-4 transition-colors duration-300 after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:origin-left after:bg-sanad after:transition-transform after:duration-500 ${
                on ? "text-ink after:scale-x-100" : "text-ink-3 after:scale-x-0 hover:text-ink"
              }`}
            >
              {m.short}
            </button>
          );
        })}
      </div>

      <div id="explorer-panel" role="tabpanel" aria-labelledby={`tab-${active}`}>
        <div className="mt-12 grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <figure className="intro m-0 min-w-0 lg:col-span-8">
            <div key={active} className="panel-in">
              <div className="hidden md:block">
                <Flow g={FLOW_MID} id="ex-mid" sources={current.sources} core={{ kind: "label", text: current.short }} intro />
              </div>
              <div className="mx-auto max-w-[22rem] md:hidden">
                <Flow g={FLOW_COMPACT} id="ex-compact" sources={current.sources} core={{ kind: "label", text: current.short }} intro />
              </div>
            </div>
          </figure>
          <div key={`${active}-t`} className="panel-in lg:col-span-4">
            <p className="text-caption text-ink-3">Owns</p>
            <p className="text-heading mt-2 text-ink">{current.owns}</p>
            <p className="text-body mt-5 text-ink-3">{current.summary}</p>
          </div>
        </div>

        <div key={`${active}-d`} className="panel-in mt-16 grid gap-12 md:grid-cols-2 md:gap-16">
          <Schema module={current} />
          <Params params={current.params} />
        </div>
      </div>
    </div>
  );
}
