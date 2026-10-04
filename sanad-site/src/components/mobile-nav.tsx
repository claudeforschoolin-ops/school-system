"use client";

import { useEffect, useRef, useState } from "react";
import { dossierHref, nav } from "@/content/site";

/** Disclosure menu for screens below `lg`. Closes on link press, Escape and outside press. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div ref={root} className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
        className="text-caption flex h-10 items-center gap-2 rounded-control border border-ink px-3 font-medium text-ink"
      >
        Menu
        <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true" className="dg-line">
          {open ? (
            <path d="M2 1l10 8M12 1L2 9" />
          ) : (
            <path d="M1 2h12M1 8h12" />
          )}
        </svg>
      </button>

      {open && (
        <nav
          id="mobile-nav"
          aria-label="Primary"
          className="absolute inset-x-0 top-full border-b border-hairline bg-paper"
        >
          <ul className="wrap py-3">
            {nav.map((item) => (
              <li key={item.href} className="border-b border-hairline last:border-b-0">
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="text-title block py-4 text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
            <li className="pb-3 pt-4">
              <a
                href={dossierHref}
                onClick={() => setOpen(false)}
                className="text-caption inline-block rounded-control border border-ink px-4 py-2.5 font-medium text-ink"
              >
                Request Technical Dossier
              </a>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
