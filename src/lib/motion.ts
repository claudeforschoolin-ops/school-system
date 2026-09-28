/**
 * إعدادات الحركة الموحدة (الجزء ٤): قصيرة، ناعمة، وظيفية.
 */
import type { Transition, Variants } from "motion/react";

export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;
export const EASE_IN_OUT = [0.4, 0, 0.2, 1] as const;

export const SPRING: Transition = { type: "spring", stiffness: 420, damping: 32 };
export const SOFT_SPRING: Transition = { type: "spring", stiffness: 300, damping: 30 };

export const durations = {
  hover: 0.12,
  active: 0.16,
  collapse: 0.2,
  sidebar: 0.24,
  page: 0.18,
  card: 0.14,
  popover: 0.16,
  peek: 0.24,
  menu: 0.12,
  toast: 0.2,
  chart: 0.6,
} as const;

/** الانتقال بين الصفحات: تلاشي + إزاحة ٤px للأعلى */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: durations.page, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};

/** النوافذ المنبثقة: تكبير من ٠.٩٨ إلى ١ */
export const popIn: Variants = {
  initial: { opacity: 0, scale: 0.98 },
  animate: { opacity: 1, scale: 1, transition: { duration: durations.popover, ease: EASE_OUT } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.1, ease: EASE_IN_OUT } },
};

/** إضافة عنصر: تمدد الارتفاع + تلاشي */
export const expandIn: Variants = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto", transition: { duration: 0.2, ease: EASE_OUT } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.18, ease: EASE_IN_OUT } },
};

export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: durations.popover } },
  exit: { opacity: 0, transition: { duration: 0.1 } },
};
