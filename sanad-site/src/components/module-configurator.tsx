"use client";

import { useState } from "react";
import { Arrow } from "@/components/arrow";
import { LineIcon, type IconName } from "@/components/line-icon";
import { mailto, systems, type ModuleId } from "@/content/site";

const { letter, title, modules } = systems.pillarA;

const ICON: Record<ModuleId, IconName> = { inventory: "warehouse", units: "building", ledger: "receipt" };

/** What the page opens in the visitor's mail client: their choice, ready to send. */
function requestHref(chosen: readonly string[]) {
  const list = chosen.map((name) => `- ${name}`).join("\n");
  return mailto(
    `Request: ${chosen.join(" + ")}`,
    `Hello Sanad,\n\nI would like to configure these Pillar ${letter} modules:\n${list}\n\nCompany:\nSites and channels in scope:\n`,
  );
}

/**
 * Three modules side by side. Tick the ones you run; the chosen columns take the wash,
 * and the request button carries the choice into a ready-to-send message.
 */
export function ModuleConfigurator() {
  const [chosen, setChosen] = useState<ReadonlySet<ModuleId>>(new Set<ModuleId>(["inventory", "ledger"]));

  const toggle = (id: ModuleId) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const names = modules.filter((m) => chosen.has(m.id)).map((m) => m.short);

  return (
    <div>
      <div className="reveal flex items-end gap-4 sm:gap-5">
        <span aria-hidden="true" className="font-serif text-[3.5rem] font-medium leading-[0.8] text-sanad sm:text-[4.5rem]">
          {letter}
        </span>
        <h3 className="font-serif text-[1.375rem] font-medium leading-tight text-ink sm:text-[1.875rem]">
          <span className="sr-only">Pillar {letter}: </span>
          {title}
        </h3>
      </div>

      <div className="reveal mt-8 flex flex-col gap-6 sm:mt-10 sm:flex-row sm:items-center sm:justify-between" style={{ ["--d" as string]: 120 }}>
        <h4 className="font-serif text-[2.25rem] font-medium leading-[1.05] tracking-[-0.015em] text-ink sm:text-[2.875rem]">
          Choose what you run.
        </h4>
        {names.length > 0 ? (
          <a href={requestHref(names)} className="btn btn-solid self-start">
            Request this configuration <Arrow />
          </a>
        ) : (
          <button type="button" disabled className="btn btn-solid cursor-not-allowed self-start opacity-40 hover:bg-ink hover:text-paper">
            Request this configuration <Arrow />
          </button>
        )}
      </div>

      <fieldset className="m-0 mt-8 min-w-0 border-0 p-0 sm:mt-10">
        <legend className="sr-only">Modules you run</legend>
        <div className="reveal grid gap-3 lg:grid-cols-3 lg:grid-rows-[auto_auto_auto] lg:gap-x-4 lg:gap-y-0" style={{ ["--d" as string]: 240 }}>
          {modules.map((m) => {
            const on = chosen.has(m.id);
            return (
              <label
                key={m.id}
                data-on={on}
                className="group relative flex cursor-pointer select-none flex-col rounded-[10px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-sanad lg:row-span-3 lg:grid lg:grid-rows-subgrid"
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(m.id)}
                  aria-labelledby={`mod-${m.id}`}
                  aria-describedby={`mod-${m.id}-owns mod-${m.id}-guarantee`}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 origin-top scale-y-0 rounded-[10px] bg-mist-soft opacity-0 transition-[transform,opacity] duration-700 ease-out group-data-[on=true]:scale-y-100 group-data-[on=true]:opacity-100 motion-reduce:transition-none"
                />

                <span className="relative flex items-center gap-4 border-b border-ink/10 px-6 py-5 transition-colors duration-500 group-data-[on=true]:border-sanad/25 sm:px-8 sm:py-7 lg:min-h-[9.5rem] lg:gap-3.5 lg:px-7 lg:py-0 xl:gap-5 xl:px-9">
                  <span
                    aria-hidden="true"
                    className="grid size-8 shrink-0 place-items-center rounded-control border-[1.6px] border-ink transition-colors duration-300 group-data-[on=true]:bg-ink motion-reduce:transition-none"
                  >
                    <svg viewBox="0 0 16 16" className="size-[18px] text-paper" fill="none">
                      <path
                        d="M3.5 8.5l3 3 6-7"
                        pathLength={1}
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="[stroke-dasharray:1] [stroke-dashoffset:1] transition-[stroke-dashoffset] duration-500 group-data-[on=true]:[stroke-dashoffset:0] motion-reduce:transition-none"
                      />
                    </svg>
                  </span>
                  <span className="shrink-0 lg:hidden xl:block">
                    <LineIcon
                      name={ICON[m.id]}
                      size={52}
                      washClass="opacity-40 transition-opacity duration-500 group-data-[on=true]:opacity-100"
                    />
                  </span>
                  <span
                    id={`mod-${m.id}`}
                    className="font-serif text-[2.25rem] font-medium leading-none tracking-[-0.02em] text-ink-3 transition-colors duration-500 group-data-[on=true]:text-ink sm:text-[2.5rem] xl:text-[3rem]"
                  >
                    {m.short}
                  </span>
                </span>

                <span
                  id={`mod-${m.id}-owns`}
                  className="relative block border-b border-ink/10 px-6 py-6 font-serif text-[1.375rem] font-medium leading-[1.28] text-ink-3 transition-colors duration-500 group-data-[on=true]:border-sanad/25 group-data-[on=true]:text-sanad sm:px-8 sm:py-8 sm:text-[1.5rem] lg:px-7 xl:px-9 xl:text-[1.8rem]"
                >
                  {m.owns}
                </span>

                <span
                  id={`mod-${m.id}-guarantee`}
                  className="relative block px-6 pb-7 pt-6 font-serif text-[1.75rem] font-medium leading-[1.12] tracking-[-0.015em] text-ink-3 transition-colors duration-500 group-data-[on=true]:text-ink sm:px-8 sm:pb-9 sm:pt-8 sm:text-[2rem] lg:px-7 lg:pb-12 xl:px-9 xl:text-[2.4rem]"
                >
                  {m.guarantee}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="sr-only" aria-live="polite">
        {names.length === 0 ? "No modules selected." : `${names.length} selected: ${names.join(", ")}.`}
      </p>
    </div>
  );
}
