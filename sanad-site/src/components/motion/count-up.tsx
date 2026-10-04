"use client";

import { useEffect, useRef } from "react";

type Props = {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
};

/**
 * Counts up once, when visible. The final value is what the server renders, so
 * without scripting or with reduced motion the number is simply correct.
 */
export function CountUp({ to, prefix = "", suffix = "", duration = 1600 }: Props) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const write = (v: number) => (el.textContent = `${prefix}${Math.round(v)}${suffix}`);
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          write(to * (1 - Math.pow(1 - t, 4)));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        write(0);
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, prefix, suffix, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {to}
      {suffix}
    </span>
  );
}
