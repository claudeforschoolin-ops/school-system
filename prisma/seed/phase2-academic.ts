/**
 * بذور الشؤون الأكاديمية والأنشطة: القاعات، المواد والخطط الدراسية (بأنصبة واقعية لكل مرحلة)،
 * الوحدات والدروس مع إنجاز الفصول، معلمون إضافيون لتغطية النصاب، الإسناد، جدول مولَّد بالقيود،
 * حصص انتظار، وأنشطة بتسجيلاتها وموافقاتها.
 */
import type { Prisma } from "../../src/generated/prisma/client";
import { rootDb } from "../../src/server/db/client";
import { hashPassword } from "../../src/server/auth/password";
import { generateTimetable } from "../../src/lib/timetable/generator";
import { toISODate } from "../../src/lib/dates";
import { DEMO_PASSWORD, fakePhone } from "./data/people";
import type { Rng } from "./data/students-data";

const DAY = 86_400_000;
const TZ = "Asia/Riyadh";
const d0 = (iso: string) => new Date(`${iso}T00:00:00Z`);

type Stage = "PRI_LOW" | "PRI_HIGH" | "INT" | "SEC";

const SUBJECTS: Array<{ code: string; name: string; color: string; roomKind?: string }> = [
  { code: "QUR", name: "القرآن الكريم", color: "green" },
  { code: "ISL", name: "الدراسات الإسلامية", color: "teal" },
  { code: "ARB", name: "اللغة العربية", color: "navy" },
  { code: "MATH", name: "الرياضيات", color: "purple" },
  { code: "SCI", name: "العلوم", color: "teal", roomKind: "LAB" },
  { code: "ENG", name: "اللغة الإنجليزية", color: "gold" },
  { code: "SOC", name: "الدراسات الاجتماعية", color: "brown" },
  { code: "DIG", name: "المهارات الرقمية", color: "slate", roomKind: "COMPUTER" },
  { code: "ART", name: "التربية الفنية", color: "orange", roomKind: "ART" },
  { code: "PE", name: "التربية البدنية والدفاع عن النفس", color: "green", roomKind: "GYM" },
  { code: "LIFE", name: "المهارات الحياتية والأسرية", color: "gold" },
  { code: "CRIT", name: "التفكير الناقد", color: "purple" },
  { code: "PHY", name: "الفيزياء", color: "navy", roomKind: "LAB" },
  { code: "CHEM", name: "الكيمياء", color: "red", roomKind: "LAB" },
  { code: "BIO", name: "الأحياء", color: "green", roomKind: "LAB" },
];

/** الخطة الأسبوعية: [الرمز، الحصص، ثقيلة] — مجموعها ≤ ٣٥ خانة (٥ أيام × ٧ حصص) */
const PLANS: Record<Stage, Array<[string, number, boolean]>> = {
  PRI_LOW: [["QUR", 5, false], ["ISL", 3, false], ["ARB", 8, true], ["MATH", 5, true], ["SCI", 3, false], ["ENG", 2, false], ["ART", 2, false], ["PE", 3, false], ["LIFE", 1, false]],
  PRI_HIGH: [["QUR", 4, false], ["ISL", 3, false], ["ARB", 6, true], ["MATH", 5, true], ["SCI", 4, true], ["ENG", 3, false], ["SOC", 2, false], ["DIG", 2, false], ["ART", 2, false], ["PE", 2, false], ["LIFE", 1, false]],
  INT: [["QUR", 3, false], ["ISL", 3, false], ["ARB", 5, true], ["MATH", 5, true], ["SCI", 4, true], ["ENG", 4, false], ["SOC", 3, false], ["DIG", 2, false], ["ART", 1, false], ["PE", 2, false], ["LIFE", 1, false], ["CRIT", 1, false]],
  SEC: [["ISL", 3, false], ["ARB", 4, false], ["MATH", 5, true], ["PHY", 3, true], ["CHEM", 3, true], ["BIO", 3, false], ["ENG", 4, false], ["DIG", 2, false], ["PE", 2, false], ["CRIT", 2, false], ["SOC", 2, false]],
};

const TEXTBOOKS: Record<string, Partial<Record<Stage, string>>> = {
  ARB: { PRI_LOW: "لغتي", PRI_HIGH: "لغتي الجميلة", INT: "لغتي الخالدة", SEC: "الكفايات اللغوية" },
  ENG: { PRI_LOW: "We Can!", PRI_HIGH: "We Can!", INT: "Super Goal", SEC: "Mega Goal" },
  MATH: { PRI_LOW: "الرياضيات", PRI_HIGH: "الرياضيات", INT: "الرياضيات", SEC: "الرياضيات (نظام المسارات)" },
  ISL: { PRI_LOW: "الدراسات الإسلامية", PRI_HIGH: "الدراسات الإسلامية", INT: "الدراسات الإسلامية", SEC: "الحديث والتفسير والفقه" },
};

