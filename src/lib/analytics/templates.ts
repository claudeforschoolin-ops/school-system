/**
 * قوالب تقارير جاهزة: نقطة بداية تُفتح في المنشئ ويمكن تعديلها وحفظها.
 */
import type { ReportConfig } from "./query";

export interface ReportTemplate {
  key: string;
  name: string;
  description: string;
  dataset: string;
  config: ReportConfig;
}

export const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    key: "overdue-families",
    name: "الطلاب المتأخرون في السداد",
    description: "من عليهم مبالغ متأخرة مع ولي الأمر وجواله، الأكبر أولاً",
    dataset: "students",
    config: { columns: ["fullName", "grade", "section", "guardianName", "guardianPhone", "overdueMinor", "balanceMinor"], filters: [{ field: "overdueMinor", op: "gt", value: 0 }], sort: { key: "overdueMinor", dir: "desc" } },
  },
  {
    key: "absence-by-grade",
    name: "الغياب حسب الصف هذا الشهر",
    description: "عدد حالات الغياب لكل صف منذ بداية الشهر",
    dataset: "attendance",
    config: { columns: [], filters: [{ field: "status", op: "eq", value: "ABSENT" }, { field: "date", op: "relative", value: "this_month" }], groupBy: { field: "grade" }, aggregates: [{ fn: "count" }], chart: { type: "bar" } },
  },
  {
    key: "repeat-absence",
    name: "غياب متكرر خلال أسبوعين",
    description: "طلاب غابوا ٣ أيام فأكثر في آخر ١٤ يوماً",
    dataset: "students",
    config: { columns: ["fullName", "grade", "section", "absencesLast14", "absences", "guardianName", "guardianPhone"], filters: [{ field: "absencesLast14", op: "gte", value: 3 }, { field: "status", op: "eq", value: "ACTIVE" }], sort: { key: "absencesLast14", dir: "desc" } },
  },
  {
    key: "collections-by-method",
    name: "التحصيل حسب طريقة الدفع",
    description: "مجموع سندات القبض لهذا الشهر لكل طريقة دفع",
    dataset: "receipts",
    config: { columns: [], filters: [{ field: "date", op: "relative", value: "this_month" }, { field: "status", op: "eq", value: "POSTED" }], groupBy: { field: "method" }, aggregates: [{ fn: "sum", field: "amountMinor" }, { fn: "count" }], chart: { type: "bar" } },
  },
  {
    key: "collections-monthly",
    name: "التحصيل الشهري",
    description: "اتجاه التحصيل شهراً بشهر",
    dataset: "receipts",
    config: { columns: [], filters: [{ field: "status", op: "eq", value: "POSTED" }], groupBy: { field: "date", bucket: "month" }, aggregates: [{ fn: "sum", field: "amountMinor" }], chart: { type: "column" } },
  },
  {
    key: "expenses-by-account",
    name: "المصروفات حسب الحساب",
    description: "سندات الصرف هذه السنة مجمّعة بحساب المصروف",
    dataset: "vouchers",
    config: { columns: [], filters: [{ field: "date", op: "relative", value: "this_year" }], groupBy: { field: "account" }, aggregates: [{ fn: "sum", field: "totalMinor" }, { fn: "count" }], chart: { type: "bar" } },
  },
  {
    key: "expiring-docs",
    name: "وثائق موظفين تنتهي خلال ٣٠ يوماً",
    description: "الهوية أو الإقامة المنتهية قريباً لتجديدها في وقتها",
    dataset: "employees",
    config: { columns: ["number", "fullName", "department", "nationality", "idExpiry", "passportExpiry"], filters: [{ field: "idExpiry", op: "relative", value: "next_30" }], sort: { key: "idExpiry", dir: "asc" } },
  },
  {
    key: "headcount-by-dept",
    name: "الموظفون حسب القسم",
    description: "عدد الموظفين على رأس العمل في كل قسم",
    dataset: "employees",
    config: { columns: [], filters: [{ field: "status", op: "eq", value: "ACTIVE" }], groupBy: { field: "department" }, aggregates: [{ fn: "count" }], chart: { type: "bar" } },
  },
  {
    key: "at-risk",
    name: "طلاب دون حد التحصيل",
    description: "معدل الفصل الدراسي أقل من ٦٠٪ من الدرجات المعتمدة",
    dataset: "term_results",
    config: { columns: ["student", "grade", "section", "averageBp", "failedSubjects", "result"], filters: [{ field: "averageBp", op: "lt", value: 6000 }], sort: { key: "averageBp", dir: "asc" } },
  },
  {
    key: "admissions-funnel",
    name: "طلبات القبول حسب المرحلة",
    description: "مسار القبول من الطلب الجديد حتى التسجيل",
    dataset: "admissions",
    config: { columns: [], filters: [], groupBy: { field: "stage" }, aggregates: [{ fn: "count" }], chart: { type: "bar" } },
  },
  {
    key: "maintenance-by-category",
    name: "الصيانة حسب التصنيف",
    description: "عدد البلاغات ومتوسط ساعات إنجازها وتكلفتها",
    dataset: "maintenance",
    config: { columns: [], filters: [], groupBy: { field: "category" }, aggregates: [{ fn: "count" }, { fn: "avg", field: "hoursToComplete" }, { fn: "sum", field: "costMinor" }], chart: { type: "bar" } },
  },
  {
    key: "overdue-loans",
    name: "إعارات متأخرة لم تُرجع",
    description: "الكتب المتأخرة عن موعد إرجاعها",
    dataset: "library_loans",
    config: { columns: ["book", "borrower", "loanedAt", "dueDate", "overdueDays"], filters: [{ field: "open", op: "isTrue" }, { field: "overdueDays", op: "gt", value: 0 }], sort: { key: "overdueDays", dir: "desc" } },
  },
  {
    key: "low-stock",
    name: "أصناف تحت الحد الأدنى",
    description: "ما يحتاج طلب شراء قبل النفاد",
    dataset: "inventory_items",
    config: { columns: ["sku", "name", "category", "onHandQty", "minQty", "stockValueMinor"], filters: [{ field: "belowMin", op: "isTrue" }], sort: { key: "onHandQty", dir: "asc" } },
  },
];
