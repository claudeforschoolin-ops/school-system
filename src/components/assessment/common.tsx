"use client";
/**
 * عناصر مشتركة لوحدات التقييم: الفصل الدراسي المختار (في الرابط)، وسوم الحالات، وتنسيق النسب والدرجات.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { bpToPercentString, tenthsToString } from "@/lib/assessment/calc";
import { MODULE_NAV, type ModuleNavItem } from "@/lib/modules-nav";
import { applyDigits } from "@/lib/numbers";
import { trpc } from "@/lib/trpc/client";
import { Select } from "@/components/ui/select";
import { usePrefs } from "@/components/shell/app-context";

export const assessmentNav = (key: string): ModuleNavItem => MODULE_NAV.find((m) => m.key === key)!;

export const EXAM_TABS = [{ href: "/assessment/exams", label: "دورات الاختبار", exact: true }];
export const RESULTS_TABS = [
  { href: "/assessment/results", label: "كشف النتائج", exact: true },
  { href: "/assessment/results/scheme", label: "نظام التقييم" },
  { href: "/assessment/results/settings", label: "رؤساء الأقسام والإعدادات" },
];
export const CARDS_TABS = [
  { href: "/assessment/report-cards", label: "الإصدار والنشر", exact: true },
  { href: "/assessment/report-cards/templates", label: "قوالب الشهادة" },
];

export const SHEET_STATUS: Record<string, { label: string; color: string }> = {
  DRAFT: { label: "مسودة", color: "gray" },
  SUBMITTED: { label: "مرسلة للمراجعة", color: "gold" },
  REVIEWED: { label: "راجعها رئيس القسم", color: "teal" },
  APPROVED: { label: "معتمدة ومقفلة", color: "green" },
};
export const RESULT_STATUS: Record<string, { label: string; color: string }> = {
  PASS: { label: "ناجح", color: "green" },
  SECOND_ROUND: { label: "دور ثانٍ", color: "orange" },
  FAIL: { label: "راسب", color: "red" },
  INCOMPLETE: { label: "غير مكتمل", color: "gray" },
};
export const CHANGE_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "بانتظار الموافقة", color: "gold" },
  APPLIED: { label: "طُبّق", color: "green" },
  REJECTED: { label: "مرفوض", color: "red" },
};
export const EXAM_PHASE: Record<string, { label: string; color: string }> = {
  UPCOMING: { label: "قادمة", color: "navy" },
  RUNNING: { label: "جارية", color: "gold" },
  DONE: { label: "منتهية", color: "gray" },
};

/** تنسيق النسب والدرجات بتفضيل الأرقام */
export function useScore() {
  const prefs = usePrefs();
  return {
    pct: (bp: number | null | undefined, fraction = 1) => (bp === null || bp === undefined ? "—" : `${applyDigits(bpToPercentString(bp, fraction), prefs.digits).replace(".", prefs.digits === "arab" ? "٫" : ".")}٪`),
    tenths: (t: number | null | undefined) => (t === null || t === undefined ? "" : applyDigits(tenthsToString(t), prefs.digits).replace(".", prefs.digits === "arab" ? "٫" : ".")),
    digits: prefs.digits,
  };
}

/** الفصل الدراسي من الرابط (?term=) وإلا الحالي */
export function useTermParam() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = trpc.assessment.grades.currentTerm.useQuery();
  const termId = params.get("term") ?? q.data?.currentId ?? null;
  const setTerm = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("term", id);
    router.replace(`${pathname}?${next.toString()}`);
  };
  return { termId, terms: q.data?.terms ?? [], year: q.data?.year ?? null, setTerm, loading: q.isLoading };
}

export function TermPicker({ value, terms, onChange, extra }: { value: string | null; terms: Array<{ id: string; name: string }>; onChange: (id: string) => void; extra?: Array<{ value: string; label: string }> }) {
  if (!terms.length) return null;
  return <Select size="sm" className="w-[180px]" value={value ?? undefined} onChange={onChange} options={[...terms.map((t) => ({ value: t.id, label: t.name })), ...(extra ?? [])]} />;
}

/** شريط درجة ملون حسب النسبة (أحمر تحت النجاح، ذهبي قريب، أخضر فوق) */
export function scoreTone(bp: number | null | undefined, passBp = 5000) {
  if (bp === null || bp === undefined) return "text-fg-3";
  if (bp < passBp) return "text-danger-700";
  if (bp < passBp + 1500) return "text-warning-700";
  return "text-fg";
}
