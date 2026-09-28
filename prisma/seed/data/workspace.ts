/**
 * محتوى مساحات العمل التجريبي: صفحات وقواعد بيانات واقعية لسياق مدرسة سعودية.
 * التواريخ نسبية إلى يوم تشغيل البذور حتى تبقى العروض حيّة.
 */
import type { DatabaseTemplateSeed, PropertySeed } from "../../../src/lib/database/defaults";
import { defaultStatusConfig } from "../../../src/lib/database/defaults";
import type { PropertyConfig, StatusGroup } from "../../../src/lib/database/types";
import { bold, bullets, callout, divider, doc, h2, h3, numbered, p, quote, todos, type DocNode } from "../doc";

export interface RowSeed {
  title: string;
  icon?: string;
  cover?: string;
  /** القيم بمفاتيح الخصائص؛ الأشخاص بمفاتيح الأشخاص (people keys)، التواريخ بإزاحة الأيام */
  values: Record<string, unknown>;
  content?: DocNode;
}

export interface DatabaseSeed {
  key: string;
  title: string;
  icon: string;
  description: string;
  template: DatabaseTemplateSeed;
  rows: RowSeed[];
  templates?: Array<{ name: string; title: string; values: Record<string, unknown>; content?: DocNode; isDefault?: boolean }>;
}

export interface PageSeed {
  key: string;
  title: string;
  icon: string;
  cover?: string;
  content: DocNode;
  children?: PageSeed[];
}

export interface TeamspaceContent {
  teamspace: string;
  pages: PageSeed[];
  databases: DatabaseSeed[];
}

// ---------------------------------------------------------------------
// أدوات القيم
// ---------------------------------------------------------------------

/** تاريخ نسبي: { __date: offset } يُحوَّل عند الإنشاء */
export const rel = (offsetDays: number, endOffset?: number) => ({ __date: offsetDays, __end: endOffset });
/** أشخاص بمفاتيحهم */
export const people = (...keys: string[]) => ({ __people: keys });
/** مبلغ بالريال (يُحوَّل إلى هللات) */
export const sar = (riyals: number) => ({ __money: riyals });
/** علاقة بعناوين سجلات في قاعدة بيانات أخرى */
export const relation = (dbKey: string, ...titles: string[]) => ({ __relation: dbKey, titles });

function statusWith(options: Array<[string, string, string]>, groups: Record<StatusGroup["key"], string[]>): PropertyConfig {
  return {
    options: options.map(([id, name, color]) => ({ id, name, color: color as never })),
    groups: [
      { key: "todo", name: "للتنفيذ", optionIds: groups.todo },
      { key: "in_progress", name: "قيد العمل", optionIds: groups.in_progress },
      { key: "complete", name: "مكتمل", optionIds: groups.complete },
    ],
  };
}

const select = (...options: Array<[string, string, string]>): PropertyConfig => ({
  options: options.map(([id, name, color]) => ({ id, name, color: color as never })),
});

// ---------------------------------------------------------------------
// إدارة المدرسة
// ---------------------------------------------------------------------

const TASK_PROPS: PropertySeed[] = [
  { key: "status", name: "الحالة", type: "STATUS", config: defaultStatusConfig() },
  { key: "owner", name: "المسؤول", type: "PERSON", config: { multiple: true } },
  {
    key: "priority",
    name: "الأولوية",
    type: "SELECT",
    config: select(["high", "عالية", "red"], ["medium", "متوسطة", "orange"], ["low", "منخفضة", "gray"]),
  },
  {
    key: "area",
    name: "المجال",
    type: "SELECT",
    config: select(
      ["academic", "أكاديمي", "navy"],
      ["students", "شؤون الطلاب", "teal"],
      ["finance", "مالي", "gold"],
      ["hr", "موارد بشرية", "slate"],
      ["ops", "تشغيلي", "brown"],
      ["tech", "تقني", "purple"],
    ),
  },
  { key: "start", name: "البداية", type: "DATE" },
  { key: "end", name: "الاستحقاق", type: "DATE" },
  { key: "progress", name: "الإنجاز", type: "NUMBER", config: { numberFormat: "percent" } },
  { key: "budget", name: "الميزانية", type: "MONEY", config: { currency: "SAR" } },
  {
    key: "remaining",
    name: "الأيام المتبقية",
    type: "FORMULA",
    config: { expression: 'if(empty(prop("الاستحقاق")), "", dateBetween(prop("الاستحقاق"), today(), "days"))' },
  },
];

const task = (
  title: string,
  status: string,
  owner: string[],
  priority: string,
  area: string,
  start: number,
  end: number,
  progress: number,
  budget?: number,
  content?: DocNode,
): RowSeed => ({
  title,
  values: {
    status,
    owner: people(...owner),
    priority,
    area,
    start: rel(start),
    end: rel(end),
    progress,
    ...(budget ? { budget: sar(budget) } : {}),
  },
  content,
});