/** وحدات ودروس نموذجية لكل مادة ومرحلة */
const SYLLABI: Record<string, Partial<Record<Stage, Array<[string, string[]]>>>> = {
  MATH: {
    PRI_LOW: [
      ["الأعداد وقيمتها المنزلية", ["قراءة الأعداد وكتابتها", "القيمة المنزلية", "مقارنة الأعداد وترتيبها", "الأنماط العددية"]],
      ["الجمع", ["خصائص الجمع", "الجمع دون إعادة التجميع", "الجمع مع إعادة التجميع", "حل المسألة"]],
      ["الطرح", ["الطرح دون إعادة التجميع", "الطرح مع إعادة التجميع", "العلاقة بين الجمع والطرح"]],
      ["القياس والزمن", ["قياس الطول", "قراءة الساعة", "التقويم"]],
    ],
    PRI_HIGH: [
      ["القيمة المنزلية والأعداد الكبيرة", ["القيمة المنزلية ضمن الملايين", "مقارنة الأعداد", "التقريب"]],
      ["الضرب والقسمة", ["الضرب في عدد من رقمين", "القسمة على عدد من رقم واحد", "خطة حل المسألة"]],
      ["الكسور الاعتيادية", ["الكسور المتكافئة", "تبسيط الكسور", "جمع الكسور وطرحها"]],
      ["الكسور العشرية", ["الكسور العشرية والقيمة المنزلية", "جمع الكسور العشرية", "ضرب الكسور العشرية"]],
      ["الهندسة", ["المضلعات", "المحيط", "المساحة"]],
    ],
    INT: [
      ["الأعداد النسبية", ["الأعداد النسبية على خط الأعداد", "جمع الأعداد النسبية وطرحها", "ضرب الأعداد النسبية وقسمتها"]],
      ["الجبر: المعادلات الخطية", ["العبارات الجبرية", "حل معادلات بخطوة", "حل معادلات بخطوتين", "المتباينات"]],
      ["النسبة والتناسب", ["النسبة والمعدل", "التناسب", "النسبة المئوية"]],
      ["الهندسة والقياس", ["الزوايا", "المثلثات", "نظرية فيثاغورس", "المساحة السطحية والحجم"]],
    ],
    SEC: [
      ["التبرير والبرهان", ["التبرير الاستقرائي", "المنطق", "البرهان الجبري"]],
      ["الدوال", ["الدوال ومجالها", "الدوال الأم والتحويلات", "تركيب الدوال"]],
      ["كثيرات الحدود", ["العمليات على كثيرات الحدود", "القسمة التركيبية", "نظرية الباقي والعوامل"]],
      ["المصفوفات", ["مقدمة في المصفوفات", "العمليات على المصفوفات", "المحددات"]],
    ],
  },
  ARB: {
    PRI_LOW: [
      ["أسرتي", ["نص الاستماع: أسرتي", "الحروف والأصوات", "الكتابة: رسم الحروف"]],
      ["مدرستي", ["نص القراءة: في المدرسة", "التنوين", "الإملاء: التاء المربوطة"]],
      ["صحتي وغذائي", ["نص القراءة: غذائي الصحي", "أسلوب النداء", "التعبير الشفهي"]],
      ["وطني", ["نص القراءة: وطني الحبيب", "اللام الشمسية والقمرية", "الخط: النسخ"]],
    ],
    PRI_HIGH: [
      ["القيم الإسلامية", ["نص الفهم القرائي", "الجملة الاسمية", "الهمزة المتوسطة", "الكتابة الوظيفية"]],
      ["الوطن", ["نص الاستماع", "كان وأخواتها", "الإملاء: الألف اللينة"]],
      ["العلوم والتقنية", ["نص الفهم القرائي", "الفعل المضارع", "الكتابة الإبداعية"]],
      ["الرياضة والصحة", ["النص الشعري", "المفعول به", "الخط: الرقعة"]],
    ],
    INT: [
      ["الإيمان والأخلاق", ["نص الفهم القرائي", "الفعل المبني للمجهول", "التعبير الكتابي: المقال"]],
      ["الوطن والتنمية", ["النص الشعري", "المفعول لأجله", "الرسم الإملائي"]],
      ["قضايا معاصرة", ["نص الاستماع", "الحال", "التلخيص"]],
    ],
    SEC: [
      ["الكفاية القرائية", ["استراتيجيات القراءة", "التحليل الأدبي", "القراءة النقدية"]],
      ["الكفاية النحوية", ["الأساليب النحوية", "التوابع", "الأعداد"]],
      ["الكفاية الكتابية", ["المقال", "التقرير", "السيرة الذاتية"]],
    ],
  },
  SCI: {
    PRI_LOW: [
      ["الأشياء الحية وغير الحية", ["الأشياء الحية", "النباتات", "الحيوانات"]],
      ["الأرض وسماؤها", ["اليابسة والماء", "الطقس", "الشمس والقمر"]],
    ],
    PRI_HIGH: [
      ["الخلايا والأنسجة", ["الخلية", "الأنسجة والأعضاء", "المجهر"]],
      ["المادة وخصائصها", ["حالات المادة", "المخاليط والمحاليل", "التغيرات الفيزيائية والكيميائية"]],
      ["القوة والحركة", ["الحركة", "القوى", "الآلات البسيطة"]],
    ],
    INT: [
      ["طبيعة العلم", ["الطريقة العلمية", "القياس والوحدات", "السلامة في المختبر"]],
      ["المادة والطاقة", ["الذرة", "الجدول الدوري", "الروابط الكيميائية"]],
      ["الأنظمة الحيوية", ["الجهاز الهضمي", "الجهاز الدوري", "الجهاز التنفسي"]],
    ],
  },
  ENG: {
    INT: [
      ["Unit 1: Personal Information", ["Conversation", "Grammar: Present simple", "Reading", "Writing"]],
      ["Unit 2: Around the World", ["Conversation", "Grammar: Comparatives", "Listening", "Writing"]],
      ["Unit 3: Food", ["Conversation", "Grammar: Countable nouns", "Reading", "Project"]],
    ],
    SEC: [
      ["Unit 1: Talents", ["Listen and Discuss", "Grammar", "Reading", "Writing"]],
      ["Unit 2: Inventions", ["Listen and Discuss", "Grammar", "Reading", "Project"]],
    ],
  },
};

