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
  description: string;
  group: "students" | "academic";
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
];

export const MODULE_GROUP_LABELS = { students: "شؤون الطلاب", academic: "الشؤون الأكاديمية" } as const;