const operationalPlan: DatabaseSeed = {
  key: "tasks",
  title: "الخطة التشغيلية",
  icon: "lucide:kanban",
  description: "مهام ومبادرات الخطة التشغيلية للعام الدراسي، موزعة على الفرق والمسؤولين.",
  template: {
    properties: TASK_PROPS,
    views: [
      {
        name: "مهام المدرسة",
        type: "BOARD",
        config: { groupBy: "status", hiddenProperties: ["area", "start", "progress", "budget", "remaining"] },
      },
      {
        name: "مهامي",
        type: "TABLE",
        config: { filter: { conjunction: "and", rules: [{ id: "f1", propertyId: "owner", operator: "is_me" }] }, sorts: [{ propertyId: "end", direction: "asc" }] },
      },
      {
        name: "هذا الشهر",
        type: "TABLE",
        config: {
          filter: { conjunction: "and", rules: [{ id: "f2", propertyId: "end", operator: "this_month" }] },
          sorts: [{ propertyId: "end", direction: "asc" }],
          calculations: { budget: "sum", progress: "average" },
        },
      },
      { name: "الخط الزمني", type: "TIMELINE", config: { dateProperty: "start", endDateProperty: "end", timelineScale: "week" } },
      { name: "التقويم", type: "CALENDAR", config: { dateProperty: "end" } },
    ],
  },
  rows: [
    task("إعداد برنامج الأسبوع التمهيدي للطلاب المستجدين", "done", ["vpStudents"], "high", "students", -40, -30, 100, 12000),
    task("تحديث دليل سياسات الحضور والانصراف", "in_review", ["vpStudents", "counselor"], "medium", "students", -12, 3, 80),
    task("مراجعة توزيع الجداول الدراسية للفصل الأول", "done", ["vpAcademic"], "high", "academic", -35, -25, 100),
    task("تجهيز معامل العلوم بأدوات السلامة", "in_progress", ["facilities", "t02"], "high", "ops", -10, 6, 55, 38500, doc(
      h2("نطاق العمل"),
      bullets("استبدال نظارات الوقاية وقفازات المختبر", "تركيب لوحات إرشادية ثنائية اللغة", "فحص طفايات الحريق وصلاحيتها"),
      callout("lucide:triangle-alert", "warning", "يجب الانتهاء قبل بدء التجارب العملية للصف الأول الثانوي."),
    )),
    task("إطلاق حملة التسجيل المبكر للعام القادم", "not_started", ["admissions"], "medium", "students", 10, 45, 0, 25000),
    task("اعتماد مسار تدريب المعلمين الجدد", "in_progress", ["vpAcademic", "hrManager"], "high", "hr", -7, 14, 40),
    task("تنفيذ تجربة الإخلاء الدوري الأولى", "not_started", ["s03", "facilities"], "high", "ops", 4, 9, 0),
    task("مراجعة عقود النقل المدرسي", "blocked", ["transport", "accountant"], "high", "finance", -20, -3, 60),
    task("رفع نسبة تحصيل الرسوم للربع الأول", "in_progress", ["accountant", "cashier"], "high", "finance", -25, 20, 45),
    task("تحديث بيانات التواصل لأولياء الأمور", "in_progress", ["admissions", "reception"], "medium", "students", -5, 10, 35),
    task("إعداد تقرير مؤشرات الأداء الشهري", "not_started", ["principal"], "medium", "academic", 1, 5, 0),
    task("تنظيم ملتقى أولياء الأمور الأول", "in_review", ["principal", "vpStudents"], "medium", "students", -14, 2, 90, 8000),
    task("صيانة أجهزة العرض في الفصول", "blocked", ["s02"], "medium", "tech", -18, -2, 30, 14200),
    task("ترشيح الطلاب لمسابقة الأولمبياد العلمي", "not_started", ["t04", "t14"], "low", "academic", 7, 21, 0),
    task("تجهيز مكتبات الفصول للمرحلة الابتدائية", "done", ["librarian"], "low", "academic", -30, -12, 100, 6500),
    task("مراجعة مشروع الموازنة التشغيلية", "in_review", ["accountant", "principal"], "high", "finance", -9, 5, 70),
    task("إعداد برنامج الإرشاد المهني للمرحلة الثانوية", "not_started", ["counselor"], "low", "students", 12, 40, 0),
    task("استكمال ملفات الموظفين الجدد", "in_progress", ["hrOfficer"], "medium", "hr", -15, 4, 65),
    task("ترقية شبكة الإنترنت في المبنى الإداري", "not_started", ["s02", "procurement"], "medium", "tech", 6, 30, 0, 42000),
    task("إعداد خطة الأنشطة اللاصفية للفصل الأول", "done", ["vpAcademic", "t07"], "medium", "academic", -28, -14, 100),
    task("متابعة الطلاب المتعثرين دراسياً", "in_progress", ["teacher", "counselor"], "high", "academic", -6, 24, 25, undefined, doc(
      h2("آلية المتابعة"),
      numbered("حصر الطلاب الحاصلين على أقل من ٦٠٪ في التقويم الأول", "إعداد خطة علاجية فردية لكل طالب", "إشعار ولي الأمر ومتابعة أسبوعية"),
      todos(["حصر الطلاب — الصف الثاني المتوسط", true], ["حصر الطلاب — الصف الثالث المتوسط", false], ["اجتماع مع المرشدة الطلابية", false]),
    )),
    task("اعتماد قائمة المقصف الصحية", "in_review", ["procurement", "s04"], "low", "ops", -8, 1, 85),
    task("إعداد جدول المراقبة لاختبارات منتصف الفصل", "not_started", ["vpAcademic", "teacher"], "high", "academic", 2, 11, 0),
    task("توثيق إجراءات الطوارئ في العيادة المدرسية", "in_progress", ["s04"], "medium", "ops", -4, 8, 50),
  ],
  templates: [
    {
      name: "مبادرة جديدة",
      title: "",
      isDefault: true,
      values: { status: "not_started", priority: "medium" },
      content: doc(h2("الهدف"), p(""), h2("مؤشرات النجاح"), bullets(""), h2("الخطوات"), todos(["", false])),
    },
    { name: "مهمة عاجلة", title: "", values: { status: "in_progress", priority: "high" } },
  ],
};