/** معلمون إضافيون لتغطية النصاب (أسماء واقعية وأرقام وهمية) */
const EXTRA_TEACHERS: Record<"BOYS" | "GIRLS", Array<[string, string, string, string[]]>> = {
  BOYS: [
    ["أ. خالد بن سعيد القحطاني", "k.alqahtani", "معلم لغة عربية", ["ARB"]],
    ["أ. ياسر بن عبدالعزيز الدوسري", "y.aldosari", "معلم لغة عربية", ["ARB"]],
    ["أ. بندر بن محمد العنزي", "b.alanazi", "معلم قرآن كريم", ["QUR", "ISL"]],
    ["أ. ماجد بن صالح الرشيدي", "m.alrashidi", "معلم دراسات إسلامية", ["QUR", "ISL"]],
    ["أ. حمد بن عيسى المري", "h.almarri", "معلم رياضيات", ["MATH"]],
    ["أ. وليد بن جابر الشمري", "w.alshammari", "معلم لغة إنجليزية", ["ENG"]],
    ["أ. سامي بن مطلق الحربي", "s.alharbi", "معلم تربية بدنية", ["PE", "ART", "LIFE"]],
    ["أ. مازن بن حامد البقمي", "m.albuqami", "معلم تربية فنية", ["ART", "SOC", "LIFE"]],
  ],
  GIRLS: [
    ["أ. نورة بنت سعد الدوسري", "n.aldosari", "معلمة لغة عربية", ["ARB"]],
    ["أ. مها بنت إبراهيم الشهري", "m.alshehri", "معلمة لغة عربية", ["ARB"]],
    ["أ. سارة بنت خالد العمري", "s.alomari", "معلمة قرآن كريم", ["QUR", "ISL"]],
    ["أ. ريم بنت عبدالله القحطاني", "r.alqahtani", "معلمة دراسات إسلامية", ["QUR", "ISL"]],
    ["أ. أمل بنت حمد الرويلي", "a.alruwaili", "معلمة رياضيات", ["MATH"]],
    ["أ. غادة بنت ناصر الشمراني", "g.alshamrani", "معلمة لغة إنجليزية", ["ENG"]],
    ["أ. فاطمة بنت علي الزهراني", "f.alzahrani", "معلمة لياقة وصحة", ["PE", "LIFE"]],
    ["أ. هيفاء بنت سالم المطرفي", "h.almutrafi", "معلمة لياقة وفنون", ["PE", "ART", "CRIT"]],
    ["أ. العنود بنت مشاري السبيعي", "a.alsubaie", "معلمة فيزياء وحاسب", ["DIG", "CRIT", "PHY"]],
  ],
};

/** مؤهلات المعلمين الحاليين حسب البريد */
const EXISTING_QUALIFICATIONS: Record<string, string[]> = {
  "teacher@demo.manassa.sa": ["MATH"],
  "m.alasiri@demo.manassa.sa": ["ARB"],
  "i.alhazmi@demo.manassa.sa": ["SCI", "BIO"],
  "o.bawazir@demo.manassa.sa": ["ENG"],
  "s.alshahrani@demo.manassa.sa": ["PHY", "SCI"],
  "n.alosaimi@demo.manassa.sa": ["ISL", "QUR"],
  "a.alfaifi@demo.manassa.sa": ["DIG", "CRIT"],
  "t.alahmadi@demo.manassa.sa": ["PE"],
  "m.alsahli@demo.manassa.sa": ["CHEM", "SCI"],
  "a.almalki@demo.manassa.sa": ["SOC", "LIFE", "ISL"],
  "z.alqurashi@demo.manassa.sa": ["MATH"],
  "f.alsharif@demo.manassa.sa": ["DIG", "CRIT"],
  "h.alsudairi@demo.manassa.sa": ["ARB"],
  "m.alharbi@demo.manassa.sa": ["MATH"],
  "j.almutairi@demo.manassa.sa": ["BIO", "SCI"],
  "a.alabdali@demo.manassa.sa": ["ENG"],
  "sh.alghamdi@demo.manassa.sa": ["SCI"],
  "l.albalawi@demo.manassa.sa": ["ISL", "QUR"],
  "r.alsulami@demo.manassa.sa": ["ART"],
  "d.alhamdan@demo.manassa.sa": ["DIG"],
  "b.alkathiri@demo.manassa.sa": ["CHEM", "PHY"],
  "ai.aljabri@demo.manassa.sa": ["MATH"],
  "w.alzahrani@demo.manassa.sa": ["SOC", "LIFE", "ISL"],
};

