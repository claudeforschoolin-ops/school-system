/**
 * المساعدون الأذكياء (الجزء ٥١): تعريفات ثابتة. الربط بواجهة الذكاء الاصطناعي في المرحلة ٨.
 * قاعدة صارمة: لا يعدّلون بيانات مالية أو أكاديمية دون تأكيد صريح من مستخدم مخوّل.
 */
export interface AgentDef {
  key: string;
  name: string;
  icon: string;
  color: "navy" | "teal" | "slate" | "gold" | "green" | "purple";
  summary: string;
  capabilities: string[];
  /** الوحدة التي يجب أن يملك المستخدم صلاحية عرضها لاستخدام المساعد */
  module: string;
}

export const AGENTS: readonly AgentDef[] = [
  {
    key: "routing",
    name: "مساعد توجيه المهام",
    icon: "lucide:workflow",
    color: "navy",
    summary: "يقترح المسؤول المناسب لكل مهمة جديدة ويتابع المتأخر منها.",
    capabilities: ["اقتراح مسؤول للمهام غير المسندة", "تلخيص المهام المتأخرة أسبوعياً", "تذكير المسؤولين قبل الاستحقاق"],
    module: "workspace",
  },
  {
    key: "collections",
    name: "مساعد التحصيل المالي",
    icon: "lucide:hand-coins",
    color: "gold",
    summary: "يتابع الفواتير المتأخرة ويصوغ رسائل تذكير لأولياء الأمور.",
    capabilities: ["قائمة الأسر المتأخرة حسب التقادم", "صياغة رسائل تذكير متدرجة", "كشف الأنماط غير المعتادة في التحصيل"],
    module: "invoices",
  },
  {
    key: "attendance",
    name: "مساعد الحضور والغياب",
    icon: "lucide:calendar-check",
    color: "teal",
    summary: "يكشف الغياب المتكرر مبكراً ويقترح التدخل المناسب.",
    capabilities: ["تنبيه عند تجاوز حد الغياب", "تلخيص الغياب اليومي للوكيل", "اقتراح إحالة للمرشد الطلابي"],
    module: "attendance",
  },
  {
    key: "reports",
    name: "مساعد التقارير",
    icon: "lucide:chart-bar",
    color: "slate",
    summary: "يجيب عن أسئلتك عن البيانات ضمن صلاحياتك ويولّد تقارير سريعة.",
    capabilities: ["الإجابة عن أسئلة البيانات بلغة طبيعية", "إنشاء تقرير من وصف نصي", "مقارنة الفترات"],
    module: "dashboards",
  },
  {
    key: "parents",
    name: "مساعد دعم أولياء الأمور",
    icon: "lucide:messages-square",
    color: "green",
    summary: "يصوغ ردوداً مهذبة وسريعة على استفسارات أولياء الأمور.",
    capabilities: ["اقتراح رد على الرسائل الواردة", "تلخيص سجل التواصل مع الأسرة", "ترجمة الرسائل"],
    module: "messages",
  },
  {
    key: "onboarding",
    name: "مساعد المعلم الجديد",
    icon: "lucide:graduation-cap",
    color: "purple",
    summary: "يرشد المعلمين الجدد خطوة بخطوة في أسبوعهم الأول.",
    capabilities: ["جولة تعريفية بالمنصة", "الإجابة عن أسئلة السياسات", "تذكير بمهام الأسبوع الأول"],
    module: "workspace",
  },
];

export const AGENT_MAP = new Map(AGENTS.map((a) => [a.key, a]));