const decisions: DatabaseSeed = {
  key: "decisions",
  title: "القرارات",
  icon: "lucide:gavel",
  description: "سجل قرارات مجلس الإدارة واللجان مع متابعة مهامها التنفيذية.",
  template: {
    properties: [
      { key: "number", name: "رقم القرار", type: "TEXT" },
      { key: "date", name: "تاريخ القرار", type: "DATE" },
      {
        key: "state",
        name: "حالة القرار",
        type: "SELECT",
        config: select(["proposed", "مقترح", "slate"], ["approved", "معتمد", "green"], ["executing", "قيد التنفيذ", "orange"], ["postponed", "مؤجل", "gray"]),
      },
      { key: "body", name: "الجهة", type: "SELECT", config: select(["board", "مجلس الإدارة", "navy"], ["excellence", "لجنة التميز", "teal"], ["finance", "اللجنة المالية", "gold"]) },
      { key: "owner", name: "مسؤول المتابعة", type: "PERSON" },
      { key: "tasks", name: "المهام التنفيذية", type: "RELATION", config: { targetDatabaseId: "@tasks", multiple: true } },
      { key: "taskCount", name: "عدد المهام", type: "ROLLUP", config: { relationPropertyId: "@prop:tasks", targetPropertyId: "title", rollupFn: "count" } },
      { key: "avgProgress", name: "متوسط الإنجاز", type: "ROLLUP", config: { relationPropertyId: "@prop:tasks", targetPropertyId: "@tasks:progress", rollupFn: "average" } },
    ],
    views: [
      { name: "كل القرارات", type: "TABLE", config: { sorts: [{ propertyId: "date", direction: "desc" }] } },
      { name: "حسب الحالة", type: "BOARD", config: { groupBy: "state" } },
    ],
  },
  rows: [
    {
      title: "اعتماد الخطة التشغيلية للعام الدراسي",
      values: { number: "ق/٠١/١٤٤٨", date: rel(-45), state: "executing", body: "board", owner: people("principal"), tasks: relation("tasks", "اعتماد مسار تدريب المعلمين الجدد", "إعداد تقرير مؤشرات الأداء الشهري", "مراجعة مشروع الموازنة التشغيلية") },
    },
    {
      title: "تحديث سياسة الحضور والانضباط",
      values: { number: "ق/٠٢/١٤٤٨", date: rel(-30), state: "approved", body: "excellence", owner: people("vpStudents"), tasks: relation("tasks", "تحديث دليل سياسات الحضور والانصراف", "تحديث بيانات التواصل لأولياء الأمور") },
    },
    {
      title: "رفع جاهزية معامل العلوم",
      values: { number: "ق/٠٣/١٤٤٨", date: rel(-21), state: "executing", body: "board", owner: people("facilities"), tasks: relation("tasks", "تجهيز معامل العلوم بأدوات السلامة", "تنفيذ تجربة الإخلاء الدوري الأولى") },
    },
    {
      title: "خطة تحسين التحصيل المالي",
      values: { number: "ق/٠٤/١٤٤٨", date: rel(-16), state: "executing", body: "finance", owner: people("accountant"), tasks: relation("tasks", "رفع نسبة تحصيل الرسوم للربع الأول", "مراجعة عقود النقل المدرسي") },
    },
    {
      title: "إطلاق برنامج التسجيل المبكر بخصم ٥٪",
      values: { number: "ق/٠٥/١٤٤٨", date: rel(-3), state: "proposed", body: "finance", owner: people("admissions"), tasks: relation("tasks", "إطلاق حملة التسجيل المبكر للعام القادم") },
    },
    { title: "تأجيل مشروع الملعب المغطى للعام القادم", values: { number: "ق/٠٦/١٤٤٨", date: rel(-10), state: "postponed", body: "board", owner: people("owner") } },
  ],
};

