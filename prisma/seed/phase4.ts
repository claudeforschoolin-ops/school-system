/**
 * بذور المرحلة ٤ (التقييم والموارد البشرية والرواتب) — كلها عبر الخدمات نفسها:
 * - الهيكل التنظيمي والورديات وملفات الموظفين (بمن فيهم غير المستخدمين: سائقون وحراس وعمال)
 *   وعقودهم ورواتبهم، وحضور سبتمبر مستورداً من «جهاز البصمة»، وإجازات بموافقات، وسلف وبنود متغيرة
 * - التوظيف (وظائف ومرشحون بالمراحل وتعيين فعلي)، تقييم الأداء (دورة سابقة مغلقة ودورة جارية)
 * - نهاية خدمة معتمدة ومصروفة (مع إيقاف الحساب وإعادة الإسناد) وأخرى بانتظار الاعتماد
 * - مسير سبتمبر: رفع ← مراجعة الموارد البشرية ← اعتماد المدير ← قيد تلقائي (بانتظار الصرف)
 * - اختبارات الفترة الأولى: جدولة ولجان ومحاضر، ثم كشوف الرصد وبنود التقويم المستمر ودرجاتها
 *   ومسار الاعتماد، وطلب تعديل درجة معتمدة، وتقارير متابعة ونشرها للأسر
 * كل الأسماء والهويات والجوالات والآيبانات وهمية.
 */
import "dotenv/config";
import { rootDb } from "../../src/server/db/client";
import { createTenantDb, type TenantDb } from "../../src/server/db/tenant";
import { createSession, validateSessionToken, type SessionData } from "../../src/server/auth/session";
import { decideApproval } from "../../src/server/services/approval.service";
import { toISODate } from "../../src/lib/dates";
import { workingDays } from "../../src/lib/hr/calc";
import * as emp from "../../src/server/services/hr/employees.service";
import * as time from "../../src/server/services/hr/time.service";
import * as payroll from "../../src/server/services/hr/payroll.service";
import * as recruitment from "../../src/server/services/hr/recruitment.service";
import * as perf from "../../src/server/services/hr/performance.service";
import * as eos from "../../src/server/services/hr/eos.service";
import * as exams from "../../src/server/services/assessment/exams.service";
import * as grades from "../../src/server/services/assessment/grades.service";
import * as results from "../../src/server/services/assessment/results.service";
import { PEOPLE } from "./data/people";
import { fakeNationalId, rng, type Rng } from "./data/students-data";

const SAR = (riyals: number) => riyals * 100;

interface Actor {
  session: SessionData;
  db: TenantDb;
}
const actors = new Map<string, Actor>();
async function actor(tenantId: string, email: string): Promise<Actor> {
  const cached = actors.get(email);
  if (cached) return cached;
  const user = await rootDb.user.findFirstOrThrow({ where: { tenantId, email } });
  const { token } = await createSession({ tenantId, userId: user.id, twoFactorVerified: true, ip: null, userAgent: "seed" });
  const session = await validateSessionToken(token);
  if (!session) throw new Error(`تعذرت جلسة ${email}`);
  const a = { session, db: createTenantDb({ tenantId, actor: { id: user.id, name: user.name }, ip: null, userAgent: "seed" }) };
  actors.set(email, a);
  return a;
}

/** اعتماد كل خطوات طلب موافقة بالتتابع بالمعتمدين المعطين */
async function approveAll(tenantId: string, requestId: string | null, emails: string[], decision: "APPROVED" | "REJECTED" = "APPROVED") {
  if (!requestId) throw new Error("لا طلب موافقة");
  for (const email of emails) {
    const a = await actor(tenantId, email);
    await decideApproval(a.db, a.session, { requestId, decision, comment: decision === "APPROVED" ? "معتمد" : "مرفوض" });
  }
}

/** آيبان سعودي وهمي بخانتي تحقق صحيحتين (MOD-97) */
function fakeIban(r: Rng) {
  const bank = r.pick(["80", "10", "45", "05", "20", "15"]);
  const acct = Array.from({ length: 18 }, () => r.int(0, 9)).join("");
  const bban = bank + acct;
  const digits = (bban + "SA00").replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return `SA${String(98 - rem).padStart(2, "0")}${bban}`;
}
const BANK_NAME: Record<string, string> = { "80": "مصرف الراجحي", "10": "البنك الأهلي السعودي", "45": "البنك السعودي الأول", "05": "مصرف الإنماء", "20": "بنك الرياض", "15": "بنك البلاد" };

let mobile = 0;
const phone = () => `0558${String(200000 + ++mobile).slice(-6)}`;

