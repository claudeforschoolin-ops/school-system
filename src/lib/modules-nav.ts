/**
 * روابط الوحدات المبنية في الشريط الجانبي ولوحة الأوامر (تظهر حسب الصلاحية).
 */
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
  group: "students" | "academic" | "finance";
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
  { key: "finance", label: "لوحة المالية", href: "/finance", icon: "lucide:wallet", module: "finance_reports", description: "التحصيل مقابل المستهدف، الذمم المتأخرة، النقد، وما ينتظر إجراءك", group: "finance", exact: true },
  { key: "collect", label: "التحصيل", href: "/finance/collect", icon: "lucide:banknote", module: "collections", action: "create", description: "سند قبض سريع بالبحث، ووردية الصندوق، وسجل السندات والشيكات", group: "finance" },
  { key: "invoices", label: "الفواتير", href: "/finance/invoices", icon: "lucide:receipt-text", module: "invoices", description: "فواتير الرسوم وأقساطها، والفوترة الجماعية، وكشوف حساب الأسر", group: "finance" },
  { key: "vouchers", label: "سندات الصرف", href: "/finance/vouchers", icon: "lucide:hand-coins", module: "expenses", description: "المصروفات والمدفوعات للموردين بموافقات حسب المبلغ", group: "finance" },
  { key: "accounting", label: "المحاسبة العامة", href: "/finance/accounting", icon: "lucide:book-open-check", module: "accounting", description: "دفتر اليومية والقيود، دليل الحسابات، والفترات المحاسبية وإقفالها", group: "finance" },
  { key: "banking", label: "البنوك والنقدية", href: "/finance/banking", icon: "lucide:landmark", module: "banking", description: "الحسابات البنكية، استيراد الكشوف ومطابقتها، والتحويل بين الحسابات", group: "finance" },
  { key: "finance-reports", label: "التقارير المالية", href: "/finance/reports", icon: "lucide:chart-column", module: "finance_reports", description: "ميزان المراجعة، قائمة الدخل، الميزانية، التدفقات، التقادم، والضريبة", group: "finance" },
  { key: "fee-setup", label: "إعداد الرسوم", href: "/finance/setup", icon: "lucide:sliders-horizontal", module: "invoices", action: "update", description: "بنود الرسوم وجداولها، خطط الأقساط، الخصومات والمنح، ورموز الضريبة", group: "finance" },
];

export const MODULE_GROUP_LABELS = { students: "شؤون الطلاب", academic: "الشؤون الأكاديمية", finance: "المالية والمحاسبة" } as const;
export const MODULE_GROUP_ICONS = { students: "lucide:users", academic: "lucide:graduation-cap", finance: "lucide:wallet" } as const;