const meetings: DatabaseSeed = {
  key: "meetings",
  title: "الاجتماعات",
  icon: "lucide:users-round",
  description: "جدول الاجتماعات ومحاضرها وقراراتها.",
  template: {
    properties: [
      { key: "date", name: "الموعد", type: "DATE", config: { includeTime: true } },
      {
        key: "type",
        name: "النوع",
        type: "SELECT",
        config: select(["board", "مجلس الإدارة", "navy"], ["parents", "مجلس الآباء", "teal"], ["teachers", "اجتماع المعلمين", "slate"], ["committee", "لجنة", "gold"]),
      },
      { key: "attendees", name: "الحضور", type: "PERSON" },
      { key: "location", name: "المكان", type: "TEXT" },
      { key: "minutes", name: "المحضر معتمد", type: "CHECKBOX" },
    ],
    views: [
      { name: "التقويم", type: "CALENDAR", config: { dateProperty: "date" } },
      { name: "كل الاجتماعات", type: "TABLE", config: { sorts: [{ propertyId: "date", direction: "desc" }] } },
      { name: "قائمة", type: "LIST" },
    ],
  },
  rows: [
    {
      title: "اجتماع مجلس الآباء — الفصل الأول",
      values: { date: rel(1), type: "parents", attendees: people("principal", "vpStudents", "parent", "parent2"), location: "قاعة المسرح — فرع البنين", minutes: false },
      content: doc(h2("جدول الأعمال"), numbered("كلمة مديرة المدارس", "عرض نتائج التقويم الأول", "آلية التواصل عبر بوابة أولياء الأمور", "مقترحات أولياء الأمور"), h2("ملاحظات"), p("")),
    },
    {
      title: "اجتماع المعلمين الأسبوعي",
      values: { date: rel(3), type: "teachers", attendees: people("vpAcademic", "teacher", "t01", "t02", "t12", "t13"), location: "غرفة المعلمين", minutes: false },
      content: doc(h2("المحاور"), bullets("متابعة خطط العلاج", "توزيع المراقبة", "مستجدات المناهج")),
    },
    {
      title: "اجتماع مجلس الإدارة الشهري",
      values: { date: rel(-6), type: "board", attendees: people("owner", "principal", "accountant", "hrManager"), location: "مكتب المدير التنفيذي", minutes: true },
      content: doc(h2("القرارات"), bullets("اعتماد خطة تحسين التحصيل المالي", "متابعة جاهزية معامل العلوم"), quote("يُرفع التقرير المالي الربعي في الاجتماع القادم.")),
    },
    {
      title: "لجنة التميز المدرسي",
      values: { date: rel(-13), type: "committee", attendees: people("principal", "vpAcademic", "vpStudents", "counselor"), location: "قاعة الاجتماعات", minutes: true },
    },
    {
      title: "اجتماع تنسيق اختبارات منتصف الفصل",
      values: { date: rel(8), type: "teachers", attendees: people("vpAcademic", "teacher", "t04", "t14"), location: "قاعة الاجتماعات", minutes: false },
    },
  ],
};

const managementPages: PageSeed[] = [
  {
    key: "dashboard",
    title: "لوحة القيادة",
    icon: "lucide:layout-dashboard",
    cover: "color:navy",
    content: doc(
      callout("lucide:info", "info", "مرحباً بكم في مساحة إدارة المدرسة. هنا تتابع الإدارة العليا الخطة التشغيلية والقرارات والاجتماعات."),
      h2("أولويات هذا الشهر"),
      todos(["اعتماد مشروع الموازنة التشغيلية", false], ["عقد ملتقى أولياء الأمور الأول", false], ["رفع جاهزية معامل العلوم", false], ["إغلاق ملفات التعيين الجديدة", true]),
      h2("روابط سريعة"),
      bullets(["الخطة التشغيلية — متابعة المهام حسب الحالة"], ["القرارات — سجل القرارات ومتابعة تنفيذها"], ["الاجتماعات — التقويم والمحاضر"]),
      divider(),
      p(bold("ملاحظة: "), "مؤشرات الطلاب والتحصيل المالي ستظهر هنا تلقائياً بعد تفعيل وحدات الطلاب (المرحلة ٢) والمحاسبة (المرحلة ٣)."),
    ),
  },
  {
    key: "strategy",
    title: "الخطة الاستراتيجية ١٤٤٨–١٤٥٠",
    icon: "lucide:target",
    content: doc(
      h2("الرؤية"),
      quote("بيئة تعليمية محفزة تُخرّج جيلاً متعلماً مبدعاً معتزاً بقيمه ووطنه."),
      h2("الأهداف الاستراتيجية"),
      numbered(
        "رفع متوسط التحصيل الدراسي بنسبة ١٠٪ خلال عامين",
        "تحقيق رضا أولياء الأمور بنسبة لا تقل عن ٩٠٪",
        "التحول الرقمي الكامل للعمليات الإدارية والمالية",
        "تطوير الكفاءات المهنية لجميع المعلمين عبر مسارات تدريب معتمدة",
      ),
      h3("مؤشرات الأداء الرئيسية"),
      bullets("نسبة الحضور اليومي", "نسبة التحصيل المالي مقابل المستهدف", "متوسط زمن الاستجابة لطلبات أولياء الأمور", "ساعات التطوير المهني لكل معلم"),
    ),
  },
];