export async function seedPhase4(tenantId: string) {
  const r = rng(4404);
  const today = toISODate(new Date(), "Asia/Riyadh");
  const month = today.slice(0, 7);
  const hrm = await actor(tenantId, "hr.manager@demo.manassa.sa");
  const hro = await actor(tenantId, "hr@demo.manassa.sa");
  const users = await rootDb.user.findMany({ where: { tenantId }, select: { id: true, email: true, name: true } });
  const uid = (email: string) => users.find((u) => u.email === email)!.id;
  const branches = await rootDb.branch.findMany({ where: { tenantId } });
  const boys = branches.find((b) => b.code === "B1")!;
  const girls = branches.find((b) => b.code === "G1")!;

  // -------------------------------------------------------------------
  // الهيكل التنظيمي والورديات
  // -------------------------------------------------------------------
  console.log("   ⏳ الهيكل التنظيمي والموظفون...");
  const costCenters = await rootDb.costCenter.findMany({ where: { tenantId } });
  const ccOf = (branchId: string) => costCenters.find((c) => c.branchId === branchId)?.id ?? null;
  const dept = async (code: string, name: string, category: "ACADEMIC" | "ADMIN" | "SERVICES", parentId: string | null, costCenterId: string | null = null) => (await emp.saveDepartment(hrm.db, hrm.session, { code, name, category, parentId, headEmployeeId: null, costCenterId })).id;
  const D = {} as Record<string, string>;
  D.ADM = await dept("ADM", "الإدارة العليا", "ADMIN", null);
  D.ACD = await dept("ACD", "الشؤون التعليمية", "ACADEMIC", D.ADM);
  D.ACDB = await dept("ACD-B", "هيئة التدريس — البنين", "ACADEMIC", D.ACD, ccOf(boys.id));
  D.ACDG = await dept("ACD-G", "هيئة التدريس — البنات", "ACADEMIC", D.ACD, ccOf(girls.id));
  D.STU = await dept("STU", "شؤون الطلاب والإرشاد", "ADMIN", D.ADM);
  D.FIN = await dept("FIN", "الإدارة المالية", "ADMIN", D.ADM);
  D.HR = await dept("HR", "الموارد البشرية", "ADMIN", D.ADM);
  D.OPS = await dept("OPS", "الخدمات المساندة", "SERVICES", D.ADM);
  D.TRN = await dept("TRN", "النقل المدرسي", "SERVICES", D.OPS);
  const pos = async (departmentId: string, title: string, headcount: number) => (await emp.savePosition(hrm.db, hrm.session, { departmentId, title, headcount })).id;
  const P = {
    exec: await pos(D.ADM!, "المدير التنفيذي", 1),
    principal: await pos(D.ADM!, "مدير المدارس", 1),
    vp: await pos(D.ACD!, "وكيل شؤون أكاديمية", 2),
    vpStudents: await pos(D.STU!, "وكيل شؤون الطلاب", 2),
    teacherB: await pos(D.ACDB!, "معلم", 16),
    teacherG: await pos(D.ACDG!, "معلمة", 15),
    counselor: await pos(D.STU!, "مرشد/ة طلابي", 3),
    nurse: await pos(D.STU!, "ممرض/ة", 2),
    accountant: await pos(D.FIN!, "محاسب", 3),
    cashier: await pos(D.FIN!, "أمين صندوق", 1),
    hrManager: await pos(D.HR!, "مدير موارد بشرية", 1),
    hrOfficer: await pos(D.HR!, "أخصائي موارد بشرية", 2),
    admin: await pos(D.ADM!, "إداري", 6),
    it: await pos(D.OPS!, "فني تقنية معلومات", 1),
    guard: await pos(D.OPS!, "حارس أمن", 4),
    cleaner: await pos(D.OPS!, "عامل نظافة", 6),
    maint: await pos(D.OPS!, "فني صيانة", 2),
    driver: await pos(D.TRN!, "سائق حافلة", 6),
  };
  await time.saveShift(hrm.db, hrm.session, { name: "الدوام الصباحي", startTime: "06:45", endTime: "13:30", graceMinutes: 10, workDays: [0, 1, 2, 3, 4], isDefault: true });
  const services = await time.saveShift(hrm.db, hrm.session, { name: "دوام الخدمات والنقل", startTime: "05:45", endTime: "14:30", graceMinutes: 10, workDays: [0, 1, 2, 3, 4], isDefault: false });
  await time.listLeaveTypes(hrm.db, hrm.session);

  // -------------------------------------------------------------------
  // الموظفون والعقود
  // -------------------------------------------------------------------
  type Spec = { key: string; email?: string; name: string; gender: "MALE" | "FEMALE"; nationality: string; category: "ACADEMIC" | "ADMIN" | "SERVICES"; dept: string; position: string; branch: string | null; basic: number; hire: string; managerKey?: string; shift?: string; sponsor?: string };
  // المدير التنفيذي للمجموعة يُصرف راتبه من الشركة القابضة، فلا يدخل مسير المدرسة
  const people = PEOPLE.filter((p) => !["PARENT", "STUDENT", "OWNER"].includes(p.role));
  const female = (name: string) => / بنت /.test(name);
  const hireFor = () => `${r.int(2013, 2025)}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`;
  const specs: Spec[] = people.map((p) => {
    const g = female(p.name) ? "FEMALE" : "MALE";
    const branch = p.branch === "BOYS" ? boys.id : p.branch === "GIRLS" ? girls.id : null;
    const base: Omit<Spec, "dept" | "position" | "basic" | "category" | "managerKey"> = { key: p.key, email: p.email, name: p.name.replace(/^(أ\.|م\.)\s*/, ""), gender: g, nationality: "SA", branch, hire: hireFor() };
    switch (p.role) {
      case "OWNER":
        return { ...base, category: "ADMIN", dept: D.ADM!, position: P.exec, basic: 30000, hire: "2012-09-01" };
      case "PRINCIPAL":
        return { ...base, category: "ADMIN", dept: D.ADM!, position: P.principal, basic: 19000, hire: "2015-08-16" };
      case "VP_ACADEMIC":
        return { ...base, category: "ACADEMIC", dept: D.ACD!, position: P.vp, basic: 13000, managerKey: "principal" };
      case "VP_STUDENTS":
        return { ...base, category: "ADMIN", dept: D.STU!, position: P.vpStudents, basic: 12500, managerKey: "principal" };
      case "TEACHER":
        return { ...base, category: "ACADEMIC", dept: p.branch === "GIRLS" ? D.ACDG! : D.ACDB!, position: p.branch === "GIRLS" ? P.teacherG : P.teacherB, basic: r.int(11, 16) * 500, managerKey: p.branch === "GIRLS" ? "vpAcademic" : "vpStudents" };
      case "COUNSELOR":
        return { ...base, category: "ADMIN", dept: D.STU!, position: /ممرضة/.test(p.jobTitle) ? P.nurse : P.counselor, basic: r.int(13, 16) * 500, managerKey: "vpAcademic" };
      case "ACCOUNTANT":
        return { ...base, category: "ADMIN", dept: D.FIN!, position: P.accountant, basic: p.key === "accountant" ? 11000 : 7000, managerKey: p.key === "accountant" ? "principal" : "accountant" };
      case "CASHIER":
        return { ...base, category: "ADMIN", dept: D.FIN!, position: P.cashier, basic: 6000, managerKey: "accountant" };
      case "HR_MANAGER":
        return { ...base, category: "ADMIN", dept: D.HR!, position: P.hrManager, basic: 12000, managerKey: "principal" };
      case "HR_OFFICER":
        return { ...base, category: "ADMIN", dept: D.HR!, position: P.hrOfficer, basic: 7500, managerKey: "hrManager" };
      case "FACILITIES":
        return { ...base, category: "SERVICES", dept: D.OPS!, position: /تقنية/.test(p.jobTitle) ? P.it : P.maint, basic: /تقنية/.test(p.jobTitle) ? 7000 : 8500, managerKey: /تقنية/.test(p.jobTitle) ? "facilities" : "principal", shift: services.id };
      case "RECEPTION":
        return { ...base, category: /أمن/.test(p.jobTitle) ? "SERVICES" : "ADMIN", dept: /أمن/.test(p.jobTitle) ? D.OPS! : D.ADM!, position: /أمن/.test(p.jobTitle) ? P.guard : P.admin, basic: /أمن/.test(p.jobTitle) ? 6000 : 5500, managerKey: /أمن/.test(p.jobTitle) ? "facilities" : "principal" };
      default:
        return { ...base, category: "ADMIN", dept: D.ADM!, position: P.admin, basic: r.int(11, 14) * 500, managerKey: "principal" };
    }
  });
  // موظفون بلا حسابات دخول: معلمون متعاقدون، سائقون، حراس، عمال نظافة، فنيون
  const extra: Array<Omit<Spec, "key"> & { key: string }> = [
    { key: "x01", name: "محمود عبدالفتاح السيد", gender: "MALE", nationality: "EG", category: "ACADEMIC", dept: D.ACDB!, position: P.teacherB, branch: boys.id, basic: 6500, hire: "2019-09-01", managerKey: "vpStudents", sponsor: "مدارس منصة الأهلية" },
    { key: "x02", name: "رنا خليل الحوراني", gender: "FEMALE", nationality: "JO", category: "ACADEMIC", dept: D.ACDG!, position: P.teacherG, branch: girls.id, basic: 6000, hire: "2021-08-20", managerKey: "vpAcademic", sponsor: "مدارس منصة الأهلية" },
    { key: "x03", name: "هالة عبدالمنعم عثمان", gender: "FEMALE", nationality: "SD", category: "ACADEMIC", dept: D.ACDG!, position: P.teacherG, branch: girls.id, basic: 5800, hire: "2022-08-21", managerKey: "vpAcademic", sponsor: "مدارس منصة الأهلية" },
    { key: "d01", name: "عبدالرحيم عثمان إدريس", gender: "MALE", nationality: "SD", category: "SERVICES", dept: D.TRN!, position: P.driver, branch: null, basic: 2800, hire: "2018-01-10", managerKey: "transport", shift: services.id, sponsor: "مدارس منصة الأهلية" },
    { key: "d02", name: "محمد أكرم خان", gender: "MALE", nationality: "PK", category: "SERVICES", dept: D.TRN!, position: P.driver, branch: null, basic: 2600, hire: "2020-09-05", managerKey: "transport", shift: services.id, sponsor: "مدارس منصة الأهلية" },
    { key: "d03", name: "سعيد عوض بامطرف", gender: "MALE", nationality: "YE", category: "SERVICES", dept: D.TRN!, position: P.driver, branch: null, basic: 2700, hire: "2016-02-14", managerKey: "transport", shift: services.id, sponsor: "مدارس منصة الأهلية" },
    { key: "d04", name: "ضيف الله مبارك العتيبي", gender: "MALE", nationality: "SA", category: "SERVICES", dept: D.TRN!, position: P.driver, branch: null, basic: 4500, hire: "2023-08-15", managerKey: "transport", shift: services.id },
    { key: "g01", name: "مفرح سالم الشهراني", gender: "MALE", nationality: "SA", category: "SERVICES", dept: D.OPS!, position: P.guard, branch: boys.id, basic: 4200, hire: "2017-05-01", managerKey: "facilities", shift: services.id },
    { key: "g02", name: "عايض محمد القحطاني", gender: "MALE", nationality: "SA", category: "SERVICES", dept: D.OPS!, position: P.guard, branch: girls.id, basic: 4200, hire: "2022-03-12", managerKey: "facilities", shift: services.id },
    { key: "c01", name: "راجيش كومار ناير", gender: "MALE", nationality: "IN", category: "SERVICES", dept: D.OPS!, position: P.cleaner, branch: boys.id, basic: 1800, hire: "2019-10-01", managerKey: "facilities", shift: services.id, sponsor: "مدارس منصة الأهلية" },
    { key: "c02", name: "جون ريي سانتوس", gender: "MALE", nationality: "PH", category: "SERVICES", dept: D.OPS!, position: P.cleaner, branch: boys.id, basic: 1800, hire: "2021-01-15", managerKey: "facilities", shift: services.id, sponsor: "مدارس منصة الأهلية" },
    { key: "c03", name: "ماريا لوردس ديلا كروز", gender: "FEMALE", nationality: "PH", category: "SERVICES", dept: D.OPS!, position: P.cleaner, branch: girls.id, basic: 1800, hire: "2020-02-01", managerKey: "facilities", shift: services.id, sponsor: "مدارس منصة الأهلية" },
    { key: "c04", name: "أمينة بيغوم رحمن", gender: "FEMALE", nationality: "IN", category: "SERVICES", dept: D.OPS!, position: P.cleaner, branch: girls.id, basic: 1800, hire: "2023-09-10", managerKey: "facilities", shift: services.id, sponsor: "مدارس منصة الأهلية" },
    { key: "m01", name: "عبدالقادر حسين يوسف", gender: "MALE", nationality: "EG", category: "SERVICES", dept: D.OPS!, position: P.maint, branch: null, basic: 3500, hire: "2014-06-01", managerKey: "facilities", shift: services.id, sponsor: "مدارس منصة الأهلية" },
  ];
  const all = [...specs, ...extra];
  const E: Record<string, { id: string; userId: string | null; spec: Spec }> = {};
  for (const [i, s] of all.entries()) {
    const saudi = s.nationality === "SA";
    const iban = fakeIban(r);
    // وثائق: معظمها سارية، وبعضها قريب الانتهاء أو منتهٍ لعرض التنبيهات
    const expiry = s.key === "d02" ? addDays(today, 21) : s.key === "x02" ? addDays(today, -6) : s.key === "c04" ? addDays(today, 48) : `${r.int(2028, 2031)}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`;
    const created = await emp.createEmployee(hrm.db, hrm.session, {
      fullName: s.name,
      gender: s.gender,
      birthDate: `${r.int(1972, 1998)}-${String(r.int(1, 12)).padStart(2, "0")}-${String(r.int(1, 28)).padStart(2, "0")}`,
      nationality: s.nationality,
      maritalStatus: r.chance(0.7) ? "متزوج" : "أعزب",
      idType: saudi ? "NATIONAL_ID" : "IQAMA",
      nationalId: fakeNationalId(r, saudi ? "1" : "2"),
      idExpiry: expiry,
      passportNumber: saudi ? null : `${s.nationality}${r.int(1000000, 9999999)}`,
      passportExpiry: saudi ? null : s.key === "c02" ? addDays(today, 35) : `${r.int(2027, 2032)}-0${r.int(1, 9)}-1${r.int(0, 9)}`,
      phone: phone(),
      email: s.email ?? null,
      address: `الرياض — ${r.pick(["حي النرجس", "حي الياسمين", "حي الملقا", "حي العارض", "حي القيروان", "حي الصحافة"])}`,
      branchId: s.branch,
      departmentId: s.dept,
      positionId: s.position,
      managerId: null,
      category: s.category,
      hireDate: s.hire,
      bankName: BANK_NAME[iban.slice(4, 6)] ?? "مصرف الراجحي",
      iban,
      sponsor: s.sponsor ?? null,
      shiftId: s.shift ?? null,
      gosiRegistered: true,
      qualifications: s.category === "ACADEMIC" ? [{ degree: r.chance(0.25) ? "ماجستير" : "بكالوريوس", major: "تربية وتعليم", institution: r.pick(["جامعة الملك سعود", "جامعة الإمام محمد بن سعود", "جامعة الأميرة نورة", "جامعة أم القرى", "جامعة القاهرة"]), year: String(r.int(1998, 2018)) }] : [],
      experiences: [],
      notes: null,
    });
    const userId = s.email ? uid(s.email) : null;
    if (userId) await emp.linkUser(hrm.db, hrm.session, { employeeId: created.id, userId });
    const housing = Math.round((s.basic * 25) / 100 / 50) * 50;
    const transport = s.category === "SERVICES" && !saudi ? 300 : s.basic >= 12000 ? 1500 : 800;
    await emp.saveContract(hrm.db, hrm.session, {
      employeeId: created.id,
      type: saudi && i % 3 === 0 ? "UNLIMITED" : "FIXED",
      startDate: s.hire,
      endDate: saudi && i % 3 === 0 ? null : s.key === "d02" ? addDays(today, 1) : s.key === "x03" ? `${Number(today.slice(0, 4))}-11-15` : `${Number(today.slice(0, 4)) + r.int(1, 2)}-08-31`,
      probationEnd: null,
      basicMinor: SAR(s.basic),
      housingMinor: SAR(housing),
      transportMinor: SAR(transport),
      otherAllowances: s.category === "ACADEMIC" && s.basic >= 9000 ? [{ name: "بدل تميز", amountMinor: SAR(500) }] : [],
      hoursPerDay: s.category === "SERVICES" ? 8 : 7,
      annualLeaveDays: s.basic >= 12000 ? 30 : 21,
    });
    E[s.key] = { id: created.id, userId, spec: s };
  }
  // المدير المباشر ورؤساء الأقسام
  for (const s of all) {
    if (!s.managerKey || !E[s.managerKey]) continue;
    await rootDb.employee.update({ where: { id: E[s.key]!.id }, data: { managerId: E[s.managerKey]!.id } });
  }
  const heads: Record<string, string> = { ADM: "principal", ACD: "vpAcademic", ACDB: "vpStudents", ACDG: "vpAcademic", STU: "vpStudents", FIN: "accountant", HR: "hrManager", OPS: "facilities", TRN: "transport" };
  for (const [k, v] of Object.entries(heads)) if (E[v]) await rootDb.department.update({ where: { id: D[k]! }, data: { headEmployeeId: E[v]!.id } });

  // -------------------------------------------------------------------
  // التوظيف: وظائف ومرشحون، وتعيين فعلي في منتصف سبتمبر
  // -------------------------------------------------------------------
  console.log("   ⏳ التوظيف والإجازات والسلف...");
  const op1 = await recruitment.saveOpening(hrm.db, hrm.session, { title: "معلم رياضيات — المرحلة الثانوية (بنين)", departmentId: D.ACDB!, positionId: P.teacherB, branchId: boys.id, description: "تدريس الرياضيات للصفوف الثانوية وفق المناهج المطورة.", requirements: "بكالوريوس رياضيات، رخصة مهنية، خبرة سنتين فأكثر.", openings: 1, status: "OPEN", closingDate: addDays(today, -20) });
  const op2 = await recruitment.saveOpening(hrm.db, hrm.session, { title: "معلمة لغة إنجليزية — المرحلة الابتدائية", departmentId: D.ACDG!, positionId: P.teacherG, branchId: girls.id, description: "تدريس اللغة الإنجليزية للصفوف العليا.", requirements: "بكالوريوس لغة إنجليزية، اختبار IELTS ٦٫٥ فأكثر.", openings: 2, status: "OPEN", closingDate: addDays(today, 25) });
  await recruitment.saveOpening(hrm.db, hrm.session, { title: "حارس أمن — فرع البنات", departmentId: D.OPS!, positionId: P.guard, branchId: girls.id, description: null, requirements: "سعودي الجنسية، لياقة بدنية.", openings: 1, status: "ON_HOLD", closingDate: null });
  const apps: Array<{ opening: string; name: string; g: "MALE" | "FEMALE"; stage: "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER" | "REJECTED"; exp: number; rating?: number; offer?: number; q: string }> = [
    { opening: op1.id, name: "أحمد بن صالح الغامدي", g: "MALE", stage: "OFFER", exp: 5, rating: 5, offer: 9000, q: "بكالوريوس رياضيات — جامعة الملك سعود" },
    { opening: op1.id, name: "خالد بن عيد المطيري", g: "MALE", stage: "INTERVIEW", exp: 3, rating: 4, q: "بكالوريوس رياضيات" },
    { opening: op1.id, name: "ياسر بن محمد الزهراني", g: "MALE", stage: "REJECTED", exp: 1, rating: 2, q: "دبلوم" },
    { opening: op1.id, name: "مروان بن علي الشهري", g: "MALE", stage: "SCREENING", exp: 2, q: "بكالوريوس رياضيات تطبيقية" },
    { opening: op2.id, name: "نجلاء بنت سعد العمري", g: "FEMALE", stage: "OFFER", exp: 4, rating: 4, offer: 7500, q: "بكالوريوس لغة إنجليزية — IELTS 7" },
    { opening: op2.id, name: "ريما بنت فهد الدوسري", g: "FEMALE", stage: "INTERVIEW", exp: 6, rating: 5, q: "ماجستير تعليم لغة إنجليزية" },
    { opening: op2.id, name: "أروى بنت ناصر القحطاني", g: "FEMALE", stage: "INTERVIEW", exp: 2, rating: 3, q: "بكالوريوس لغة إنجليزية" },
    { opening: op2.id, name: "سلمى بنت عبدالله الحربي", g: "FEMALE", stage: "SCREENING", exp: 0, q: "بكالوريوس ترجمة" },
    { opening: op2.id, name: "جنى بنت خالد السبيعي", g: "FEMALE", stage: "APPLIED", exp: 1, q: "بكالوريوس لغة إنجليزية" },
    { opening: op2.id, name: "لمى بنت سليمان الرشيدي", g: "FEMALE", stage: "APPLIED", exp: 3, q: "بكالوريوس أدب إنجليزي" },
  ];
  let hiredAppId: string | null = null;
  for (const [i, a] of apps.entries()) {
    const created = await recruitment.saveApplication(hrm.db, hrm.session, { openingId: a.opening, fullName: a.name, email: null, phone: phone(), nationality: "SA", gender: a.g, qualification: a.q, experienceYears: a.exp, rating: a.rating ?? null, interviewAt: a.stage === "INTERVIEW" ? new Date(`${addDays(today, 2 + i)}T09:00:00+03:00`) : null, offerSalaryMinor: a.offer ? SAR(a.offer) : null, notes: a.stage === "REJECTED" ? "لم يستوفِ متطلب الخبرة" : null });
    const order = ["APPLIED", "SCREENING", "INTERVIEW", "OFFER"] as const;
    const target = a.stage === "REJECTED" ? 2 : order.indexOf(a.stage);
    for (let k = 1; k <= target; k++) await recruitment.moveApplication(hrm.db, hrm.session, { id: created.id, stage: order[k]!, position: i });
    if (a.stage === "REJECTED") await recruitment.moveApplication(hrm.db, hrm.session, { id: created.id, stage: "REJECTED", position: i });
    if (i === 0) hiredAppId = created.id;
  }
  const hiredDate = `${month}-14`;
  const hired = await recruitment.hire(hrm.db, hrm.session, { applicationId: hiredAppId!, hireDate: hiredDate, category: "ACADEMIC", departmentId: D.ACDB!, positionId: P.teacherB, branchId: boys.id, managerId: E.vpStudents!.id, basicMinor: SAR(9000), housingMinor: SAR(2250), transportMinor: SAR(800), contractType: "FIXED", contractMonths: 24 });
  // الموارد البشرية تستكمل الملف (الهوية والآيبان)
  const hiredIban = fakeIban(r);
  await emp.updateEmployee(hrm.db, hrm.session, hired.id, { fullName: hired.fullName, gender: "MALE", birthDate: "1994-03-11", nationality: "SA", maritalStatus: "متزوج", idType: "NATIONAL_ID", nationalId: fakeNationalId(r, "1"), idExpiry: "2030-05-20", passportNumber: null, passportExpiry: null, phone: hired.phone, email: null, address: "الرياض — حي العارض", branchId: boys.id, departmentId: D.ACDB!, positionId: P.teacherB, managerId: E.vpStudents!.id, category: "ACADEMIC", hireDate: hiredDate, bankName: BANK_NAME[hiredIban.slice(4, 6)] ?? null, iban: hiredIban, sponsor: null, shiftId: null, gosiRegistered: true, qualifications: [{ degree: "بكالوريوس", major: "رياضيات", institution: "جامعة الملك سعود", year: "2016" }], experiences: [{ employer: "مدارس الرواد الأهلية", title: "معلم رياضيات", from: "2019", to: "2026" }], notes: null });

  // -------------------------------------------------------------------
  // الإجازات (بطلب الموظف نفسه وموافقة المدير ثم الموارد البشرية)
  // -------------------------------------------------------------------
  const types = await rootDb.leaveType.findMany({ where: { tenantId } });
  const lt = (code: string) => types.find((t) => t.code === code)!.id;
  const leave = async (key: string, code: string, start: string, end: string, reason: string, approvers: string[] | null) => {
    const e = E[key]!;
    const email = e.spec.email!;
    const a = await actor(tenantId, email);
    const req = await time.requestLeave(a.db, a.session, { leaveTypeId: lt(code), startDate: start, endDate: end, reason });
    if (approvers) await approveAll(tenantId, req.approvalRequestId, approvers);
    return req;
  };
  const sepWork = workingDays(`${month}-01`, today, [0, 1, 2, 3, 4]);
  await leave("t14", "ANNUAL", sepWork[8]!, sepWork[9]!, "ظروف عائلية — سفر لحضور زواج", ["vp.academic@demo.manassa.sa", "hr.manager@demo.manassa.sa"]);
  await leave("s01", "UNPAID", sepWork[4]!, sepWork[5]!, "إجازة بدون راتب لمرافقة والدتي", ["principal@demo.manassa.sa", "hr.manager@demo.manassa.sa"]);
  await leave("t05", "EMERGENCY", sepWork[12]!, sepWork[12]!, "حالة طارئة", ["vp.students@demo.manassa.sa", "hr.manager@demo.manassa.sa"]);
  await leave("t02", "EMERGENCY", addDays(today, 1), addDays(today, 1), "مراجعة أحوال مدنية", ["vp.students@demo.manassa.sa"]); // بانتظار الموارد البشرية
  await leave("teacher", "ANNUAL", nextWorkday(addDays(today, 19)), nextWorkday(addDays(today, 21)), "إجازة قصيرة", null); // بانتظار المدير المباشر
  await leave("t19", "ANNUAL", nextWorkday(addDays(today, 30)), nextWorkday(addDays(today, 33)), "رحلة عائلية", null);

  // -------------------------------------------------------------------
  // حضور سبتمبر (استيراد جهاز البصمة)؛ اليوم الوطني ٢٣ سبتمبر عطلة
  // -------------------------------------------------------------------
  console.log("   ⏳ حضور الموظفين (استيراد البصمة)...");
  const onLeave = await rootDb.staffLeaveRequest.findMany({ where: { tenantId, status: "APPROVED" } });
  const isOnLeave = (employeeId: string, d: string) => onLeave.some((l) => l.employeeId === employeeId && iso(l.startDate) <= d && iso(l.endDate) >= d);
  const hm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const rows: Array<{ number: number; date: string; checkIn: string | null; checkOut: string | null }> = [];
  const employees = await rootDb.employee.findMany({ where: { tenantId, deletedAt: null }, select: { id: true, number: true, hireDate: true, shiftId: true, userId: true } });
  const demoUsers = new Set(PEOPLE.filter((p) => p.demo).map((p) => uid(p.email)));
  const lateProne = new Set(employees.filter(() => r.chance(0.12)).map((e) => e.id));
  for (const e of employees) {
    const svc = e.shiftId === services.id;
    const [start, end] = svc ? [5 * 60 + 45, 14 * 60 + 30] : [6 * 60 + 45, 13 * 60 + 30];
    for (const d of sepWork) {
      if (d < iso(e.hireDate) || d === `${month}-23` || isOnLeave(e.id, d)) continue;
      if (e.id === E.s03!.id && d > sepWork[7]!) continue; // استقال وآخر يوم عمل له العاشر
      if (d === today && e.userId && demoUsers.has(e.userId)) continue; // يسجل المستخدم التجريبي حضوره بنفسه
      if (r.chance(0.018)) {
        rows.push({ number: e.number, date: d, checkIn: null, checkOut: null });
        continue;
      }
      const late = lateProne.has(e.id) && r.chance(0.35) ? r.int(12, 40) : 0;
      const inMin = start - r.int(0, 20) + late;
      const overtime = svc && e.id === E.d01!.id && r.chance(0.3) ? r.int(60, 120) : 0;
      const outMin = end + r.int(0, 15) + overtime;
      rows.push({ number: e.number, date: d, checkIn: hm(inMin), checkOut: d === today ? null : hm(outMin) });
    }
  }
  for (let i = 0; i < rows.length; i += 600) await time.importAttendance(hro.db, hro.session, rows.slice(i, i + 600));
  // عطلة اليوم الوطني
  if (`${month}-23` <= today) for (const e of employees) if (iso(e.hireDate) <= `${month}-23`) await time.setAttendance(hro.db, hro.session, { employeeId: e.id, date: `${month}-23`, status: "HOLIDAY", note: "اليوم الوطني السعودي" });

  // -------------------------------------------------------------------
  // السلف والبنود المتغيرة
  // -------------------------------------------------------------------
  const bankLedger = await rootDb.account.findFirstOrThrow({ where: { tenantId, systemKey: "BANK_DEFAULT" } });
  const bank = await rootDb.bankAccount.findFirstOrThrow({ where: { tenantId, accountId: bankLedger.id } });
  const t10 = await actor(tenantId, E.t10!.spec.email!);
  const loan = await payroll.requestLoan(t10.db, t10.session, { amountMinor: SAR(6000), installmentMinor: SAR(1000), startMonth: month, reason: "ظروف سكن طارئة" });
  await approveAll(tenantId, loan.approvalRequestId, ["hr.manager@demo.manassa.sa"]);
  await payroll.disburseLoan(hrm.db, hrm.session, { id: loan.id, bankAccountId: bank.id, date: `${month}-03` });
  const s02 = await actor(tenantId, E.s02!.spec.email!);
  await payroll.requestLoan(s02.db, s02.session, { amountMinor: SAR(3000), installmentMinor: SAR(750), startMonth: nextMonth(month), reason: "شراء جهاز حاسب شخصي" });
  const adj = async (key: string, kind: "BONUS" | "OVERTIME" | "PENALTY" | "DEDUCTION" | "ALLOWANCE", amount: number, hours: number | null, description: string) => payroll.saveAdjustment(hro.db, hro.session, { employeeId: E[key]!.id, month, kind, amountMinor: SAR(amount), hours, description });
  await adj("t13", "BONUS", 1500, null, "مكافأة تميز — مبادرة نادي الرياضيات");
  await adj("teacher", "BONUS", 1000, null, "مكافأة إعداد اختبارات الفترة الأولى");
  await adj("d01", "OVERTIME", 0, 10, "رحلات الأنشطة بعد الدوام");
  await adj("g02", "PENALTY", 200, null, "تكرار التأخر — إنذار ثانٍ");
  await adj("c01", "DEDUCTION", 350, null, "قيمة عهدة مفقودة (جهاز لاسلكي)");
  await adj("t16", "ALLOWANCE", 600, null, "بدل إشراف على المختبر");

  // -------------------------------------------------------------------
  // نهاية الخدمة: استقالة معتمدة ومصروفة (مع إيقاف الحساب)، وانتهاء عقد بانتظار الاعتماد
  // -------------------------------------------------------------------
  console.log("   ⏳ نهاية الخدمة ومسير الرواتب...");
  await rootDb.employee.update({ where: { id: E.s03!.id }, data: { hireDate: new Date("2021-03-01") } });
  await rootDb.employmentContract.updateMany({ where: { employeeId: E.s03!.id }, data: { startDate: new Date("2021-03-01") } });
  const resign = await eos.createSettlement(hro.db, hro.session, { employeeId: E.s03!.id, reason: "RESIGNATION", lastWorkingDay: sepWork[7]!, notes: "استقالة مقدمة قبل ٣٠ يوماً — انتقال لجهة حكومية" });
  await approveAll(tenantId, resign.approvalRequestId, ["hr.manager@demo.manassa.sa", "principal@demo.manassa.sa"]);
  await eos.payEos(hrm.db, hrm.session, { id: resign.id, bankAccountId: bank.id, date: addDays(sepWork[7]!, 4) });
  await eos.createSettlement(hro.db, hro.session, { employeeId: E.d03!.id, reason: "CONTRACT_END", lastWorkingDay: lastDayOf(month), notes: "عدم تجديد العقد — عودة نهائية" });

  // -------------------------------------------------------------------
  // مسير سبتمبر: رفع للاعتماد ← الموارد البشرية ← المدير ← القيد (بانتظار صرف المحاسب)
  // -------------------------------------------------------------------
  const run = await payroll.createRun(hro.db, hro.session, { month, notes: "مسير شهر سبتمبر — أول مسير على المنصة" });
  const submitted = await payroll.submitRun(hro.db, hro.session, run.id);
  await approveAll(tenantId, submitted.approvalRequestId, ["hr.manager@demo.manassa.sa", "principal@demo.manassa.sa"]);

  // -------------------------------------------------------------------
  // تقييم الأداء: الدورة السنوية السابقة (مغلقة) ودورة الفترة الأولى (جارية)
  // -------------------------------------------------------------------
  console.log("   ⏳ تقييم الأداء...");
  const [tpl] = await perf.templates(hrm.db, hrm.session);
  const past = await perf.createCycle(hrm.db, hrm.session, { name: "التقييم السنوي ١٤٤٧هـ (2025–2026)", templateId: tpl!.id, startDate: "2026-05-01", endDate: "2026-06-10" });
  const pastReviews = await rootDb.performanceReview.findMany({ where: { cycleId: past.cycle.id } });
  for (const rv of pastReviews) {
    const reviewer = rv.reviewerId ? users.find((u) => u.id === rv.reviewerId)?.email : "hr.manager@demo.manassa.sa";
    const a = await actor(tenantId, reviewer ?? "hr.manager@demo.manassa.sa");
    const level = r.int(3, 5);
    const scores = Object.fromEntries(tpl!.criteria.map((c) => [c.key, Math.max(1, Math.min(5, level + r.int(-1, 1)))]));
    await perf.submitManager(a.db, a.session, { id: rv.id, scores, comment: level >= 5 ? "أداء متميز ومبادرات واضحة" : level >= 4 ? "أداء جيد جداً مع فرص للتطوير" : "يلبي التوقعات؛ نوصي ببرنامج تطوير مهني" });
  }
  await perf.closeCycle(hrm.db, hrm.session, past.cycle.id);
  const current = await perf.createCycle(hrm.db, hrm.session, { name: "تقييم الفترة الأولى ١٤٤٨هـ", templateId: tpl!.id, startDate: `${month}-20`, endDate: addDays(today, 30) });
  const curReviews = await rootDb.performanceReview.findMany({ where: { cycleId: current.cycle.id } });
  let done = 0;
  for (const rv of curReviews) {
    const e = Object.values(E).find((x) => x.id === rv.employeeId);
    if (!e?.spec.email || e.spec.key === "teacher" || !/^t\d/.test(e.spec.key)) continue;
    const a = await actor(tenantId, e.spec.email);
    const scores = Object.fromEntries(tpl!.criteria.map((c) => [c.key, r.int(3, 5)]));
    await perf.submitSelf(a.db, a.session, { id: rv.id, scores, goals: [{ title: "رفع متوسط تحصيل طلابي", target: "٥٪ عن الفترة السابقة", progressBp: r.int(2, 6) * 1000 }, { title: "حضور برنامج تطوير مهني", target: "برنامجان في الفصل", progressBp: 5000 }], comment: "ملتزم بخطة التطوير" });
    if (done++ % 3 === 0 && rv.reviewerId) {
      const m = await actor(tenantId, users.find((u) => u.id === rv.reviewerId)!.email);
      await perf.submitManager(m.db, m.session, { id: rv.id, scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, Math.max(1, Math.min(5, v + r.int(-1, 0)))])), comment: "أداء جيد في بداية العام" });
    }
  }

  await seedAssessment(tenantId, r, today);
}

