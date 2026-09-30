"use client";
/**
 * مضيف الجولات الإرشادية: يبرز العنصر المعني ببقعة ضوء وبطاقة شرح بجانبه.
 * لا يحجب الصفحة (يمكن متابعة العمل)، ويحفظ إنهاء الجولة أو تخطيها في تفضيلات المستخدم.
 */
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatNumber } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { TOUR_MAP, tourForPath, type TourDef, type TourStep } from "@/lib/tours";
import { Button } from "@/components/ui/button";
import { useApp } from "./app-context";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function visibleTarget(step: TourStep): HTMLElement | null {
  if (!step.target) return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? el : null;
}

export function TourHost() {
  const path = usePathname();
  const { data, can, prefs } = useApp();
  const utils = trpc.useUtils();
  const policy = trpc.compliance.current.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  const blocked = policy.data?.needsAcceptance ?? false;
  const complete = trpc.support.completeTour.useMutation({ onSuccess: () => void utils.account.context.invalidate() });
  const [tour, setTour] = useState<{ def: TourDef; steps: TourStep[]; i: number } | null>(null);
  const [pos, setPos] = useState<{ step: TourStep; r: Rect } | null>(null);
  const done = useRef(new Set<string>());
  const saved = data.user.preferences.toursDone;
  useEffect(() => {
    for (const k of saved ?? []) done.current.add(k);
  }, [saved]);

  // بدء الجولة: بطلب صريح (?tour=) أو تلقائياً أول زيارة
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("tour");
    const def = forced ? (TOUR_MAP.get(forced) ?? null) : tourForPath(path);
    if (blocked || !def || (!forced && (done.current.has(def.key) || (saved ?? []).includes(def.key)))) return;
    if (def.module && !can(def.module, "view")) return;
    const timer = window.setTimeout(() => {
      const steps = def.steps.filter((s) => !s.target || visibleTarget(s));
      if (steps.length) setTour({ def, steps, i: 0 });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [path, saved, can, blocked]);

  const step = tour?.steps[tour.i] ?? null;

  // تتبّع موضع العنصر مع التمرير وتغيير الحجم
  useEffect(() => {
    if (!step) return;
    const el = visibleTarget(step);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: prefs.reducedMotion ? "auto" : "smooth" });
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setPos({ step, r: { top: r.top, left: r.left, width: r.width, height: r.height } });
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [step, prefs.reducedMotion]);

  const finish = useCallback(() => {
    if (!tour) return;
    done.current.add(tour.def.key);
    complete.mutate({ key: tour.def.key });
    setTour(null);
    setPos(null);
    if (new URLSearchParams(window.location.search).has("tour")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("tour");
      window.history.replaceState(null, "", url.toString());
    }
  }, [tour, complete]);

  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour, finish]);

  const nextRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [step]);

  if (!tour || !step) return null;
  const rect = pos && pos.step === step ? pos.r : null;
  const last = tour.i === tour.steps.length - 1;
  const n = (v: number) => formatNumber(v, prefs.digits);
  // موضع البطاقة: تحت العنصر إن اتسع المكان وإلا فوقه، ومحصورة داخل الشاشة
  const W = 340;
  const pad = 8;
  let cardStyle: React.CSSProperties;
  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = rect.top + rect.height + 12;
    const room = vh - below;
    const left = Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), vw - W - 12);
    // عناصر الشريط الجانبي الطويلة: البطاقة بجانبها
    if (rect.height > vh * 0.45) cardStyle = { top: Math.min(Math.max(12, rect.top + 40), vh - 240), left: rect.left > vw / 2 ? Math.max(12, rect.left - W - 16) : Math.min(vw - W - 12, rect.left + rect.width + 16), width: W };
    else cardStyle = room > 220 ? { top: below, left, width: W } : { bottom: vh - rect.top + 12, left, width: W };
  } else cardStyle = { top: "30%", left: "50%", transform: "translateX(-50%)", width: W + 40 };
  return (
    <div className="no-print pointer-events-none fixed inset-0 z-[60]" aria-live="polite">
      {rect ? (
        <div
          className="absolute rounded-lg ring-2 ring-navy-600 transition-[top,left,width,height] duration-200"
          style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2, boxShadow: "0 0 0 9999px var(--bg-overlay)" }}
        />
      ) : (
        <div className="absolute inset-0 bg-overlay" />
      )}
      <div role="dialog" aria-labelledby="tour-title" aria-describedby="tour-body" className="anim-pop pointer-events-auto absolute rounded-xl bg-elevated p-4 shadow-popover" style={cardStyle}>
        <p className="text-[12px] text-fg-3">{tour.def.title} · {n(tour.i + 1)} من {n(tour.steps.length)}</p>
        <h2 id="tour-title" className="mt-1 text-[16px] font-semibold">{step.title}</h2>
        <p id="tour-body" className="mt-1.5 text-[14px] leading-6 text-fg-2">{step.body}</p>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button size="sm" variant="ghost" onClick={finish}>{last ? "إغلاق" : "تخطي الجولة"}</Button>
          <span className="flex gap-1.5">
            {tour.i > 0 ? <Button size="sm" variant="secondary" onClick={() => setTour({ ...tour, i: tour.i - 1 })}>السابق</Button> : null}
            <Button ref={nextRef} size="sm" variant="primary" onClick={() => (last ? finish() : setTour({ ...tour, i: tour.i + 1 }))}>{last ? "إنهاء" : "التالي"}</Button>
          </span>
        </div>
      </div>
    </div>
  );
}