// ---------------------------------------------------------------------
// بقية المساحات
// ---------------------------------------------------------------------

const supervision: DatabaseSeed = {
  key: "supervision",
  title: "زيارات الإشراف التربوي",
  icon: "lucide:clipboard-check",
  description: "جدول الزيارات الصفية ونتائجها للتطوير المهني للمعلمين.",
  template: {
    properties: [
      { key: "teacher", name: "المعلم", type: "PERSON", config: { multiple: false } },
      { key: "date", name: "موعد الزيارة", type: "DATE" },
      { key: "subject", name: "المادة", type: "SELECT", config: select(["math", "رياضيات", "navy"], ["arabic", "لغة عربية", "teal"], ["science", "علوم", "green"], ["english", "لغة إنجليزية", "slate"], ["cs", "حاسب آلي", "purple"]) },
      { key: "rating", name: "التقييم", type: "SELECT", config: select(["excellent", "متميز", "green"], ["vgood", "جيد جداً", "teal"], ["good", "جيد", "gold"], ["needs", "يحتاج دعماً", "red"]) },
      { key: "done", name: "تمت الزيارة", type: "CHECKBOX" },
      { key: "notes", name: "ملاحظات", type: "TEXT" },
    ],
    views: [
      { name: "التقويم", type: "CALENDAR", config: { dateProperty: "date" } },
      { name: "كل الزيارات", type: "TABLE", config: { sorts: [{ propertyId: "date", direction: "asc" }] } },
      { name: "حسب التقييم", type: "BOARD", config: { groupBy: "rating" } },
    ],
  },
  rows: [
    { title: "زيارة صفية — الثاني المتوسط (أ)", values: { teacher: people("teacher"), date: rel(-8), subject: "math", rating: "excellent", done: true, notes: "توظيف متميز لاستراتيجيات التعلم النشط" } },
    { title: "زيارة صفية — الأول الثانوي (ب)", values: { teacher: people("t04"), date: rel(-5), subject: "science", rating: "vgood", done: true, notes: "يُقترح زيادة الأنشطة العملية" } },
    { title: "زيارة صفية — الرابع الابتدائي (أ)", values: { teacher: people("t01"), date: rel(-2), subject: "arabic", rating: "good", done: true } },
    { title: "زيارة صفية — الثالث المتوسط (ب)", values: { teacher: people("t13"), date: rel(2), subject: "math", done: false } },
    { title: "زيارة صفية — الثاني الثانوي (أ)", values: { teacher: people("t19"), date: rel(5), subject: "cs", done: false } },
    { title: "زيارة صفية — الخامس الابتدائي (ب)", values: { teacher: people("t15"), date: rel(9), subject: "english", done: false } },
  ],
};

const initiatives: DatabaseSeed = {
  key: "initiatives",
  title: "مبادرات شؤون الطلاب",
  icon: "lucide:sparkles",
  description: "برامج ومبادرات تعزيز السلوك والانتماء والصحة الطلابية.",
  template: {
    properties: [
      { key: "status", name: "الحالة", type: "STATUS", config: defaultStatusConfig() },
      { key: "owner", name: "المسؤول", type: "PERSON" },
      { key: "audience", name: "الفئة المستهدفة", type: "MULTI_SELECT", config: select(["pri", "الابتدائية", "teal"], ["int", "المتوسطة", "navy"], ["sec", "الثانوية", "slate"], ["parents", "أولياء الأمور", "gold"]) },
      { key: "date", name: "موعد الإطلاق", type: "DATE" },
    ],
    views: [
      { name: "المعرض", type: "GALLERY", config: { cardPreview: "cover" } },
      { name: "جدول", type: "TABLE" },
    ],
  },
  rows: [
    { title: "برنامج «سفراء الانضباط»", cover: "color:teal", values: { status: "in_progress", owner: people("vpStudents"), audience: ["int", "sec"], date: rel(-10) } },
    { title: "أسبوع الصحة المدرسية", cover: "color:green", values: { status: "not_started", owner: people("s04", "counselor"), audience: ["pri", "int", "sec"], date: rel(15) } },
    { title: "نادي القراءة الأسبوعي", cover: "color:gold", values: { status: "done", owner: people("librarian"), audience: ["pri"], date: rel(-25) } },
    { title: "لقاءات «شركاء النجاح» مع أولياء الأمور", cover: "color:navy", values: { status: "in_review", owner: people("principal"), audience: ["parents"], date: rel(1) } },
    { title: "مبادرة «يومي بلا شاشات»", cover: "color:slate", values: { status: "not_started", owner: people("counselor"), audience: ["pri", "parents"], date: rel(22) } },
  ],
};

