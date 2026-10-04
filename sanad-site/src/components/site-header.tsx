"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Arrow } from "@/components/arrow";
import { Wordmark } from "@/components/brand/mark";
import { dossierHref, sections, site } from "@/content/site";

/** The four primary links, set as italic type. Everything else is reachable from the index. */
const LINKS = [
  { label: "Architecture", href: "#architecture" },
  { label: "Systems", href: "#systems" },
  { label: "The 30% Law", href: "#thirty-percent-law" },
  { label: "Company", href: "#company" },
] as const;

/**
 * Type only: a wordmark, four links in italic, one underlined request. It shares the
 * hero's blue while the hero is behind it, then turns to paper. Below the large breakpoint
 * the links fold into an index that opens over the page.
 */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const overlay = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const hero = document.getElementById("top");
    if (!hero) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      setDark(window.scrollY < hero.offsetHeight - 72);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }, []);

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
      <header
        className={`sticky top-0 z-40 border-b transition-colors duration-500 ${
          dark ? "border-paper/15 bg-sanad text-paper" : "border-ink/10 bg-paper text-ink"
        }`}
      >
        <div className="wrap relative grid h-[4.5rem] grid-cols-[1fr_auto] items-center gap-6 lg:grid-cols-[1fr_auto_1fr]">
          <a href="#top" aria-label="Sanad, back to top" className="justify-self-start">
            <Wordmark size={30} />
          </a>

          <nav aria-label="Primary" className="hidden items-center gap-11 lg:flex">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="nav-link font-serif text-[1.3125rem] italic opacity-90 transition-opacity hover:opacity-100">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-7 justify-self-end">
            <a
              href={dossierHref}
              className="text-caption hidden border-b border-current/50 pb-0.5 font-medium transition-[border-color] hover:border-current md:inline-block"
            >
              Request Technical Dossier <span aria-hidden="true">→</span>
            </a>
            <button
              ref={trigger}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="font-serif text-[1.375rem] italic lg:hidden"
            >
              Index
            </button>
          </div>

          <span aria-hidden="true" className={`header-progress ${dark ? "bg-paper" : "bg-sanad"}`} />
        </div>
      </header>

      {/* the index, for small screens */}
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
          <div className="flex h-[4.5rem] flex-none items-center justify-between">
            <Wordmark size={30} />
            <button ref={closeBtn} type="button" onClick={close} className="font-serif text-[1.375rem] italic">
              Close
            </button>
          </div>

          <div className="grid flex-1 gap-10 pb-12 pt-6">
            <ol className="m-0 list-none border-t border-ink/25 p-0">
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
                  <a href={s.href} onClick={() => setOpen(false)} className="group grid grid-cols-[2.75rem_1fr] items-baseline gap-x-4 py-4">
                    <span className="font-serif text-[1.375rem] font-medium text-sanad">{s.n}</span>
                    <span className="text-heading">{s.label}</span>
                    <span className="text-caption col-start-2 text-ink/65">{s.note}</span>
                  </a>
                </li>
              ))}
            </ol>
            <div>
              <p className="font-serif text-[1.375rem] italic">{site.tagline}</p>
              <a href={dossierHref} onClick={() => setOpen(false)} className="btn btn-solid mt-6">
                Request Technical Dossier
                <Arrow />
              </a>
              <p className="text-caption mt-5 text-ink/70">
                <a href={`mailto:${site.email}`} className="underline decoration-ink/30 underline-offset-4">
                  {site.email}
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
