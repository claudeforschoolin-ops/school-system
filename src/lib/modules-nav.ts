/**
 * روابط الوحدات المبنية في الشريط الجانبي ولوحة الأوامر (تظهر حسب الصلاحية).
 */
import type { Scope } from "@/lib/rbac/catalog";

export interface ModuleNavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
  /** وحدة الصلاحيات */
  module: string;
  /** الإجراء المطلوب لإظهار الرابط (افتراضياً «عرض») */
  action?: "view" | "create" | "update";
  description: string;
  group: "analytics" | "students" | "academic" | "assessment" | "hr" | "finance" | "operations" | "governance";
  /** يظهر فقط لهذه النطاقات (مثل روابط الأسرة أو الخدمة الذاتية) */
  scopes?: readonly Scope[];
  /** يُعدّ نشطاً عند تطابق المسار كاملاً فقط (للوحة الرئيسية لمجموعة) */
  exact?: boolean;
}

export const MODULE_NAV: readonly ModuleNavItem[] = [
  { key: "admissions", label: "القبول والتسجيل", href: "/admissions", icon: "lucide:user-plus", module: "admissions", description: "طلبات الالتحاق ومراحلها حتى التسجيل", group: "students" },
  { key: "students", label: "ملفات الطلاب", href: "/students", icon: "lucide:contact", module: "students", description: "بيانات الطلاب وأولياء أمورهم وصحتهم ومستنداتهم", group: "students" },
  { key: "attendance", label: "الحضور والغياب", href: "/attendance", icon: "lucide:user-check", module: "attendance", description: "التحضير اليومي وغياب اليوم والسجل الشهري والتقارير", group: "students" },
  { key: "transfers", label: "التحويلات والإجازات", href: "/transfers", icon: "lucide:arrow-left-right", module: "transfers", description: "النقل والانسحاب بموافقات وخلو طرف، وإجازات الطلاب واستئذانهم", group: "students" },
  { key: "behavior", label: "السلوك والإرشاد", href: "/behavior", icon: "lucide:heart-handshake", module: "counseling", description: "الملاحظات السلوكية بالنقاط، والحالات الإرشادية السرّية", group: "students" },
  { key: "classes", label: "الصفوف والفصول", href: "/academic/classes", icon: "lucide:layout-grid", module: "classes", description: "الفصول وطاقتها ورائدها وقاعتها، والتوزيع التلقائي، وإنهاء العام الدراسي", group: "academic" },
  { key: "curriculum", label: "المقررات الدراسية", href: "/academic/curriculum", icon: "lucide:book-open", module: "curriculum", description: "الخطة الدراسية لكل صف، والوحدات والدروس، ونسبة إنجاز كل فصل", group: "academic" },
  { key: "assignments", label: "تعيين المعلمين", href: "/academic/assignments", icon: "lucide:user-cog", module: "teacher_assignments", description: "إسناد المواد للمعلمين حسب النصاب والتأهيل، مع عبء كل معلم", group: "academic" },
  { key: "timetable", label: "جداول الحصص", href: "/academic/timetable", icon: "lucide:calendar-clock", module: "timetable", description: "توليد الجدول بالقيود، والتعديل بالسحب، وحصص الانتظار", group: "academic" },
  { key: "activities", label: "الأنشطة والفعاليات", href: "/activities", icon: "lucide:trophy", module: "activities", description: "الأندية والرحلات والمسابقات: التسجيل وموافقات أولياء الأمور والألبوم", group: "academic" },
  { key: "exams", label: "الاختبارات", href: "/assessment/exams", icon: "lucide:clipboard-list", module: "exams", description: "جداول الاختبارات واللجان والقاعات وأرقام الجلوس ومحاضر المراقبة", group: "assessment" },
  { key: "grades", label: "رصد الدرجات", href: "/assessment/grades", icon: "lucide:file-pen", module: "grade_entry", description: "كشوف الرصد بجدول كالإكسل، ومسار الاعتماد، وطلبات تعديل الدرجات المعتمدة", group: "assessment" },
  { key: "results", label: "النتائج والمعدلات", href: "/assessment/results", icon: "lucide:award", module: "gpa", description: "المعدل الفصلي والتراكمي، والترتيب على الفصل والصف والمدرسة، ونظام التقييم", group: "assessment" },
  { key: "report-cards", label: "الشهادات", href: "/assessment/report-cards", icon: "lucide:file-check", module: "report_cards", action: "create", description: "قوالب الشهادات، والإصدار والطباعة الجماعية برمز تحقق، والنشر وحجب المدينين", group: "assessment" },
  { key: "my-results", label: "النتائج والشهادات", href: "/assessment/my-results", icon: "lucide:graduation-cap", module: "report_cards", scopes: ["ASSIGNED", "OWN"], description: "شهادات الأبناء بعد نشر النتائج", group: "assessment" },
  { key: "assessment-stats", label: "إحصاءات التحصيل", href: "/assessment/stats", icon: "lucide:chart-pie", module: "academic_reports", description: "توزيع الدرجات، ومقارنة الفصول والمواد والمعلمين، والمتعثرون والمتفوقون، وتحليل البنود", group: "assessment" },
  { key: "employees", label: "الموظفون", href: "/hr/employees", icon: "lucide:id-card", module: "employees", description: "ملفات الموظفين وعقودهم، والهيكل التنظيمي، وتنبيهات انتهاء الوثائق", group: "hr" },
  { key: "recruitment", label: "التوظيف", href: "/hr/recruitment", icon: "lucide:briefcase", module: "employees", action: "create", description: "الوظائف الشاغرة ولوحة المرشحين من التقديم حتى التعيين", group: "hr" },
  { key: "staff-attendance", label: "الدوام والإجازات", href: "/hr/attendance", icon: "lucide:clock", module: "hr_attendance", action: "update", description: "الورديات والحضور اليومي، وأنواع الإجازات وأرصدتها وطلباتها", group: "hr" },
  { key: "payroll", label: "الرواتب", href: "/hr/payroll", icon: "lucide:banknote", module: "payroll", action: "create", description: "مسيرات الرواتب والاستقطاعات والسلف، والقيد المحاسبي وملف حماية الأجور", group: "hr" },
  { key: "performance", label: "تقييم الأداء", href: "/hr/performance", icon: "lucide:star", module: "performance", description: "دورات التقييم ونماذجها والتقييم الذاتي وتقييم المدير", group: "hr" },
  { key: "end-of-service", label: "نهاية الخدمة", href: "/hr/end-of-service", icon: "lucide:door-open", module: "end_of_service", description: "مكافأة نهاية الخدمة وتسوية الإجازات وإخلاء الطرف", group: "hr" },
  { key: "self-service", label: "خدماتي الوظيفية", href: "/hr/me", icon: "lucide:contact", module: "hr_attendance", scopes: ["OWN"], description: "تسجيل الحضور، وطلب الإجازة، ورصيدي، وقسائم راتبي", group: "hr" },
  { key: "finance", label: "لوحة المالية", href: "/finance", icon: "lucide:wallet", module: "finance_reports", description: "التحصيل مقابل المستهدف، الذمم المتأخرة، النقد، وما ينتظر إجراءك", group: "finance", exact: true },
  { key: "collect", label: "التحصيل", href: "/finance/collect", icon: "lucide:banknote", module: "collections", action: "create", description: "سند قبض سريع بالبحث، ووردية الصندوق، وسجل السندات والشيكات", group: "finance" },
  { key: "invoices", label: "الفواتير", href: "/finance/invoices", icon: "lucide:receipt-text", module: "invoices", description: "فواتير الرسوم وأقساطها، والفوترة الجماعية، وكشوف حساب الأسر", group: "finance" },
  { key: "vouchers", label: "سندات الصرف", href: "/finance/vouchers", icon: "lucide:hand-coins", module: "expenses", description: "المصروفات والمدفوعات للموردين بموافقات حسب المبلغ", group: "finance" },
  { key: "accounting", label: "المحاسبة العامة", href: "/finance/accounting", icon: "lucide:book-open-check", module: "accounting", description: "دفتر اليومية والقيود، دليل الحسابات، والفترات المحاسبية وإقفالها", group: "finance" },
  { key: "banking", label: "البنوك والنقدية", href: "/finance/banking", icon: "lucide:landmark", module: "banking", description: "الحسابات البنكية، استيراد الكشوف ومطابقتها، والتحويل بين الحسابات", group: "finance" },
  { key: "finance-reports", label: "التقارير المالية", href: "/finance/reports", icon: "lucide:chart-column", module: "finance_reports", description: "ميزان المراجعة، قائمة الدخل، الميزانية، التدفقات، التقادم، والضريبة", group: "finance" },
  { key: "fee-setup", label: "إعداد الرسوم", href: "/finance/setup", icon: "lucide:sliders-horizontal", module: "invoices", action: "update", description: "بنود الرسوم وجداولها، خطط الأقساط، الخصومات والمنح، ورموز الضريبة", group: "finance" },
  { key: "budget", label: "الموازنة", href: "/finance/budget", icon: "lucide:target", module: "expenses", description: "الموازنة السنوية بالحساب ومركز التكلفة والشهر، واعتمادها، والفعلي مقابل الموازنة", group: "finance" },
  { key: "assets", label: "الأصول الثابتة", href: "/finance/assets", icon: "lucide:building-2", module: "assets", description: "سجل الأصول والإهلاك الشهري بقيد آلي، والنقل والاستبعاد", group: "finance" },
  { key: "maintenance", label: "الصيانة والمرافق", href: "/maintenance", icon: "lucide:wrench", module: "maintenance", description: "بلاغات الصيانة بلوحة كانبان، والصيانة الدورية، وحجز القاعات والملاعب", group: "operations" },
  { key: "bookings", label: "حجز المرافق", href: "/maintenance/bookings", icon: "lucide:calendar-range", module: "maintenance", scopes: ["OWN"], description: "حجز القاعات والمختبرات والملاعب دون تعارض", group: "operations" },
  { key: "inventory", label: "المخزون والمشتريات", href: "/inventory", icon: "lucide:package", module: "inventory", description: "الأصناف والمستودعات، وطلبات وأوامر الشراء، والاستلام وفواتير الموردين، والجرد", group: "operations" },
  { key: "store", label: "متجر الزي والكتب", href: "/inventory/pos", icon: "lucide:shopping-bag", module: "inventory", action: "create", description: "نقطة بيع الزي والكتب نقداً أو على حساب الطالب", group: "operations" },
  { key: "transport", label: "المواصلات", href: "/transport", icon: "lucide:bus", module: "transport", scopes: ["ALL", "BRANCH", "STAGE"], description: "الحافلات والخطوط والمحطات، وتسكين الطلاب وفواتير النقل، والرحلات اليومية", group: "operations" },
  { key: "my-transport", label: "حافلة أبنائي", href: "/transport/my", icon: "lucide:bus", module: "transport", scopes: ["ASSIGNED", "OWN"], description: "خط الحافلة والمحطة والمواعيد وحالة رحلة اليوم", group: "operations" },
  { key: "library", label: "المكتبة", href: "/library", icon: "lucide:library", module: "library", scopes: ["ALL", "BRANCH", "STAGE"], description: "الفهرس والإعارة والإرجاع بالمسح، والغرامات والحجوزات والجرد", group: "operations" },
  { key: "my-library", label: "مكتبة أبنائي", href: "/library/my", icon: "lucide:book-marked", module: "library", scopes: ["ASSIGNED", "OWN"], description: "الكتب المعارة ومواعيد إرجاعها والحجوزات والغرامات", group: "operations" },
  { key: "canteen", label: "المقصف", href: "/canteen", icon: "lucide:coffee", module: "canteen", action: "create", description: "نقطة بيع المقصف ومحافظ الطلاب المدفوعة مسبقاً", group: "operations" },
  { key: "my-wallet", label: "محفظة المقصف", href: "/canteen/wallet", icon: "lucide:wallet-cards", module: "canteen", scopes: ["ASSIGNED", "OWN"], description: "رصيد أبنائك وحدود الصرف والحركات", group: "operations" },
  { key: "safety", label: "الأمن والسلامة", href: "/safety", icon: "lucide:shield-check", module: "safety", scopes: ["ALL", "BRANCH", "STAGE"], description: "الزوار، واستلام الطلاب، والحوادث، وتمارين الإخلاء", group: "operations" },
  { key: "my-pickups", label: "المفوضون بالاستلام", href: "/safety/my-pickups", icon: "lucide:user-check", module: "safety", scopes: ["ASSIGNED"], description: "من يحق له استلام أبنائك من المدرسة", group: "operations" },
  { key: "clinic", label: "العيادة المدرسية", href: "/clinic", icon: "lucide:stethoscope", module: "clinic", description: "زيارات العيادة والأدوية وإشعار أولياء الأمور", group: "operations" },
  { key: "dashboards", label: "لوحات التحكم", href: "/dashboards", icon: "lucide:layout-dashboard", module: "dashboards", description: "مؤشرات مدير المدرسة والمالية والأكاديمية والموارد البشرية والعمليات مقارنةً بالفترة السابقة", group: "analytics" },
  { key: "reports", label: "منشئ التقارير", href: "/reports", icon: "lucide:table-2", module: "custom_reports", description: "تقارير مخصصة بالسحب: الأعمدة والتصفية والتجميع والرسم، مع الحفظ والمشاركة والإرسال المجدول", group: "analytics" },
  { key: "analytics", label: "تحليل البيانات", href: "/analytics", icon: "lucide:chart-line", module: "analytics", description: "الاتجاهات والمقارنة بين الأعوام وتوقعات التحصيل والتسجيل", group: "analytics" },
  { key: "workflows", label: "سير العمل والموافقات", href: "/workflows", icon: "lucide:workflow", module: "workflows", description: "محرر مسارات الموافقة بالمهل والتصعيد، ومراقبة الطلبات المتأخرة، وقواعد الأتمتة على بيانات النظام", group: "governance" },
  { key: "documents", label: "المستندات والتوقيع", href: "/documents", icon: "lucide:signature", module: "e_documents", description: "عقود وإقرارات ونماذج تُرسل للتوقيع الإلكتروني بالرسم أو بالاسم، مع بصمة للمحتوى وأرشيف وبحث نصي ورابط تحقق عام", group: "governance" },
  { key: "compliance", label: "الخصوصية والامتثال", href: "/compliance", icon: "lucide:shield-half", module: "compliance", scopes: ["ALL"], description: "سياسة الخصوصية وإصداراتها، وموافقات أولياء الأمور، وفترات الاحتفاظ بالبيانات، وطلبات أصحاب البيانات", group: "governance" },
];

export const MODULE_GROUP_LABELS = { analytics: "التقارير والتحليلات", students: "شؤون الطلاب", academic: "الشؤون الأكاديمية", assessment: "التقييم والدرجات", hr: "الموارد البشرية", finance: "المالية والمحاسبة", operations: "العمليات والخدمات", governance: "الأتمتة والامتثال" } as const;
export const MODULE_GROUP_ICONS = { analytics: "lucide:chart-column", students: "lucide:users", academic: "lucide:graduation-cap", assessment: "lucide:award", hr: "lucide:id-card", finance: "lucide:wallet", operations: "lucide:building", governance: "lucide:shield-check" } as const;