const ROOMS: Array<[string, string, string, number]> = [
  ["LAB-1", "مختبر العلوم (١)", "LAB", 30],
  ["LAB-2", "مختبر العلوم (٢)", "LAB", 30],
  ["PC-1", "معمل الحاسب", "COMPUTER", 28],
  ["GYM", "الصالة الرياضية", "GYM", 60],
  ["LRC", "مركز مصادر التعلم", "LIBRARY", 40],
  ["HALL", "المسرح المدرسي", "HALL", 250],
];

function stageOf(code: string, order: number): Stage {
  if (code === "PRI") return order <= 3 ? "PRI_LOW" : "PRI_HIGH";
  return code as Stage;
}

export async function seedPhase2Academic(tenantId: string, r: Rng) {
  console.log("⏳ الشؤون الأكاديمية: القاعات والمواد والخطط والإسناد والجداول والأنشطة...");
  const year = await rootDb.academicYear.findFirstOrThrow({ where: { tenantId, isCurrent: true } });
  const branches = await rootDb.branch.findMany({ where: { tenantId }, orderBy: { code: "asc" } });
  const branchKey = (id: string) => (branches.find((b) => b.id === id)!.gender === "GIRLS" ? "GIRLS" : "BOYS");
  const users = await rootDb.user.findMany({ where: { tenantId }, select: { id: true, email: true, name: true } });
  const userBy = (email: string) => users.find((u) => u.email === email)!.id;
  const vpAcademic = userBy("vp.academic@demo.manassa.sa");
  const principal = userBy("principal@demo.manassa.sa");
  const teacherRole = await rootDb.role.findFirstOrThrow({ where: { tenantId, key: "TEACHER" } });
  const today = toISODate(new Date(), TZ);

  // ---------------- القاعات ----------------
  const sections = await rootDb.section.findMany({ where: { tenantId, academicYearId: year.id, deletedAt: null }, include: { grade: { include: { stage: true } } } });
  const roomsByBranch = new Map<string, Array<{ id: string; kind: string }>>();
  for (const b of branches) {
    const list: Array<{ id: string; kind: string }> = [];
    const defs = branchKey(b.id) === "GIRLS" ? [...ROOMS, ["ART-1", "المرسم", "ART", 30] as [string, string, string, number]] : ROOMS;
    for (const [code, name, kind, capacity] of defs) {
      const room = await rootDb.room.create({ data: { tenantId, branchId: b.id, code, name, kind, capacity, createdById: vpAcademic } });
      list.push({ id: room.id, kind });
    }
    // فصل دراسي لكل شعبة
    const own = sections.filter((s) => s.branchId === b.id).sort((x, y) => x.grade.stage.order - y.grade.stage.order || x.grade.order - y.grade.order);
    for (const [i, s] of own.entries()) {
      const code = `${100 * (s.grade.stage.order) + i + 1}`;
      await rootDb.room.create({ data: { tenantId, branchId: b.id, code, name: `فصل ${code}`, kind: "CLASSROOM", capacity: 30, createdById: vpAcademic } });
      await rootDb.section.update({ where: { id: s.id }, data: { room: code } });
    }
    roomsByBranch.set(b.id, list);
    // جدول الجرس (فرع البنات يبدأ متأخراً ربع ساعة)
    const girls = branchKey(b.id) === "GIRLS";
    const periods = girls
      ? [["07:00", "07:45"], ["07:45", "08:30"], ["08:30", "09:15"], ["09:40", "10:25"], ["10:25", "11:10"], ["11:25", "12:10"], ["12:10", "12:55"]]
      : [["06:45", "07:30"], ["07:30", "08:15"], ["08:15", "09:00"], ["09:25", "10:10"], ["10:10", "10:55"], ["11:10", "11:55"], ["11:55", "12:40"]];
    await rootDb.bellSchedule.create({
      data: { tenantId, branchId: b.id, name: "الجدول المعتمد — الفصل الأول", days: [0, 1, 2, 3, 4], periods: periods.map(([start, end], i) => ({ index: i + 1, start, end })) as Prisma.InputJsonValue, maxConsecutive: 4, updatedById: vpAcademic },
    });
  }

  // ---------------- المواد والخطط ----------------
  const subjectId: Record<string, string> = {};
  for (const s of SUBJECTS) {
    const created = await rootDb.subject.create({ data: { tenantId, code: s.code, name: s.name, color: s.color, roomKind: s.roomKind ?? null, createdById: vpAcademic } });
    subjectId[s.code] = created.id;
  }
  const grades = await rootDb.grade.findMany({ where: { tenantId, deletedAt: null }, include: { stage: true } });
  const planByGrade = new Map<string, Array<{ id: string; subjectId: string; code: string; periods: number; heavy: boolean }>>();
  const weekNow = Math.max(1, Math.floor((d0(today).getTime() - year.startDate.getTime()) / (7 * DAY)) + 1);
  const unitsByGs = new Map<string, Array<{ lessons: Array<{ id: string; week: number }> }>>();
  for (const g of grades) {
    const stage = stageOf(g.stage.code, g.order);
    const items: Array<{ id: string; subjectId: string; code: string; periods: number; heavy: boolean }> = [];
    for (const [code, periods, heavy] of PLANS[stage]) {
      const gs = await rootDb.gradeSubject.create({ data: { tenantId, gradeId: g.id, subjectId: subjectId[code]!, weeklyPeriods: periods, heavy, textbook: TEXTBOOKS[code]?.[stage] ?? null, createdById: vpAcademic } });
      items.push({ id: gs.id, subjectId: subjectId[code]!, code, periods, heavy });
      const syllabus = SYLLABI[code]?.[stage];
      if (!syllabus) continue;
      let week = 1;
      const units: Array<{ lessons: Array<{ id: string; week: number }> }> = [];
      for (const [ui, [title, lessons]] of syllabus.entries()) {
        const unit = await rootDb.curriculumUnit.create({ data: { tenantId, gradeSubjectId: gs.id, title: `الوحدة ${ui + 1}: ${title}`, order: ui + 1, objectives: `أن يتمكن الطالب من مهارات «${title}» وتطبيقها في مواقف حياتية.` } });
        const created: Array<{ id: string; week: number }> = [];
        for (const [li, lt] of lessons.entries()) {
          const lesson = await rootDb.curriculumLesson.create({ data: { tenantId, unitId: unit.id, title: lt, order: li + 1, week, periods: Math.max(1, Math.round(periods / 2)) } });
          created.push({ id: lesson.id, week });
          if (li % 2 === 1 || lessons.length <= 3) week++;
        }
        units.push({ lessons: created });
      }
      unitsByGs.set(gs.id, units);
    }
    planByGrade.set(g.id, items);
  }

  // ---------------- المعلمون والأنصبة ----------------
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const qualifications = new Map<string, string[]>();
  for (const [email, codes] of Object.entries(EXISTING_QUALIFICATIONS)) {
    const u = users.find((x) => x.email === email);
    if (u) qualifications.set(u.id, codes);
  }
  for (const key of ["BOYS", "GIRLS"] as const) {
    const branch = branches.find((b) => branchKey(b.id) === key)!;
    for (const [name, handle, jobTitle, codes] of EXTRA_TEACHERS[key]) {
      const u = await rootDb.user.create({
        data: { tenantId, email: `${handle}@demo.manassa.sa`, phone: fakePhone(), name, jobTitle, avatarColor: r.pick(["navy", "teal", "gold", "green", "purple", "brown", "slate", "orange"]), passwordHash, status: "ACTIVE", passwordChangedAt: new Date(), preferences: { theme: "system", digits: "arab", calendar: "both" } },
      });
      await rootDb.userRole.create({ data: { tenantId, userId: u.id, roleId: teacherRole.id, branchId: branch.id } });
      qualifications.set(u.id, codes);
    }
  }
  const teacherRoles = await rootDb.userRole.findMany({ where: { tenantId, roleId: teacherRole.id, user: { status: "ACTIVE" } }, select: { userId: true, branchId: true } });
  const freeDays = [null, null, 4, null, 0, null, 3, null, 2, null, 1];
  const loads = new Map<string, { quota: number; freeDay: number | null; remaining: number; codes: string[]; branchId: string }>();
  for (const [i, tr] of teacherRoles.entries()) {
    const codes = qualifications.get(tr.userId) ?? [];
    const quota = 24;
    const freeDay = freeDays[i % freeDays.length] ?? null;
    await rootDb.teacherLoad.create({ data: { tenantId, userId: tr.userId, academicYearId: year.id, quota, freeDay, subjectIds: codes.map((c) => subjectId[c]!), createdById: vpAcademic } });
    loads.set(tr.userId, { quota, freeDay, remaining: quota, codes, branchId: tr.branchId! });
  }

  // ---------------- الإسناد ----------------
  const assignments: Array<{ sectionId: string; subjectId: string; teacherId: string; count: number; heavy: boolean; roomKind: string | null; branchId: string }> = [];
  for (const b of branches) {
    const cells = sections
      .filter((s) => s.branchId === b.id)
      .flatMap((s) => (planByGrade.get(s.gradeId) ?? []).map((p) => ({ section: s, plan: p })))
      .sort((a, c) => c.plan.periods - a.plan.periods);
    // أولوية المواد ذات المؤهلين الأقل
    const supply = (code: string) => [...loads.values()].filter((l) => l.branchId === b.id && l.codes.includes(code)).length;
    cells.sort((a, c) => supply(a.plan.code) - supply(c.plan.code) || c.plan.periods - a.plan.periods);
    for (const { section, plan } of cells) {
      const sameGrade = new Set(assignments.filter((a) => a.subjectId === plan.subjectId && sections.find((s) => s.id === a.sectionId)?.gradeId === section.gradeId).map((a) => a.teacherId));
      const candidates = [...loads.entries()]
        .filter(([, l]) => l.branchId === b.id && l.codes.includes(plan.code) && l.remaining >= plan.periods)
        .sort(([ia, la], [ib, lb]) => Number(sameGrade.has(ib)) - Number(sameGrade.has(ia)) || lb.remaining - la.remaining);
      const pick = candidates[0];
      if (!pick) {
        console.warn(`   ⚠️ لا معلم متاح: ${section.grade.name}/${section.name} — ${plan.code}`);
        continue;
      }
      pick[1].remaining -= plan.periods;
      const subj = SUBJECTS.find((x) => x.code === plan.code)!;
      assignments.push({ sectionId: section.id, subjectId: plan.subjectId, teacherId: pick[0], count: plan.periods, heavy: plan.heavy, roomKind: subj.roomKind ?? null, branchId: b.id });
    }
  }
  await rootDb.teacherAssignment.createMany({
    data: assignments.map((a) => ({ tenantId, academicYearId: year.id, sectionId: a.sectionId, subjectId: a.subjectId, teacherId: a.teacherId, weeklyPeriods: a.count, createdById: vpAcademic, updatedById: vpAcademic })),
  });

  // ---------------- الجدول ----------------
  const slotIds: Array<{ id: string; teacherId: string; day: number; period: number; sectionId: string; subjectId: string; branchId: string }> = [];
  for (const b of branches) {
    const rooms = roomsByBranch.get(b.id) ?? [];
    const kinds = new Set(rooms.map((x) => x.kind));
    const lessons = assignments.filter((a) => a.branchId === b.id).map((a) => ({ ...a, roomKind: a.roomKind && kinds.has(a.roomKind) ? a.roomKind : null }));
    const result = generateTimetable({
      days: [0, 1, 2, 3, 4],
      periods: 7,
      maxConsecutive: 4,
      lessons,
      rooms,
      teacherFreeDay: Object.fromEntries([...loads.entries()].map(([id, l]) => [id, l.freeDay])),
      seed: 2026 + slotIds.length,
      attempts: 8,
    });
    if (result.unplaced.length) console.warn(`   ⚠️ ${result.unplaced.reduce((s, u) => s + u.missing, 0)} حصة لم تُسكّن في ${b.name}`);
    const created = await rootDb.timetableSlot.createManyAndReturn({
      data: result.slots.map((s, i) => ({ tenantId, academicYearId: year.id, sectionId: s.sectionId, day: s.day, period: s.period, subjectId: s.subjectId, teacherId: s.teacherId, roomId: s.roomId, locked: s.subjectId === subjectId.PE && i % 5 === 0, createdById: vpAcademic, updatedById: vpAcademic })),
    });
    slotIds.push(...created.map((c) => ({ id: c.id, teacherId: c.teacherId, day: c.day, period: c.period, sectionId: c.sectionId, subjectId: c.subjectId, branchId: b.id })));
  }

  // ---------------- حصص الانتظار ----------------
  const todayDate = d0(today);
  const weekday = todayDate.getUTCDay();
  const busyAt = (teacherId: string, day: number, period: number) => slotIds.some((s) => s.teacherId === teacherId && s.day === day && s.period === period);
  const substitutionDays = [today, ...[1, 2, 3, 6, 8].map((n) => toISODate(new Date(todayDate.getTime() - n * DAY), TZ))].filter((d) => d0(d).getUTCDay() <= 4);
  for (const [di, iso] of substitutionDays.entries()) {
    const wd = d0(iso).getUTCDay();
    for (const b of branches) {
      const teachersToday = [...new Set(slotIds.filter((s) => s.branchId === b.id && s.day === wd).map((s) => s.teacherId))];
      const absent = teachersToday[(di * 3 + (b.code.length % 3)) % teachersToday.length];
      if (!absent) continue;
      for (const s of slotIds.filter((x) => x.teacherId === absent && x.day === wd)) {
        const free = teachersToday.filter((t) => t !== absent && !busyAt(t, wd, s.period));
        const assignNow = iso !== today || s.period <= 3;
        const sub = assignNow ? free[(s.period + di) % Math.max(1, free.length)] : undefined;
        await rootDb.substitution.create({ data: { tenantId, slotId: s.id, date: d0(iso), absentTeacherId: absent, substituteTeacherId: sub ?? null, status: sub ? "ASSIGNED" : "PENDING", note: di === 0 ? "إجازة اضطرارية" : r.pick(["إجازة مرضية", "مهمة رسمية", "دورة تدريبية"]), createdById: vpAcademic, updatedById: vpAcademic } });
      }
    }
  }
  void weekday;

  // ---------------- إنجاز الدروس ----------------
  const progress: Prisma.LessonProgressCreateManyInput[] = [];
  for (const s of sections) {
    for (const p of planByGrade.get(s.gradeId) ?? []) {
      const units = unitsByGs.get(p.id);
      if (!units) continue;
      const teacher = assignments.find((a) => a.sectionId === s.id && a.subjectId === p.subjectId)?.teacherId ?? null;
      const lag = r.pick([0, 0, 0, 1, 1, 2]);
      for (const u of units) {
        for (const l of u.lessons) {
          if (l.week > weekNow - lag - 1) continue;
          progress.push({ tenantId, lessonId: l.id, sectionId: s.id, completedById: teacher, completedAt: new Date(year.startDate.getTime() + ((l.week - 1) * 7 + r.int(0, 4)) * DAY + 9 * 3_600_000) });
        }
      }
    }
  }
  if (progress.length) await rootDb.lessonProgress.createMany({ data: progress });

  // ---------------- الأنشطة ----------------
  const boys = branches.find((b) => branchKey(b.id) === "BOYS")!;
  const girls = branches.find((b) => branchKey(b.id) === "GIRLS")!;
  const gradeIds = (stageCode: string, orders?: number[]) => grades.filter((g) => g.stage.code === stageCode && (!orders || orders.includes(g.order))).map((g) => g.id);
  const at = (days: number, hour: number) => new Date(d0(today).getTime() + days * DAY + (hour - 3) * 3_600_000);
  const sup = (email: string) => userBy(email);
  const activities: Array<{ title: string; kind: "CLUB" | "COMMITTEE" | "TRIP" | "COMPETITION" | "EVENT"; status: "PLANNED" | "REGISTRATION" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; branchId: string | null; grades: string[]; start?: Date; end?: Date; location: string; supervisor: string; capacity?: number; fee?: number; consent?: boolean; description: string; cover: string; target: number }> = [
    { title: "نادي الروبوت والبرمجة", kind: "CLUB", status: "IN_PROGRESS", branchId: boys.id, grades: [...gradeIds("INT"), ...gradeIds("SEC")], start: at(-20, 13), end: at(60, 14), location: "معمل الحاسب", supervisor: sup("a.alfaifi@demo.manassa.sa"), capacity: 20, description: "لقاء أسبوعي كل ثلاثاء بعد الحصة السابعة: تصميم وبرمجة روبوتات للمشاركة في مسابقة «إبداع».", cover: "color:navy", target: 22 },
    { title: "رحلة إلى مركز الملك عبدالعزيز الثقافي العالمي (إثراء)", kind: "TRIP", status: "REGISTRATION", branchId: boys.id, grades: gradeIds("SEC"), start: at(12, 8), end: at(12, 14), location: "الظهران", supervisor: sup("s.alshahrani@demo.manassa.sa"), capacity: 40, fee: 15000, consent: true, description: "زيارة علمية لمتحف الطاقة ومكتبة إثراء، تشمل ورشة «مختبر الأفكار». المواصلات بحافلات المدرسة.", cover: "color:teal", target: 34 },
    { title: "رحلة علمية إلى مركز العلوم والتقنية", kind: "TRIP", status: "REGISTRATION", branchId: girls.id, grades: gradeIds("PRI", [4, 5, 6]), start: at(9, 8), end: at(9, 12), location: "مركز العلوم والتقنية", supervisor: sup("sh.alghamdi@demo.manassa.sa"), capacity: 30, fee: 8000, consent: true, description: "تجارب تفاعلية في الفيزياء والفلك لطالبات الصفوف العليا.", cover: "color:purple", target: 33 },
    { title: "مسابقة القرآن الكريم المدرسية", kind: "COMPETITION", status: "REGISTRATION", branchId: null, grades: [], start: at(20, 9), end: at(21, 12), location: "المسرح المدرسي", supervisor: sup("n.alosaimi@demo.manassa.sa"), description: "تصفيات على مستوى الفروع في حفظ وتجويد أجزاء محددة لكل مرحلة، وجوائز للمراكز الأولى.", cover: "color:green", target: 26 },
    { title: "احتفال اليوم الوطني ٩٦", kind: "EVENT", status: "COMPLETED", branchId: null, grades: [], start: new Date("2026-09-21T06:00:00Z"), end: new Date("2026-09-21T09:00:00Z"), location: "ساحة المدرسة", supervisor: sup("vp.students@demo.manassa.sa"), description: "فقرات وطنية وأوبريت ومعرض «همّة حتى القمة» بمشاركة الطلاب والطالبات وأولياء الأمور.", cover: "color:green", target: 40 },
    { title: "نادي القراءة «أصدقاء الكتاب»", kind: "CLUB", status: "IN_PROGRESS", branchId: girls.id, grades: [...gradeIds("INT"), ...gradeIds("SEC")], start: at(-25, 13), end: at(90, 14), location: "مركز مصادر التعلم", supervisor: sup("h.alsudairi@demo.manassa.sa"), capacity: 25, description: "كتاب كل أسبوعين ونقاش مفتوح، ومسابقة «تحدي القراءة العربي».", cover: "color:brown", target: 19 },
    { title: "دوري كرة القدم بين الفصول", kind: "COMPETITION", status: "IN_PROGRESS", branchId: boys.id, grades: gradeIds("INT"), start: at(-7, 12), end: at(30, 13), location: "الملعب الخارجي", supervisor: sup("t.alahmadi@demo.manassa.sa"), capacity: 60, description: "دوري بنظام المجموعات خلال الفسحة الطويلة، والنهائي في حفل ختام الفصل.", cover: "color:gold", target: 44 },
    { title: "لجنة النظام والانضباط الطلابي", kind: "COMMITTEE", status: "IN_PROGRESS", branchId: boys.id, grades: gradeIds("SEC"), location: "مكتب وكيل شؤون الطلاب", supervisor: sup("vp.students@demo.manassa.sa"), capacity: 12, description: "طلاب «سفراء الانضباط» يساعدون في تنظيم الطابور والفسح ومتابعة المبادرات السلوكية.", cover: "color:slate", target: 10 },
    { title: "نادي الرسم والخط العربي", kind: "CLUB", status: "PLANNED", branchId: girls.id, grades: gradeIds("PRI", [4, 5, 6]), start: at(14, 12), end: at(75, 13), location: "المرسم", supervisor: sup("r.alsulami@demo.manassa.sa"), capacity: 18, description: "تعلّم خطي النسخ والرقعة، ومعرض أعمال في نهاية الفصل.", cover: "color:orange", target: 0 },
    { title: "يوم الصحة المدرسية", kind: "EVENT", status: "PLANNED", branchId: null, grades: [], start: at(15, 8), end: at(15, 11), location: "الصالة الرياضية", supervisor: userBy("counselor@demo.manassa.sa"), description: "فحص نظر وأسنان بالتعاون مع مركز الرعاية الصحية الأولية، وركن للتغذية السليمة.", cover: "color:red", target: 0 },
  ];
  const activeStudents = await rootDb.student.findMany({ where: { tenantId, status: "ACTIVE", deletedAt: null }, select: { id: true, gradeId: true, branchId: true, fullName: true } });
  for (const [i, a] of activities.entries()) {
    const event = a.start
      ? await rootDb.calendarEvent.create({ data: { tenantId, branchId: a.branchId, title: `${{ CLUB: "نادٍ", COMMITTEE: "لجنة", TRIP: "رحلة", COMPETITION: "مسابقة", EVENT: "فعالية" }[a.kind]}: ${a.title}`, description: a.description, category: "ACTIVITY", location: a.location, startAt: a.start, endAt: a.end ?? new Date(a.start.getTime() + 2 * 3_600_000), createdById: principal } })
      : null;
    const activity = await rootDb.activity.create({
      data: { tenantId, number: i + 1, title: a.title, kind: a.kind, status: a.status, branchId: a.branchId, description: a.description, startAt: a.start ?? null, endAt: a.end ?? null, location: a.location, supervisorId: a.supervisor, capacity: a.capacity ?? null, feeMinor: a.fee ?? null, requiresConsent: a.consent ?? false, gradeIds: a.grades, calendarEventId: event?.id ?? null, cover: a.cover, position: i, createdById: vpAcademic, updatedById: vpAcademic },
    });
    const pool = activeStudents.filter((s) => (!a.branchId || s.branchId === a.branchId) && (!a.grades.length || a.grades.includes(s.gradeId)));
    const chosen = [...pool].sort(() => r.next() - 0.5).slice(0, a.target);
    for (const [j, s] of chosen.entries()) {
      const overflow = a.capacity !== undefined && j >= a.capacity;
      const consentStatus = a.consent ? (r.chance(0.6) ? "GRANTED" : r.chance(0.85) ? "PENDING" : "DENIED") : "NOT_REQUIRED";
      const status = consentStatus === "DENIED" ? "CANCELLED" : overflow ? "WAITLIST" : a.status === "COMPLETED" ? "ATTENDED" : "REGISTERED";
      await rootDb.activityRegistration.create({
        data: { tenantId, activityId: activity.id, studentId: s.id, status, consentStatus, consentBy: consentStatus === "GRANTED" || consentStatus === "DENIED" ? "ولي الأمر (رسالة نصية)" : null, consentAt: consentStatus === "GRANTED" || consentStatus === "DENIED" ? new Date(Date.now() - r.int(1, 5) * DAY) : null, createdAt: new Date(Date.now() - r.int(2, 15) * DAY), createdById: a.supervisor },
      });
    }
  }
  await rootDb.sequence.upsert({ where: { tenantId_key: { tenantId, key: "activity" } }, create: { tenantId, key: "activity", prefix: "", padding: 5, nextValue: activities.length + 1 }, update: { nextValue: activities.length + 1 } });
  console.log(`   ✓ ${slotIds.length} حصة في الجداول، ${assignments.length} إسناداً، ${progress.length} درساً منجزاً، ${activities.length} أنشطة`);
}
