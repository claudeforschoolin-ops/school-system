/**
 * الجولات الإرشادية داخل التطبيق: خطوات تشير إلى عناصر تحمل السمة data-tour.
 * تبدأ تلقائياً أول مرة يزور فيها المستخدم الصفحة المعنية، ويمكن إعادتها من صفحة المساعدة.
 */
export interface TourStep {
  /** قيمة data-tour للعنصر المشار إليه؛ null = بطاقة في منتصف الشاشة */
  target: string | null;
  title: string;
  body: string;
}

export interface TourDef {
  key: string;
  title: string;
  description: string;
  /** الصفحة التي تبدأ منها الجولة عند إعادتها */
  path: string;
  /** وحدة الصلاحيات المطلوبة لعرض الجولة */
  module?: string;
  steps: TourStep[];
}

export const TOURS: readonly TourDef[] = [
  {
    key: "welcome",
    title: "جولة تعريفية بالمنصة",
    description: "أهم أجزاء الواجهة: الحساب، والوصول السريع، والبحث، والوحدات، والتبويبات، والمساعدة.",
    path: "/home",
    steps: [
      { target: null, title: "مرحباً بك في المنصة", body: "جولة قصيرة على أهم أجزاء الواجهة (أقل من دقيقة). يمكنك تخطيها الآن وإعادتها متى شئت من صفحة المساعدة." },
      { target: "workspace", title: "حسابك ومدرستك", body: "من هنا تصل إلى ملفك الشخصي وخصوصيتك والإعدادات، وتغيّر المظهر (فاتح/داكن)، وتسجّل الخروج." },
      { target: "quick-icons", title: "الوصول السريع", body: "الرئيسية والمحادثات والتقويم وصندوق الوارد. الرقم على الأيقونة يعني عناصر غير مقروءة تنتظرك." },
      { target: "search", title: "البحث ولوحة الأوامر", body: "ابحث عن أي طالب أو صفحة أو إجراء. الاختصار: Ctrl+K (أو ⌘K على ماك)." },
      { target: "modules", title: "وحدات النظام", body: "الوحدات مجمّعة حسب المجال، ولا يظهر لك إلا ما يسمح به دورك. اضغط على اسم المجموعة لطيّها." },
      { target: "tabs", title: "التبويبات", body: "كل صفحة تفتحها تظهر تبويباً هنا، فتتنقل بين عدة صفحات دون أن تفقد مكانك." },
      { target: "help", title: "المساعدة والدعم", body: "دليل الاستخدام وقاعدة المعرفة واختصارات لوحة المفاتيح، ومنه تفتح تذكرة دعم فني إن احتجت." },
    ],
  },
  {
    key: "report-builder",
    title: "منشئ التقارير",
    description: "بناء تقرير مخصص بالسحب والإفلات ثم حفظه وتصديره وجدولة إرساله.",
    path: "/reports/new",
    module: "custom_reports",
    steps: [
      { target: "report-fields", title: "١. اختر الحقول", body: "اختر مجموعة البيانات أولاً، ثم اسحب الحقول التي تريدها (أو اضغط +) لتصبح أعمدة في التقرير." },
      { target: "report-columns", title: "٢. رتّب الأعمدة", body: "اسحب الأعمدة لتغيير ترتيبها، واضغط × لحذف عمود." },
      { target: "report-filters", title: "٣. صفِّ النتائج", body: "أضف شروطاً مثل «الفرع = بنين» أو «التاريخ = هذا الشهر». التواريخ النسبية تتحدّث تلقائياً كل مرة." },
      { target: "report-actions", title: "٤. احفظ وصدّر", body: "احفظ التقرير لتعود إليه وتشاركه، وصدّره Excel أو CSV أو اطبعه PDF بترويسة المدرسة، وجدول إرساله بالبريد." },
    ],
  },
  {
    key: "dashboards",
    title: "لوحات التحكم",
    description: "قراءة المؤشرات ومقارنتها بالفترة السابقة والتنقل بين لوحات المدير والمالية والأكاديمية.",
    path: "/dashboards",
    module: "dashboards",
    steps: [
      { target: "dash-tabs", title: "اختر اللوحة", body: "لكل مجال لوحته: مدير المدرسة والمالية والأكاديمية والموارد البشرية والعمليات، ويمكن التصفية حسب الفرع." },
      { target: "kpis", title: "المؤشرات الرئيسية", body: "كل مؤشر يقارن الشهر الحالي حتى اليوم بالفترة نفسها من الشهر السابق. الأخضر تحسّن والأحمر تراجع، واضغط المؤشر لتفاصيله." },
    ],
  },
];

export const TOUR_MAP = new Map(TOURS.map((t) => [t.key, t]));

/** الجولة التي تبدأ تلقائياً في هذا المسار (إن وُجدت) */
export function tourForPath(path: string): TourDef | null {
  if (path === "/home") return TOUR_MAP.get("welcome")!;
  if (path === "/reports/new") return TOUR_MAP.get("report-builder")!;
  if (path === "/dashboards") return TOUR_MAP.get("dashboards")!;
  return null;
}