// =====================================================================
// التقييم: اختبارات الفترة الأولى، التقويم المستمر، الاعتماد، التقارير
// =====================================================================

async function seedAssessment(tenantId: string, r: Rng, today: string) {
  console.log("   ⏳ الاختبارات والدرجات...");
  const month = today.slice(0, 7);
  const subjects = await rootDb.subject.findMany({ where: { tenantId } });
  const sub = (code: string) => subjects.find((s) => s.code === code)?.id;
  const users = await rootDb.user.findMany({ where: { tenantId }, select: { id: true, email: true } });
  const uid = (email: string) => users.find((u) => u.email === email)!.id;
  // رؤساء الأقسام
  const tenant = await rootDb.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const settings = (tenant.settings ?? {}) as Record<string, unknown>;
  const heads: Record<string, string> = Object.fromEntries(
    [
      [sub("MATH"), uid("teacher@demo.manassa.sa")],
      [sub("ARB"), uid("h.alsudairi@demo.manassa.sa")],
      [sub("SCI"), uid("sh.alghamdi@demo.manassa.sa")],
      [sub("ENG"), uid("o.bawazir@demo.manassa.sa")],
    ].filter((x): x is [string, string] => Boolean(x[0])),
  );
  await rootDb.tenant.update({ where: { id: tenantId }, data: { settings: { ...settings, assessment: { ...((settings.assessment as object) ?? {}), subjectHeads: heads, withholdOnDebt: true, atRiskBp: 6500, reportCardFooter: "نشكر لكم متابعتكم، ونرحب بالتواصل مع رائد الفصل عبر المنصة." } } } });
  actors.clear(); // إعادة تحميل الجلسات بالإعدادات الجديدة

  const pa = await actor(tenantId, "principal@demo.manassa.sa");
  const year = await rootDb.academicYear.findFirstOrThrow({ where: { tenantId, isCurrent: true } });
  const term = await rootDb.term.findFirstOrThrow({ where: { tenantId, academicYearId: year.id, order: 1 } });
  const gradesList = await rootDb.grade.findMany({ where: { tenantId }, include: { stage: true }, orderBy: [{ stage: { order: "asc" } }, { order: "asc" }] });

  // اختبارات الفترة الأولى: أسبوعان (الأسبوعان الثالث والرابع)
  const exam = await exams.createExam(pa.db, pa.session, { termId: term.id, title: "اختبارات الفترة الأولى", kind: "MIDTERM", componentKey: "midterm", gradeIds: gradesList.map((g) => g.id), branchId: null, startDate: `${month}-06`, endDate: `${month}-17`, instructions: "الحضور قبل بدء الجلسة بـ١٥ دقيقة، ويُمنع إدخال الجوال إلى اللجنة." });
  const skip = ["PE", "ART", "LIFE"].map(sub).filter((x): x is string => Boolean(x));
  await exams.autoSchedule(pa.db, pa.session, { examId: exam.id, startTime: "07:30", durationMin: 90, maxTenths: 200, excludeSubjectIds: skip });
  await exams.autoCommittees(pa.db, pa.session, { examId: exam.id, capacity: 18, invigilatorsPerCommittee: 2, interleaveGrades: true, firstSeat: 1001 });
  // محاضر المراقبة لكل جلسة ولجنة فيها طلاب الصف
  const sessions = await rootDb.examSession.findMany({ where: { examId: exam.id } });
  const committees = await rootDb.examCommittee.findMany({ where: { examId: exam.id }, include: { seats: true } });
  const studentGrade = new Map((await rootDb.student.findMany({ where: { tenantId, status: "ACTIVE" }, select: { id: true, gradeId: true } })).map((s) => [s.id, s.gradeId]));
  for (const s of sessions) {
    for (const c of committees) {
      const seated = c.seats.filter((x) => studentGrade.get(x.studentId) === s.gradeId).map((x) => x.studentId);
      if (!seated.length) continue;
      const absent = seated.filter(() => r.chance(0.025));
      const incident = r.chance(0.04) ? [{ studentId: r.pick(seated), kind: r.pick(["حيازة جوال", "إخلال بالنظام"]), note: "سُلّم للوكيل" }] : [];
      await exams.saveInvigilationReport(pa.db, pa.session, { sessionId: s.id, committeeId: c.id, absentStudentIds: absent, incidents: incident, notes: null });
    }
    await exams.createSheetsFromSession(pa.db, pa.session, s.id);
  }

  // بنود التقويم المستمر لكل كشف (بمعلم المادة)
  console.log("   ⏳ التقويم المستمر ورصد الدرجات...");
  const assignments = await rootDb.teacherAssignment.findMany({ where: { tenantId, academicYearId: year.id }, include: { section: true } });
  const ability = new Map<string, number>();
  const students = await rootDb.student.findMany({ where: { tenantId, status: "ACTIVE", deletedAt: null }, select: { id: true, sectionId: true } });
  for (const s of students) ability.set(s.id, r.int(48, 99));
  const score = (sid: string, max: number) => {
    const a = ability.get(sid) ?? 75;
    const pct = Math.max(0, Math.min(100, a + r.int(-12, 10)));
    return Math.round((pct * max) / 100);
  };
  const teacherEmail = new Map(users.map((u) => [u.id, u.email]));
  for (const as of assignments) {
    const email = teacherEmail.get(as.teacherId);
    if (!email) continue;
    const t = await actor(tenantId, email);
    const secStudents = students.filter((s) => s.sectionId === as.sectionId);
    if (!secStudents.length) continue;
    const items: Array<[string, string, number]> = [
      ["classwork", "المشاركة والتفاعل — الأسابيع ١–٥", 100],
      ["homework", "الواجبات — الأسابيع ١–٥", 100],
    ];
    if (!skip.includes(as.subjectId)) items.push(["quizzes", "اختبار قصير ١", 100]);
    else items.push(["project", "مهمة أدائية ١", 100]);
    for (const [component, title, max] of items) {
      const a = await grades.createAssessment(t.db, t.session, { sectionId: as.sectionId, subjectId: as.subjectId, termId: term.id, componentKey: component, title, maxTenths: max, date: `${month}-${component === "quizzes" ? "22" : "24"}` });
      await grades.saveMarks(t.db, t.session, { assessmentId: a.id, marks: secStudents.map((s) => ({ studentId: s.id, scoreTenths: score(s.id, max), absent: false, excused: false })) });
    }
    // درجات الاختبار (غير الغائبين)
    const examSheet = await rootDb.assessment.findFirst({ where: { tenantId, sectionId: as.sectionId, subjectId: as.subjectId, examSessionId: { not: null } }, include: { marks: true } });
    if (examSheet) {
      const absent = new Set(examSheet.marks.filter((m) => m.absent).map((m) => m.studentId));
      await grades.saveMarks(t.db, t.session, { assessmentId: examSheet.id, marks: secStudents.filter((s) => !absent.has(s.id)).map((s) => ({ studentId: s.id, scoreTenths: score(s.id, examSheet.maxTenths), absent: false, excused: false })) });
    }
  }

  // مسار الاعتماد: الإرسال (المعلم) ← المراجعة (رئيس القسم) ← الاعتماد (وكيلة البنات / المدير للبنين)
  console.log("   ⏳ مسار اعتماد الدرجات والتقارير...");
  const demoTeacher = uid("teacher@demo.manassa.sa");
  const sheets = await rootDb.assessment.findMany({ where: { tenantId, termId: term.id }, include: { marks: true } });
  const sectionBranch = new Map((await rootDb.section.findMany({ where: { tenantId } })).map((s) => [s.id, s.branchId]));
  const girlsBranch = (await rootDb.branch.findFirstOrThrow({ where: { tenantId, code: "G1" } })).id;
  const vpAcademic = await actor(tenantId, "vp.academic@demo.manassa.sa");
  const byTeacher = new Map<string, string[]>();
  for (const s of sheets) byTeacher.set(s.teacherId ?? "", [...(byTeacher.get(s.teacherId ?? "") ?? []), s.id]);
  const mathId = sub("MATH");
  // فصول أبناء وليّ الأمر التجريبي تكتمل ليرى تقاريرهم
  const parentUser = uid("parent@demo.manassa.sa");
  const familySections = new Set((await rootDb.student.findMany({ where: { tenantId, guardians: { some: { guardian: { userId: parentUser } } } }, select: { sectionId: true } })).map((s) => s.sectionId));
  const open = (s: { sectionId: string }) => !familySections.has(s.sectionId);
  /** أول n فصول (بترتيب ثابت) تطابق الشرط: تتركز فيها الأعمال الجارية وتكتمل البقية */
  const pickSections = (pred: (s: (typeof sheets)[number]) => boolean, n: number) => new Set([...new Set(sheets.filter((s) => pred(s) && open(s)).map((s) => s.sectionId))].sort().slice(0, n));
  // المعلم التجريبي: الاختبار القصير في فصلين يبقى مسودة ليرصده بنفسه
  const draftSections = pickSections((s) => s.teacherId === demoTeacher && s.componentKey === "quizzes", 2);
  const keepDraft = new Set(sheets.filter((s) => s.teacherId === demoTeacher && s.componentKey === "quizzes" && draftSections.has(s.sectionId)).map((s) => s.id));
  // كشوف رياضيات لمعلم آخر (بنين) تبقى «مرسلة» بانتظار مراجعة رئيس القسم (المعلم التجريبي)
  const mathOther = (s: (typeof sheets)[number]) => s.subjectId === mathId && s.teacherId !== demoTeacher && s.componentKey === "midterm" && sectionBranch.get(s.sectionId) !== girlsBranch;
  const headSections = pickSections(mathOther, 2);
  const waitHead = new Set(sheets.filter((s) => mathOther(s) && headSections.has(s.sectionId)).map((s) => s.id));
  // واجبات لم تُرسل بعد لمعلمين اثنين في فصل واحد لكل منهما (الرصد جارٍ)
  const lateTeachers = [uid("f.alsharif@demo.manassa.sa"), uid("d.alhamdan@demo.manassa.sa")];
  const lateSections = new Map(lateTeachers.map((t) => [t, pickSections((s) => s.teacherId === t && s.componentKey === "homework", 1)]));
  for (const [teacherId, ids] of byTeacher) {
    const email = teacherEmail.get(teacherId);
    if (!email) continue;
    const t = await actor(tenantId, email);
    const toSubmit = ids.filter((id) => {
      const s = sheets.find((x) => x.id === id)!;
      return !keepDraft.has(id) && !(s.componentKey === "homework" && lateSections.get(teacherId)?.has(s.sectionId));
    });
    if (toSubmit.length) await grades.transition(t.db, t.session, { ids: toSubmit, action: "SUBMIT" });
  }
  const submitted = await rootDb.assessment.findMany({ where: { tenantId, termId: term.id, status: "SUBMITTED" } });
  // مراجعة رؤساء الأقسام
  for (const [subjectId, headId] of Object.entries(heads)) {
    const ids = submitted.filter((s) => s.subjectId === subjectId && !waitHead.has(s.id)).map((s) => s.id);
    if (!ids.length) continue;
    const h = await actor(tenantId, teacherEmail.get(headId)!);
    // رئيس القسم لا يراجع كشوفه هو؛ تراجعها الإدارة عند الاعتماد
    const own = ids.filter((id) => submitted.find((s) => s.id === id)!.teacherId === headId);
    const others = ids.filter((id) => !own.includes(id));
    if (others.length) await grades.transition(h.db, h.session, { ids: others, action: "REVIEW" });
    if (own.length) await grades.transition(pa.db, pa.session, { ids: own, action: "REVIEW" });
  }
  // الاعتماد: وكيلة البنات لفرع البنات، والمدير لفرع البنين (مع ترك بعضها بانتظار الاعتماد)
  const ready = await rootDb.assessment.findMany({ where: { tenantId, termId: term.id, status: { in: ["SUBMITTED", "REVIEWED"] } } });
  const headed = new Set(Object.keys(heads));
  const approvable = ready.filter((s) => !waitHead.has(s.id) && (s.status === "REVIEWED" || !headed.has(s.subjectId)));
  const girlsIds = approvable.filter((s) => sectionBranch.get(s.sectionId) === girlsBranch).map((s) => s.id);
  const boysIds = approvable.filter((s) => sectionBranch.get(s.sectionId) !== girlsBranch).map((s) => s.id);
  // بانتظار اعتماد الوكيلة: كشوف مادتين في فصلين من فرع البنات
  const girlsApprovable = approvable.filter((s) => girlsIds.includes(s.id) && open(s));
  const holdSections = new Set([...new Set(girlsApprovable.map((s) => s.sectionId))].sort().slice(-2));
  const holdSubjects = new Set([...new Set(girlsApprovable.filter((s) => holdSections.has(s.sectionId)).map((s) => s.subjectId))].sort().slice(0, 2));
  const holdForVp = new Set(girlsApprovable.filter((s) => holdSections.has(s.sectionId) && holdSubjects.has(s.subjectId)).map((s) => s.id));
  for (let i = 0; i < girlsIds.length; i += 80) await grades.transition(vpAcademic.db, vpAcademic.session, { ids: girlsIds.slice(i, i + 80).filter((id) => !holdForVp.has(id)), action: "APPROVE" });
  for (let i = 0; i < boysIds.length; i += 80) await grades.transition(pa.db, pa.session, { ids: boysIds.slice(i, i + 80), action: "APPROVE" });

  // طلبا تعديل درجة معتمدة: الأول معتمد ومطبّق (يُسجَّل OVERRIDE)، والثاني بانتظار المدير
  const approvedExam = await rootDb.assessment.findFirst({ where: { tenantId, termId: term.id, status: "APPROVED", componentKey: "midterm", sectionId: { in: [...sectionBranch.entries()].filter(([, b]) => b === girlsBranch).map(([s]) => s) }, teacherId: uid("m.alharbi@demo.manassa.sa") }, include: { marks: true } });
  if (approvedExam) {
    const t13 = await actor(tenantId, "m.alharbi@demo.manassa.sa");
    const [m1, m2] = approvedExam.marks.filter((m) => m.scoreTenths !== null && m.scoreTenths < approvedExam.maxTenths - 20);
    if (m1) {
      const req = await grades.requestChange(t13.db, t13.session, { assessmentId: approvedExam.id, studentId: m1.studentId, newTenths: m1.scoreTenths! + 15, newAbsent: false, reason: "خطأ في جمع درجات السؤال الثالث بعد مراجعة ورقة الإجابة (تظلم ولي الأمر)" });
      await approveAll(tenantId, req.approvalRequestId, ["principal@demo.manassa.sa"]);
    }
    if (m2) await grades.requestChange(t13.db, t13.session, { assessmentId: approvedExam.id, studentId: m2.studentId, newTenths: m2.scoreTenths! + 10, newAbsent: false, reason: "سؤال لم يُصحح في الصفحة الأخيرة" });
  }

  // تقارير المتابعة للفصول المعتمدة كاملة، ونشرها للأسر
  const pending = await rootDb.assessment.groupBy({ by: ["sectionId"], where: { tenantId, termId: term.id, status: { not: "APPROVED" } }, _count: { _all: true } });
  const blocked = new Set(pending.map((p) => p.sectionId));
  const fullyApproved = [...new Set(sheets.map((s) => s.sectionId))].filter((s) => !blocked.has(s));
  if (fullyApproved.length) await results.issueReportCards(pa.db, pa.session, { termId: term.id, sectionIds: fullyApproved, progress: true });
  await results.setPublication(pa.db, pa.session, { termId: term.id, publishAt: new Date(`${addDays(today, -2)}T12:00:00+03:00`), withholdOnDebt: true });
  console.log(`   ✓ ${fullyApproved.length} فصلاً صدرت لها تقارير متابعة`);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
function addDays(isoDate: string, n: number) {
  return iso(new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + n * 86_400_000));
}
function nextWorkday(isoDate: string) {
  let d = isoDate;
  while ([5, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())) d = addDays(d, 1);
  return d;
}
function nextMonth(m: string) {
  const [y = 2026, mm = 1] = m.split("-").map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
}
function lastDayOf(m: string) {
  const [y = 2026, mm = 1] = m.split("-").map(Number);
  return iso(new Date(Date.UTC(y, mm, 0)));
}
