/**
 * المستخدمون التجريبيون (أسماء عربية واقعية، بيانات اتصال وهمية).
 * كلمة المرور الموحدة لكل الحسابات التجريبية موثقة في README.
 */
export const DEMO_PASSWORD = "Manassa@2026";
/** سر TOTP موحّد للحسابات التجريبية التي تتطلب المصادقة الثنائية (للعرض فقط) */
export const DEMO_TOTP_SECRET = "MANASSADEMOTWOFACTORSECRETKEYABC";

export type BranchKey = "BOYS" | "GIRLS" | null;

export interface PersonSeed {
  key: string;
  name: string;
  email: string;
  jobTitle: string;
  role: string;
  branch: BranchKey;
  stage?: "PRI" | "INT" | "SEC";
  color: string;
  /** حساب تجريبي رئيسي يظهر في README وشاشة الدخول */
  demo?: boolean;
  teamspaces?: Array<[string, "VIEW" | "COMMENT" | "EDIT" | "FULL"]>;
}

let phoneCounter = 0;
export function fakePhone(): string {
  phoneCounter += 1;
  return `+9665${String(phoneCounter % 10)}555${String(1000 + phoneCounter).slice(-4)}`;
}

export const PEOPLE: PersonSeed[] = [
  { key: "owner", name: "م. خالد بن عبدالله الراشد", email: "owner@demo.manassa.sa", jobTitle: "المدير التنفيذي للمجموعة", role: "OWNER", branch: null, color: "navy", demo: true },
  { key: "principal", name: "أ. سارة بنت محمد العتيبي", email: "principal@demo.manassa.sa", jobTitle: "مديرة المدارس", role: "PRINCIPAL", branch: null, color: "teal", demo: true, teamspaces: [["management", "FULL"], ["academic", "EDIT"], ["students", "EDIT"], ["communication", "EDIT"]] },
  { key: "vpStudents", name: "أ. فهد بن سعد السبيعي", email: "vp.students@demo.manassa.sa", jobTitle: "وكيل شؤون الطلاب — فرع البنين", role: "VP_STUDENTS", branch: "BOYS", color: "slate", demo: true, teamspaces: [["management", "EDIT"], ["students", "EDIT"], ["communication", "EDIT"]] },
  { key: "vpAcademic", name: "أ. نورة بنت علي القحطاني", email: "vp.academic@demo.manassa.sa", jobTitle: "وكيلة الشؤون الأكاديمية — فرع البنات", role: "VP_ACADEMIC", branch: "GIRLS", color: "purple", demo: true, teamspaces: [["management", "EDIT"], ["academic", "EDIT"], ["communication", "EDIT"]] },
  { key: "teacher", name: "أ. عبدالرحمن بن ناصر الزهراني", email: "teacher@demo.manassa.sa", jobTitle: "معلم رياضيات — المرحلة المتوسطة", role: "TEACHER", branch: "BOYS", stage: "INT", color: "gold", demo: true, teamspaces: [["academic", "EDIT"], ["communication", "VIEW"]] },
  { key: "counselor", name: "أ. هيفاء بنت فهد الشمري", email: "counselor@demo.manassa.sa", jobTitle: "مرشدة طلابية", role: "COUNSELOR", branch: "GIRLS", color: "green", demo: true, teamspaces: [["students", "EDIT"]] },
  { key: "admissions", name: "أ. ريم بنت خالد الدوسري", email: "admissions@demo.manassa.sa", jobTitle: "مسؤولة القبول والتسجيل", role: "ADMISSIONS", branch: "GIRLS", color: "teal", demo: true, teamspaces: [["students", "EDIT"], ["communication", "VIEW"]] },
  { key: "accountant", name: "أ. ماجد بن سالم الحربي", email: "accountant@demo.manassa.sa", jobTitle: "المحاسب الأول", role: "ACCOUNTANT", branch: null, color: "navy", demo: true, teamspaces: [["finance", "FULL"]] },
  { key: "cashier", name: "أ. تركي بن عبدالعزيز المطيري", email: "cashier@demo.manassa.sa", jobTitle: "أمين الصندوق", role: "CASHIER", branch: "BOYS", color: "orange", demo: true, teamspaces: [["finance", "VIEW"]] },
  { key: "hrManager", name: "أ. منيرة بنت سعيد الغامدي", email: "hr.manager@demo.manassa.sa", jobTitle: "مديرة الموارد البشرية", role: "HR_MANAGER", branch: null, color: "red", demo: true, teamspaces: [["hr", "FULL"], ["management", "VIEW"]] },
  { key: "hrOfficer", name: "أ. بندر بن مطلق العنزي", email: "hr@demo.manassa.sa", jobTitle: "أخصائي موارد بشرية", role: "HR_OFFICER", branch: null, color: "brown", demo: true, teamspaces: [["hr", "EDIT"]] },
  { key: "librarian", name: "أ. أمل بنت حسن الشهري", email: "librarian@demo.manassa.sa", jobTitle: "أمينة مصادر التعلم", role: "LIBRARIAN", branch: "GIRLS", color: "purple", demo: true, teamspaces: [["operations", "EDIT"]] },
  { key: "facilities", name: "م. سعود بن ماجد البقمي", email: "facilities@demo.manassa.sa", jobTitle: "مسؤول المرافق والصيانة", role: "FACILITIES", branch: "BOYS", color: "slate", demo: true, teamspaces: [["operations", "EDIT"]] },
  { key: "procurement", name: "أ. ياسر بن عوض الجهني", email: "procurement@demo.manassa.sa", jobTitle: "مسؤول المخزون والمشتريات", role: "PROCUREMENT", branch: null, color: "gold", demo: true, teamspaces: [["operations", "EDIT"]] },
  { key: "transport", name: "أ. حمد بن فالح الرشيدي", email: "transport@demo.manassa.sa", jobTitle: "مسؤول النقل المدرسي", role: "TRANSPORT", branch: null, color: "teal", demo: true, teamspaces: [["operations", "EDIT"]] },
  { key: "reception", name: "أ. لمى بنت يوسف العمري", email: "reception@demo.manassa.sa", jobTitle: "موظفة الاستقبال", role: "RECEPTION", branch: "GIRLS", color: "green", demo: true, teamspaces: [["communication", "VIEW"]] },
  { key: "nurse", name: "أ. نورة بنت فهد السبيعي", email: "nurse@demo.manassa.sa", jobTitle: "ممرضة المدرسة", role: "NURSE", branch: "BOYS", color: "red", demo: true },
  { key: "canteen", name: "أ. بدر بن ناصر الغامدي", email: "canteen@demo.manassa.sa", jobTitle: "مسؤول المقصف", role: "CANTEEN", branch: "BOYS", color: "orange", demo: true },
  { key: "parent", name: "أ. عبدالعزيز بن محمد القرني", email: "parent@demo.manassa.sa", jobTitle: "ولي أمر", role: "PARENT", branch: null, color: "slate", demo: true },
  { key: "student", name: "يوسف بن عبدالعزيز القرني", email: "student@demo.manassa.sa", jobTitle: "طالب — الصف الثاني المتوسط", role: "STUDENT", branch: "BOYS", color: "navy", demo: true },
  { key: "auditor", name: "أ. وليد بن إبراهيم الخالدي", email: "auditor@demo.manassa.sa", jobTitle: "مدقق داخلي", role: "AUDITOR", branch: null, color: "gold", demo: true },

  // معلمو فرع البنين
  { key: "t01", name: "أ. محمد بن علي العسيري", email: "m.alasiri@demo.manassa.sa", jobTitle: "معلم لغة عربية", role: "TEACHER", branch: "BOYS", stage: "PRI", color: "navy", teamspaces: [["academic", "EDIT"]] },
  { key: "t02", name: "أ. إبراهيم بن يحيى الحازمي", email: "i.alhazmi@demo.manassa.sa", jobTitle: "معلم علوم", role: "TEACHER", branch: "BOYS", stage: "INT", color: "teal", teamspaces: [["academic", "EDIT"]] },
  { key: "t03", name: "أ. عمر بن سالم باوزير", email: "o.bawazir@demo.manassa.sa", jobTitle: "معلم لغة إنجليزية", role: "TEACHER", branch: "BOYS", stage: "SEC", color: "slate", teamspaces: [["academic", "EDIT"]] },
  { key: "t04", name: "أ. سلمان بن فهد الشهراني", email: "s.alshahrani@demo.manassa.sa", jobTitle: "معلم فيزياء", role: "TEACHER", branch: "BOYS", stage: "SEC", color: "gold", teamspaces: [["academic", "EDIT"]] },
  { key: "t05", name: "أ. نايف بن عبدالله العصيمي", email: "n.alosaimi@demo.manassa.sa", jobTitle: "معلم دراسات إسلامية", role: "TEACHER", branch: "BOYS", stage: "PRI", color: "green", teamspaces: [["academic", "EDIT"]] },
  { key: "t06", name: "أ. أحمد بن حسن الفيفي", email: "a.alfaifi@demo.manassa.sa", jobTitle: "معلم حاسب آلي", role: "TEACHER", branch: "BOYS", stage: "INT", color: "purple", teamspaces: [["academic", "EDIT"]] },
  { key: "t07", name: "أ. طلال بن مرزوق الأحمدي", email: "t.alahmadi@demo.manassa.sa", jobTitle: "معلم تربية بدنية", role: "TEACHER", branch: "BOYS", stage: "PRI", color: "orange", teamspaces: [["academic", "EDIT"]] },
  { key: "t08", name: "أ. مشعل بن راشد السهلي", email: "m.alsahli@demo.manassa.sa", jobTitle: "معلم كيمياء", role: "TEACHER", branch: "BOYS", stage: "SEC", color: "brown", teamspaces: [["academic", "EDIT"]] },
  { key: "t09", name: "أ. عادل بن منصور المالكي", email: "a.almalki@demo.manassa.sa", jobTitle: "معلم اجتماعيات", role: "TEACHER", branch: "BOYS", stage: "INT", color: "navy", teamspaces: [["academic", "EDIT"]] },
  { key: "t10", name: "أ. زياد بن هاني القرشي", email: "z.alqurashi@demo.manassa.sa", jobTitle: "معلم رياضيات", role: "TEACHER", branch: "BOYS", stage: "PRI", color: "teal", teamspaces: [["academic", "EDIT"]] },
  { key: "t11", name: "أ. فيصل بن عمر الشريف", email: "f.alsharif@demo.manassa.sa", jobTitle: "معلم مهارات رقمية", role: "TEACHER", branch: "BOYS", stage: "SEC", color: "slate", teamspaces: [["academic", "EDIT"]] },

  // معلمات فرع البنات
  { key: "t12", name: "أ. هند بنت عبدالرحمن السديري", email: "h.alsudairi@demo.manassa.sa", jobTitle: "معلمة لغة عربية", role: "TEACHER", branch: "GIRLS", stage: "SEC", color: "purple", teamspaces: [["academic", "EDIT"]] },
  { key: "t13", name: "أ. منال بنت سعد الحربي", email: "m.alharbi@demo.manassa.sa", jobTitle: "معلمة رياضيات", role: "TEACHER", branch: "GIRLS", stage: "INT", color: "gold", teamspaces: [["academic", "EDIT"]] },
  { key: "t14", name: "أ. جواهر بنت ناصر المطيري", email: "j.almutairi@demo.manassa.sa", jobTitle: "معلمة أحياء", role: "TEACHER", branch: "GIRLS", stage: "SEC", color: "green", teamspaces: [["academic", "EDIT"]] },
  { key: "t15", name: "أ. أسماء بنت محمد العبدلي", email: "a.alabdali@demo.manassa.sa", jobTitle: "معلمة لغة إنجليزية", role: "TEACHER", branch: "GIRLS", stage: "PRI", color: "teal", teamspaces: [["academic", "EDIT"]] },
  { key: "t16", name: "أ. شهد بنت فيصل الغامدي", email: "sh.alghamdi@demo.manassa.sa", jobTitle: "معلمة علوم", role: "TEACHER", branch: "GIRLS", stage: "INT", color: "navy", teamspaces: [["academic", "EDIT"]] },
  { key: "t17", name: "أ. لطيفة بنت عيد البلوي", email: "l.albalawi@demo.manassa.sa", jobTitle: "معلمة دراسات إسلامية", role: "TEACHER", branch: "GIRLS", stage: "PRI", color: "brown", teamspaces: [["academic", "EDIT"]] },
  { key: "t18", name: "أ. رهف بنت عبدالله السلمي", email: "r.alsulami@demo.manassa.sa", jobTitle: "معلمة فنية", role: "TEACHER", branch: "GIRLS", stage: "PRI", color: "orange", teamspaces: [["academic", "EDIT"]] },
  { key: "t19", name: "أ. دانة بنت سليمان الحمدان", email: "d.alhamdan@demo.manassa.sa", jobTitle: "معلمة حاسب آلي", role: "TEACHER", branch: "GIRLS", stage: "SEC", color: "slate", teamspaces: [["academic", "EDIT"]] },
  { key: "t20", name: "أ. بشرى بنت أحمد الكثيري", email: "b.alkathiri@demo.manassa.sa", jobTitle: "معلمة كيمياء", role: "TEACHER", branch: "GIRLS", stage: "SEC", color: "purple", teamspaces: [["academic", "EDIT"]] },
  { key: "t21", name: "أ. عائشة بنت خالد الجابري", email: "ai.aljabri@demo.manassa.sa", jobTitle: "معلمة رياضيات", role: "TEACHER", branch: "GIRLS", stage: "PRI", color: "gold", teamspaces: [["academic", "EDIT"]] },
  { key: "t22", name: "أ. وعد بنت ماجد الزهراني", email: "w.alzahrani@demo.manassa.sa", jobTitle: "معلمة اجتماعيات", role: "TEACHER", branch: "GIRLS", stage: "INT", color: "green", teamspaces: [["academic", "EDIT"]] },

  // موظفون إداريون وخدمات
  { key: "s01", name: "أ. مها بنت صالح الخثعمي", email: "m.alkhathami@demo.manassa.sa", jobTitle: "سكرتيرة الإدارة", role: "RECEPTION", branch: "GIRLS", color: "teal", teamspaces: [["management", "VIEW"], ["communication", "EDIT"]] },
  { key: "s02", name: "أ. سامي بن عطية العطوي", email: "s.alatawi@demo.manassa.sa", jobTitle: "فني تقنية معلومات", role: "FACILITIES", branch: "BOYS", color: "navy", teamspaces: [["operations", "EDIT"], ["system", "EDIT"]] },
  { key: "s03", name: "أ. رائد بن حمود الحارثي", email: "r.alharthi@demo.manassa.sa", jobTitle: "مشرف أمن وسلامة", role: "RECEPTION", branch: "BOYS", color: "brown", teamspaces: [["operations", "VIEW"]] },
  { key: "s04", name: "أ. نوف بنت عبدالله الرويلي", email: "n.alruwaili@demo.manassa.sa", jobTitle: "ممرضة المدرسة", role: "COUNSELOR", branch: "GIRLS", color: "red", teamspaces: [["students", "VIEW"]] },
  { key: "s05", name: "أ. غادة بنت سعود التميمي", email: "g.altamimi@demo.manassa.sa", jobTitle: "محاسبة", role: "ACCOUNTANT", branch: null, color: "gold", teamspaces: [["finance", "EDIT"]] },

  // أولياء أمور إضافيون
  { key: "parent2", name: "أ. سعيد بن مبارك الدوسري", email: "parent2@demo.manassa.sa", jobTitle: "ولي أمر", role: "PARENT", branch: null, color: "slate" },
  { key: "parent3", name: "أ. هدى بنت علي الشمراني", email: "parent3@demo.manassa.sa", jobTitle: "ولية أمر", role: "PARENT", branch: null, color: "slate" },
];

/** أدوار تتطلب المصادقة الثنائية: تُفعَّل بسر معروف للحسابات التجريبية */
export const DEMO_2FA_ROLES = new Set(["OWNER", "PRINCIPAL", "ACCOUNTANT", "CASHIER", "HR_MANAGER", "AUDITOR", "NURSE"]);
