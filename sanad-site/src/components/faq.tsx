"use client";

import { useId, useState } from "react";
import { SectionHead } from "@/components/section-head";
import { Arrow } from "@/components/arrow";
import { faq, mailto } from "@/content/site";

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();
  return (
    <section id="faq" data-section data-n="07" data-label="Questions" aria-labelledby="faq-title" className="border-b border-hairline py-20 lg:py-28">
      <div className="wrap">
        <SectionHead index={faq.index} label={faq.label} heading={faq.heading} id="faq-title" />

        <div className="mt-14 grid gap-10 lg:grid-cols-12 lg:gap-10">
        <div className="reveal lg:col-span-4">
          <p className="text-body max-w-[20rem]">{faq.note}</p>
          <a href={mailto("Question for Sanad")} className="btn btn-line mt-6">
            Ask us directly
            <Arrow />
          </a>
        </div>
        <div className="reveal border-t border-ink lg:col-span-8">
          {faq.items.map(([q, a], i) => {
            const on = open === i;
            return (
              <div key={q} className="border-b border-hairline">
                <h3 className="m-0">
                  <button
                    type="button"
                    aria-expanded={on}
                    aria-controls={`${base}-${i}`}
                    id={`${base}-b-${i}`}
                    onClick={() => setOpen(on ? null : i)}
                    className="group flex w-full items-center justify-between gap-6 py-5 text-left"
                  >
                    <span className={`text-title transition-colors duration-300 ${on ? "text-sanad" : "text-ink group-hover:text-sanad"}`}>
                      {q}
                    </span>
                    <span aria-hidden="true" className="relative size-4 flex-none">
                      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink" />
                      <span className={`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-ink transition-transform duration-500 ${on ? "scale-y-0" : "scale-y-100"}`} />
                    </span>
                  </button>
                </h3>
                <div
                  id={`${base}-${i}`}
                  role="region"
                  aria-labelledby={`${base}-b-${i}`}
                  className={`grid transition-[grid-template-rows,opacity] duration-500 ease-out ${on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
                >
                  <div className="overflow-hidden">
                    <p className="text-body max-w-[40rem] pb-6">{a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </section>
  );
}