const recruitment: DatabaseSeed = {
  key: "recruitment",
  title: "التوظيف",
  icon: "lucide:briefcase",
  description: "مسار التوظيف: من الوظائف الشاغرة إلى التعيين.",
  template: {
    properties: [
      {
        key: "stage",
        name: "المرحلة",
        type: "STATUS",
        config: statusWith(
          [["open", "وظيفة شاغرة", "navy"], ["applications", "استلام الطلبات", "slate"], ["interviews", "مقابلات", "orange"], ["offer", "عرض وظيفي", "gold"], ["hired", "تم التعيين", "green"]],
          { todo: ["open"], in_progress: ["applications", "interviews", "offer"], complete: ["hired"] },
        ),
      },
      { key: "dept", name: "القسم", type: "SELECT", config: select(["teaching", "هيئة التدريس", "navy"], ["admin", "إداري", "slate"], ["services", "خدمات", "brown"]) },
      { key: "applicants", name: "عدد المتقدمين", type: "NUMBER", config: { numberFormat: "integer" } },
      { key: "recruiter", name: "مسؤول التوظيف", type: "PERSON" },
      { key: "posted", name: "تاريخ الإعلان", type: "DATE" },
      { key: "salary", name: "نطاق الراتب", type: "TEXT" },
    ],
    views: [
      { name: "مسار التوظيف", type: "BOARD", config: { groupBy: "stage" } },
      { name: "كل الوظائف", type: "TABLE" },
    ],
  },
  rows: [
    { title: "معلم/ة رياضيات — المرحلة الثانوية", values: { stage: "interviews", dept: "teaching", applicants: 34, recruiter: people("hrOfficer"), posted: rel(-20), salary: "حسب سلم المدرسة" } },
    { title: "معلم/ة لغة إنجليزية — الابتدائية", values: { stage: "applications", dept: "teaching", applicants: 21, recruiter: people("hrOfficer"), posted: rel(-9) } },
    { title: "أخصائي/ة تقنية معلومات", values: { stage: "offer", dept: "admin", applicants: 12, recruiter: people("hrManager"), posted: rel(-30) } },
    { title: "مشرف/ة نقل مدرسي", values: { stage: "open", dept: "services", applicants: 0, recruiter: people("hrOfficer"), posted: rel(2) } },
    { title: "محاسب/ة", values: { stage: "hired", dept: "admin", applicants: 18, recruiter: people("hrManager"), posted: rel(-60) } },
    { title: "معلم/ة كيمياء", values: { stage: "interviews", dept: "teaching", applicants: 16, recruiter: people("hrOfficer"), posted: rel(-15) } },
  ],
};

const closing: DatabaseSeed = {
  key: "closing",
  title: "قائمة الإقفال الشهري",
  icon: "lucide:list-checks",
  description: "بنود التحقق قبل الإقفال المحاسبي الشهري (تُربط بالنظام المحاسبي في المرحلة ٣).",
  template: {
    properties: [
      { key: "done", name: "منجز", type: "CHECKBOX" },
      { key: "owner", name: "المسؤول", type: "PERSON" },
      { key: "due", name: "الموعد", type: "DATE" },
      { key: "month", name: "الشهر", type: "SELECT", config: select(["current", "الشهر الحالي", "navy"], ["previous", "الشهر السابق", "gray"]) },
    ],
    views: [
      { name: "القائمة", type: "LIST" },
      { name: "جدول", type: "TABLE", config: { calculations: { done: "percent_checked" } } },
    ],
  },
  rows: [
    { title: "ترحيل جميع فواتير الشهر", values: { done: true, owner: people("accountant"), due: rel(-2), month: "current" } },
    { title: "مطابقة كشوف الحسابات البنكية", values: { done: false, owner: people("s05"), due: rel(1), month: "current" } },
    { title: "احتساب الإهلاك الشهري للأصول", values: { done: false, owner: people("accountant"), due: rel(2), month: "current" } },
    { title: "مراجعة الاستحقاقات والمصروفات المقدمة", values: { done: false, owner: people("s05"), due: rel(2), month: "current" } },
    { title: "مطابقة الصندوق اليومي", values: { done: true, owner: people("cashier"), due: rel(-1), month: "current" } },
    { title: "اعتماد مسير الرواتب", values: { done: false, owner: people("hrManager", "accountant"), due: rel(2), month: "current" } },
  ],
};

