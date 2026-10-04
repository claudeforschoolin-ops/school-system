"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Words settle from pale to full ink as the paragraph scrolls through the viewport,
 * the way a reader's eye moves down a page. Static text when motion is reduced.
 */
export function WordReveal({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const spans = Array.from(el.querySelectorAll<HTMLElement>("[data-w]"));
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.9 - r.top) / (vh * 0.5 + r.height)));
      const n = spans.length;
      spans.forEach((s, i) => {
        const t = Math.min(1, Math.max(0, p * (n + 8) - i) / 1);
        s.style.opacity = String(0.16 + 0.84 * t);
      });
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

  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <span key={i} data-w style={{ transition: "opacity 0.25s linear" }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </p>
  );
}
