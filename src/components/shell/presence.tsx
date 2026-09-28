"use client";
/**
 * العناصر العائمة (Stickers): دوائر صغيرة تمثل المتصلين الآن بالصفحة،
 * تطفو بحركة جيبية بطيئة (±٤px) وتميل قليلاً نحو مؤشر الفأرة، ويمكن سحبها.
 */
import { motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc/client";
import { Avatar } from "@/components/ui/avatar";
import { Tooltip } from "@/components/ui/tooltip";
import { useApp } from "./app-context";

export function usePresence(target: string | null) {
  const heartbeat = trpc.workspace.presence.useMutation();
  const beat = heartbeat.mutate;
  useEffect(() => {
    if (!target) return;
    beat({ target });
    const id = setInterval(() => beat({ target }), 15_000);
    return () => {
      clearInterval(id);
      beat({ target, leaving: true });
    };
  }, [target, beat]);
  return heartbeat.data ?? [];
}

export function PresenceStickers({ target }: { target: string }) {
  const { user } = useApp();
  const everyone = usePresence(target);
  const others = everyone.filter((p) => p.userId !== user.id);
  if (!others.length) return null;
  return (
    <div className="no-print pointer-events-none absolute end-6 top-14 z-10 flex gap-2">
      {others.slice(0, 5).map((p, i) => (
        <Sticker key={p.userId} name={p.name} color={p.avatarColor} index={i} />
      ))}
    </div>
  );
}

function Sticker({ name, color, index }: { name: string; color: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 60, damping: 14 });
  const sy = useSpring(y, { stiffness: 60, damping: 14 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const pull = Math.min(6, 600 / dist);
      x.set((dx / dist) * pull);
      y.set((dy / dist) * pull);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [x, y]);
  return (
    <motion.div ref={ref} style={{ x: sx, y: sy }} className="pointer-events-auto">
      <motion.div
        drag
        dragSnapToOrigin
        dragTransition={{ bounceStiffness: 420, bounceDamping: 32 }}
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3.4 + index * 0.6, repeat: Infinity, ease: "easeInOut" }}
        whileDrag={{ scale: 1.1 }}
        className="cursor-grab active:cursor-grabbing"
      >
        <Tooltip content={`${name} يشاهد الآن`}>
          <span className="block rounded-full p-0.5 shadow-[0_2px_10px_rgba(15,23,42,.14)]" style={{ background: `var(--tag-${color}-dot)` }}>
            <Avatar name={name} color={color} size={30} className="ring-2 ring-app" />
          </span>
        </Tooltip>
      </motion.div>
    </motion.div>
  );
}