const maintenance: DatabaseSeed = {
  key: "maintenance",
  title: "طلبات الصيانة",
  icon: "lucide:hammer",
  description: "طلبات الصيانة للمرافق والأجهزة ومتابعة تنفيذها وتكلفتها.",
  template: {
    properties: [
      {
        key: "status",
        name: "الحالة",
        type: "STATUS",
        config: statusWith(
          [["new", "جديد", "navy"], ["doing", "قيد التنفيذ", "orange"], ["parts", "بانتظار قطع", "slate"], ["done", "مكتمل", "green"]],
          { todo: ["new"], in_progress: ["doing", "parts"], complete: ["done"] },
        ),
      },
      { key: "priority", name: "الأولوية", type: "SELECT", config: select(["urgent", "عاجلة", "red"], ["normal", "عادية", "orange"], ["low", "منخفضة", "gray"]) },
      { key: "location", name: "الموقع", type: "SELECT", config: select(["boysA", "فرع البنين — المبنى أ", "navy"], ["boysB", "فرع البنين — المبنى ب", "slate"], ["girls", "فرع البنات", "teal"], ["buses", "مواقف الحافلات", "brown"]) },
      { key: "tech", name: "الفني", type: "PERSON" },
      { key: "cost", name: "التكلفة", type: "MONEY", config: { currency: "SAR" } },
      { key: "requested", name: "تاريخ الطلب", type: "CREATED_TIME" },
    ],
    views: [
      { name: "لوحة الطلبات", type: "BOARD", config: { groupBy: "status", hiddenProperties: ["requested"] } },
      { name: "كل الطلبات", type: "TABLE", config: { calculations: { cost: "sum" } } },
    ],
  },
  rows: [
    { title: "تسرب مياه في دورات مياه الدور الثاني", values: { status: "doing", priority: "urgent", location: "boysA", tech: people("facilities"), cost: sar(1850) } },
    { title: "تعطل مكيف الفصل ٣/ب", values: { status: "parts", priority: "urgent", location: "girls", tech: people("facilities"), cost: sar(3200) } },
    { title: "استبدال إنارة الممر الرئيسي", values: { status: "new", priority: "normal", location: "boysB" } },
    { title: "صيانة بوابة مواقف الحافلات", values: { status: "done", priority: "normal", location: "buses", tech: people("s02"), cost: sar(950) } },
    { title: "إصلاح سبورة تفاعلية في معمل الحاسب", values: { status: "new", priority: "low", location: "girls", tech: people("s02") } },
  ],
};

const events: DatabaseSeed = {
  key: "events",
  title: "تقويم الفعاليات",
  icon: "lucide:calendar-heart",
  description: "الفعاليات والمناسبات المدرسية وجمهورها.",
  template: {
    properties: [
      { key: "date", name: "التاريخ", type: "DATE" },
      { key: "audience", name: "الجمهور", type: "MULTI_SELECT", config: select(["students", "الطلاب", "teal"], ["parents", "أولياء الأمور", "gold"], ["staff", "الموظفون", "slate"]) },
      { key: "owner", name: "المنظم", type: "PERSON" },
      { key: "published", name: "أُعلن", type: "CHECKBOX" },
    ],
    views: [
      { name: "التقويم", type: "CALENDAR", config: { dateProperty: "date" } },
      { name: "قائمة", type: "LIST", config: { sorts: [{ propertyId: "date", direction: "asc" }] } },
    ],
  },
  rows: [
    { title: "احتفال اليوم العالمي للمعلم", values: { date: rel(7), audience: ["students", "staff"], owner: people("vpStudents"), published: true } },
    { title: "معرض العلوم السنوي", values: { date: rel(24), audience: ["students", "parents"], owner: people("t02", "t14"), published: false } },
    { title: "لقاء أولياء أمور المرحلة الابتدائية", values: { date: rel(12), audience: ["parents"], owner: people("principal"), published: true } },
    { title: "يوم الرياضة المدرسي", values: { date: rel(33), audience: ["students"], owner: people("t07"), published: false } },
  ],
};

const support: DatabaseSeed = {
  key: "support",
  title: "طلبات الدعم الفني",
  icon: "lucide:life-buoy",
  description: "بلاغات المستخدمين الداخلية حول المنصة والأجهزة.",
  template: {
    properties: [
      { key: "status", name: "الحالة", type: "STATUS", config: defaultStatusConfig() },
      { key: "category", name: "الفئة", type: "SELECT", config: select(["access", "الدخول والصلاحيات", "navy"], ["device", "الأجهزة", "brown"], ["platform", "المنصة", "teal"]) },
      { key: "requester", name: "مقدم الطلب", type: "PERSON" },
      { key: "assignee", name: "المعالج", type: "PERSON" },
    ],
    views: [
      { name: "لوحة", type: "BOARD", config: { groupBy: "status" } },
      { name: "جدول", type: "TABLE" },
    ],
  },
  rows: [
    { title: "تعذر تسجيل الدخول برمز التحقق", values: { status: "done", category: "access", requester: people("t12"), assignee: people("s02") } },
    { title: "طلب صلاحية الاطلاع على مساحة التواصل", values: { status: "in_progress", category: "access", requester: people("t06"), assignee: people("owner") } },
    { title: "الطابعة في غرفة المعلمين لا تعمل", values: { status: "not_started", category: "device", requester: people("t13"), assignee: people("s02") } },
  ],
};

