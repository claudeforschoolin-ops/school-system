"use client";
/** الانتقال بين الصفحات: تلاشي + إزاحة رأسية ٤px للأعلى (١٨٠ms) */
import { motion } from "motion/react";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }} className="min-h-full">
      {children}
    </motion.div>
  );
}
