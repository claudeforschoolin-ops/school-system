"use client";
/**
 * تبويبات ملف الطالب القادمة من وحدات أخرى (الحضور، السلوك، الأنشطة).
 */
import type { Action } from "@/lib/rbac/catalog";

export function studentExtraTabs(can: (module: string, action: Action) => boolean): Array<{ key: string; label: string }> {
  void can;
  return [];
}

export function StudentExtraTabs({ tab, studentId }: { tab: string; studentId: string }) {
  void tab;
  void studentId;
  return null;
}