export const WORKSPACE: TeamspaceContent[] = [
  { teamspace: "management", pages: managementPages, databases: [operationalPlan, decisions, meetings] },
  {
    teamspace: "academic",
    pages: [
      {
        key: "teacherGuide",
        title: "دليل المعلم الجديد",
        icon: "lucide:book-open",
        content: doc(
          callout("lucide:hand-heart", "success", "أهلاً بك في أسرة المدرسة! هذا الدليل يساعدك في أسبوعك الأول."),
          h2("قبل بدء الدراسة"),
          todos(["استلام الجدول الدراسي من وكيلة الشؤون الأكاديمية", false], ["تفعيل حسابك في المنصة وتفعيل المصادقة الثنائية إن طُلب", false], ["الاطلاع على توزيع المنهج للفصل الأول", false]),
          h2("مهامك اليومية في المنصة"),
          bullets("تحضير الطلاب في أول ١٠ دقائق من الحصة", "رصد الدرجات ضمن الفترة المحددة", "الرد على رسائل أولياء الأمور خلال يوم عمل"),
          h3("قيم نعمل بها"),
          quote("المعلم قدوة قبل أن يكون ناقلاً للمعرفة."),
        ),
      },
    ],
    databases: [supervision],
  },
  {
    teamspace: "students",
    pages: [
      {
        key: "attendancePolicy",
        title: "سياسة الحضور والغياب",
        icon: "lucide:scroll-text",
        content: doc(
          h2("الهدف"),
          p("ضمان انتظام الطلاب وحماية وقت التعلم، والتواصل المبكر مع أولياء الأمور."),
          h2("الإجراءات"),
          numbered(
            "يُرصد الحضور في أول ١٠ دقائق من اليوم الدراسي",
            "يُرسل إشعار فوري لولي الأمر عند الغياب",
            "عند تجاوز ٣ أيام غياب بدون عذر يُحال الطالب للمرشد الطلابي",
            "عند تجاوز الحد المسموح يُطبق نظام الحرمان وفق اللائحة",
          ),
          callout("lucide:info", "info", "ستُطبَّق هذه السياسة آلياً في وحدة الحضور والغياب (المرحلة ٢)."),
        ),
      },
    ],
    databases: [initiatives],
  },
  {
    teamspace: "hr",
    pages: [
      {
        key: "employeeHandbook",
        title: "دليل الموظف",
        icon: "lucide:book-marked",
        content: doc(
          h2("ساعات العمل"),
          p("من الأحد إلى الخميس، من ٦:٣٠ صباحاً حتى ١:٣٠ ظهراً للهيئة التعليمية."),
          h2("الإجازات"),
          bullets("الإجازة الاعتيادية وفق العقد ونظام العمل", "الإجازة المرضية بتقرير طبي معتمد", "طلبات الإجازة تُقدَّم عبر المنصة وتُعتمد إلكترونياً"),
        ),
      },
    ],
    databases: [recruitment],
  },
  {
    teamspace: "finance",
    pages: [
      {
        key: "financePolicies",
        title: "السياسات المالية",
        icon: "lucide:scale",
        content: doc(
          h2("مبادئ عامة"),
          bullets("لا يُحذف أي قيد مرحّل؛ يُعكس بقيد عكسي فقط", "كل مصروف فوق الحد المعتمد يتطلب موافقة متعددة المراحل", "المبالغ تُسجَّل بأصغر وحدة (هللة) لضمان الدقة"),
          h2("الخصومات والمنح"),
          p("تخضع الخصومات الاستثنائية لموافقة المحاسب ثم مديرة المدارس، وتُسجل في سجل التدقيق."),
          callout("lucide:construction", "warning", "النظام المحاسبي الكامل (دليل الحسابات، الفواتير، القيود الآلية) يُبنى في المرحلة ٣."),
        ),
      },
    ],
    databases: [closing],
  },
  { teamspace: "operations", pages: [], databases: [maintenance] },
  {
    teamspace: "communication",
    pages: [
      {
        key: "commsPlan",
        title: "خطة التواصل مع أولياء الأمور",
        icon: "lucide:messages-square",
        content: doc(
          h2("القنوات"),
          bullets("بوابة وتطبيق أولياء الأمور", "الرسائل النصية للإشعارات العاجلة", "اللقاءات الدورية"),
          h2("مواعيد ثابتة"),
          todos(["نشرة أسبوعية كل خميس", true], ["تقرير شهري بمستوى الطالب", false]),
        ),
      },
    ],
    databases: [events],
  },
  {
    teamspace: "system",
    pages: [
      {
        key: "platformGuide",
        title: "دليل استخدام المنصة",
        icon: "lucide:compass",
        content: doc(
          h2("كل شيء صفحة"),
          p("كل عنصر في المنصة صفحة لها أيقونة وعنوان ومحتوى وتعليقات وسجل نشاط."),
          h2("اختصارات مفيدة"),
          bullets(["Ctrl/⌘ + K — لوحة الأوامر والبحث الشامل"], ["/ — قائمة الكتل داخل المحرر"], ["@ — الإشارة إلى زميل أو صفحة"], ["Ctrl/⌘ + O — محادثة جديدة"]),
          h2("قواعد البيانات"),
          p("كل قاعدة بيانات تدعم عروضاً متعددة: جدول، لوحة، تقويم، خط زمني، معرض، وقائمة — مع التصفية والفرز والتجميع والتصدير."),
          callout("lucide:shield-check", "info", "كل عملية إنشاء أو تعديل أو حذف تُسجَّل في سجل التدقيق ولا يمكن حذفها."),
        ),
      },
    ],
    databases: [support],
  },
];
