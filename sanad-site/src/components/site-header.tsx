"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Arrow } from "@/components/arrow";
import { Lockup } from "@/components/brand/mark";
import { dossierHref, sections, site } from "@/content/site";

type Here = { n: string; label: string };
const TOP: Here = { n: "", label: "Enterprise engineering studio" };

/**
 * A running head, like a book's. The bar names the section you are reading and
 * its lower edge fills as you go. Navigation lives in an index that opens over
 * the whole page, set in the display face.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [here, setHere] = useState<Here>(TOP);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  // which section is crossing the middle of the screen
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>("[data-section]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const t = e.target as HTMLElement;
          setHere({ n: t.dataset.n ?? "", label: t.dataset.label ?? "" });
        }
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }, []);

  // scroll lock, Escape, and a simple focus loop while the index is open
  useEffect(() => {
    if (!open) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || !overlay.current) return;
      const f = overlay.current.querySelectorAll<HTMLElement>("a[href], button");
      const first = f[0];
      const last = f[f.length - 1];
      const wrap = e.shiftKey ? document.activeElement === first : document.activeElement === last;
      if (!wrap) return;
      e.preventDefault();
      (e.shiftKey ? last : first)?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  return (
    <>
      <header className="sticky top-0 z-40 bg-paper">
        <div className="wrap relative grid h-[4.25rem] grid-cols-[1fr_auto] items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
          <a href="#top" aria-label="Sanad, back to top" className="justify-self-start text-ink">
            <Lockup size={30} className="max-sm:text-[1.65rem]" />
          </a>

          {/* running head */}
          <p aria-hidden="true" className="text-caption hidden min-w-[16rem] justify-center md:flex">
            <span key={`${here.n}-${here.label}`} className="rh inline-flex items-baseline gap-3">
              {here.n ? <span className="font-serif text-[1.1875rem] font-medium text-sanad">{here.n}</span> : null}
              <span className="text-ink-3">{here.label}</span>
            </span>
          </p>

          <div className="flex items-center gap-3 justify-self-end">
            <a href={dossierHref} className="btn btn-line hidden !py-2 lg:inline-flex">
              Request Technical Dossier
            </a>
            <button
              ref={trigger}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="btn btn-solid group !gap-3 !py-2"
            >
              Index
              <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="transition-transform duration-500 group-hover:scale-x-75">
                <path d="M1 1h14M1 7h14" />
              </svg>
            </button>
          </div>
        </div>
        <div className="relative h-px bg-hairline">
          <span aria-hidden="true" className="header-progress" />
        </div>
      </header>

      {/* the index */}
      <div
        ref={overlay}
        role="dialog"
        aria-modal="true"
        aria-label="Index"
        aria-hidden={!open}
        className={`fixed inset-0 z-[70] overflow-y-auto bg-mist text-ink transition-[clip-path,visibility] duration-[800ms] ease-[cubic-bezier(0.7,0,0.2,1)] ${
          open ? "visible [clip-path:inset(0_0_0_0)]" : "invisible [clip-path:inset(0_0_100%_0)]"
        }`}
      >
        <div className="wrap flex min-h-full flex-col">
          <div className="flex h-[4.25rem] flex-none items-center justify-between">
            <Lockup size={30} className="max-sm:text-[1.65rem]" />
            <button ref={closeBtn} type="button" onClick={close} className="btn btn-line !gap-3 !py-2">
              Close
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
                <path d="M1 1l10 10M11 1L1 11" />
              </svg>
            </button>
          </div>

          <div className="grid flex-1 gap-10 pb-12 pt-8 lg:grid-cols-12 lg:gap-14 lg:pt-14">
            <div className="flex flex-col justify-between lg:col-span-4">
              <p className="text-caption text-ink/70">Index</p>
              <div className="mt-10 lg:mt-0">
                <p className="font-serif text-[1.375rem] italic">{site.tagline}</p>
                <a href={dossierHref} onClick={() => setOpen(false)} className="btn btn-solid mt-8">
                  Request Technical Dossier
                  <Arrow />
                </a>
                <p className="text-caption mt-6 text-ink/70">
                  <a href={`mailto:${site.email}`} className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
                    {site.email}
                  </a>
                </p>
              </div>
            </div>

            <ol className="m-0 list-none border-t border-ink/25 p-0 lg:col-span-8">
              {sections.map((s, i) => (
                <li
                  key={s.n}
                  className="border-b border-ink/15 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.2,0.7,0.1,1)]"
                  style={{
                    opacity: open ? 1 : 0,
                    transform: open ? "none" : "translateY(26px)",
                    transitionDelay: open ? `${380 + i * 55}ms` : "0ms",
                  }}
                >
                  <a href={s.href} onClick={() => setOpen(false)} className="group grid grid-cols-[2.75rem_1fr] items-baseline gap-x-4 py-4 sm:grid-cols-[3.5rem_1fr_auto] sm:py-5">
                    <span className="font-serif text-[1.375rem] font-medium text-sanad">{s.n}</span>
                    <span className="text-heading transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.1,1)] group-hover:translate-x-3">{s.label}</span>
                    <span className="text-caption col-start-2 text-ink/65 sm:col-start-auto sm:text-right">{s.note}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </>
  );
}
