/**
 * الإعداد المالي الافتراضي لكل مدرسة جديدة: دليل الحسابات المدرسي (الجزء ٨.٢)، رموز الضريبة،
 * مراكز التكلفة، بنود الرسوم، خطط التقسيط، أنواع الخصومات، والعام المالي بفتراته.
 * كل ذلك قابل للتعديل من الإعدادات؛ لا تُثبَّت النسب الضريبية في المنطق.
 */
import type { AccountType, BalanceSide, FeeKind, DiscountKind, Prisma } from "@/generated/prisma/client";
import { rootDb } from "@/server/db/client";

type Acc = [code: string, name: string, type: AccountType, parent: string | null, opts?: { group?: boolean; key?: string; side?: BalanceSide; cf?: string }];

export const DEFAULT_COA: Acc[] = [
  ["1", "الأصول", "ASSET", null, { group: true }],
  ["11", "النقد وما في حكمه", "ASSET", "1", { group: true }],
  ["1101", "الصندوق الرئيسي", "ASSET", "11", { key: "CASH", cf: "CASH" }],
  ["1102", "صندوق فرع البنات", "ASSET", "11", { key: "CASH_GIRLS", cf: "CASH" }],
  ["1111", "البنك الأهلي السعودي — الحساب الجاري", "ASSET", "11", { key: "BANK_DEFAULT", cf: "CASH" }],
  ["1112", "مصرف الراجحي — حساب التحصيل", "ASSET", "11", { key: "BANK_COLLECTION", cf: "CASH" }],
  ["1121", "عهد نقدية", "ASSET", "11", { cf: "CASH" }],
  ["1131", "محفظة بوابة الدفع", "ASSET", "11", { key: "PAYMENT_GATEWAY", cf: "CASH" }],
  ["12", "الذمم المدينة", "ASSET", "1", { group: true }],
  ["1201", "ذمم أولياء الأمور — رسوم دراسية", "ASSET", "12", { key: "AR_TUITION", cf: "OPERATING" }],
  ["1202", "ذمم أولياء الأمور — رسوم النقل", "ASSET", "12", { key: "AR_TRANSPORT", cf: "OPERATING" }],
  ["1203", "ذمم أولياء الأمور — رسوم أخرى", "ASSET", "12", { key: "AR_OTHER", cf: "OPERATING" }],
  ["1210", "ذمم الموظفين والسلف", "ASSET", "12", { key: "AR_STAFF", cf: "OPERATING" }],
  ["1220", "شيكات تحت التحصيل", "ASSET", "12", { key: "CHEQUES_UNDER_COLLECTION", cf: "OPERATING" }],
  ["1290", "مخصص الديون المشكوك في تحصيلها", "ASSET", "12", { key: "DOUBTFUL_DEBTS", side: "CREDIT", cf: "OPERATING" }],
  ["13", "المخزون", "ASSET", "1", { group: true }],
  ["1301", "مخزون الكتب والزي", "ASSET", "13", { cf: "OPERATING" }],
  ["1302", "مخزون المستلزمات", "ASSET", "13", { cf: "OPERATING" }],
  ["1303", "مخزون المقصف", "ASSET", "13", { cf: "OPERATING" }],
  ["14", "مصروفات مدفوعة مقدماً", "ASSET", "1", { group: true }],
  ["1401", "إيجارات مدفوعة مقدماً", "ASSET", "14", { cf: "OPERATING" }],
  ["1402", "تأمين مدفوع مقدماً", "ASSET", "14", { cf: "OPERATING" }],
  ["15", "الأصول الثابتة", "ASSET", "1", { group: true }],
  ["1501", "أراضٍ", "ASSET", "15", { cf: "INVESTING" }],
  ["1502", "مبانٍ", "ASSET", "15", { cf: "INVESTING" }],
  ["1503", "أثاث وتجهيزات", "ASSET", "15", { cf: "INVESTING" }],
  ["1504", "أجهزة حاسب", "ASSET", "15", { cf: "INVESTING" }],
  ["1505", "حافلات", "ASSET", "15", { cf: "INVESTING" }],
  ["1590", "مجمع الإهلاك", "ASSET", "15", { key: "ACCUMULATED_DEPRECIATION", side: "CREDIT", cf: "INVESTING" }],
  ["2", "الخصوم", "LIABILITY", null, { group: true }],
  ["21", "الذمم الدائنة", "LIABILITY", "2", { group: true }],
  ["2101", "الموردون", "LIABILITY", "21", { key: "AP", cf: "OPERATING" }],
  ["22", "إيرادات مؤجلة", "LIABILITY", "2", { group: true }],
  ["2201", "رسوم دراسية مقبوضة مقدماً (مؤجلة)", "LIABILITY", "22", { key: "DEFERRED_REVENUE", cf: "OPERATING" }],
  ["23", "أرصدة دائنة لأولياء الأمور", "LIABILITY", "2", { group: true }],
  ["2301", "دفعات زائدة وأرصدة دائنة", "LIABILITY", "23", { key: "GUARDIAN_CREDIT", cf: "OPERATING" }],
  ["2302", "أرصدة محافظ الطلاب", "LIABILITY", "23", { key: "STUDENT_WALLETS", cf: "OPERATING" }],
  ["24", "ضريبة القيمة المضافة", "LIABILITY", "2", { group: true }],
  ["2401", "ضريبة القيمة المضافة — مخرجات", "LIABILITY", "24", { key: "VAT_OUTPUT", cf: "OPERATING" }],
  ["2402", "ضريبة القيمة المضافة — مدخلات", "LIABILITY", "24", { key: "VAT_INPUT", side: "DEBIT", cf: "OPERATING" }],
  ["2501", "رواتب مستحقة", "LIABILITY", "2", { key: "SALARIES_PAYABLE", cf: "OPERATING" }],
  ["2601", "مخصص مكافأة نهاية الخدمة", "LIABILITY", "2", { key: "EOS_PROVISION", cf: "OPERATING" }],
  ["2701", "تأمينات اجتماعية مستحقة", "LIABILITY", "2", { key: "GOSI_PAYABLE", cf: "OPERATING" }],
  ["2801", "تأمينات وضمانات مقبوضة", "LIABILITY", "2", { cf: "OPERATING" }],
  ["2901", "قروض", "LIABILITY", "2", { cf: "FINANCING" }],
  ["3", "حقوق الملكية", "EQUITY", null, { group: true }],
  ["3101", "رأس المال", "EQUITY", "3", { cf: "FINANCING" }],
  ["3201", "الاحتياطي النظامي", "EQUITY", "3", { cf: "FINANCING" }],
  ["3301", "الأرباح المبقاة", "EQUITY", "3", { key: "RETAINED_EARNINGS", cf: "FINANCING" }],
  ["3901", "أرصدة افتتاحية", "EQUITY", "3", { key: "OPENING_EQUITY", cf: "FINANCING" }],
  ["4", "الإيرادات", "REVENUE", null, { group: true }],
  ["41", "رسوم دراسية", "REVENUE", "4", { group: true }],
  ["4101", "رسوم دراسية — المرحلة الابتدائية", "REVENUE", "41", { key: "REV_TUITION:PRI" }],
  ["4102", "رسوم دراسية — المرحلة المتوسطة", "REVENUE", "41", { key: "REV_TUITION:INT" }],
  ["4103", "رسوم دراسية — المرحلة الثانوية", "REVENUE", "41", { key: "REV_TUITION:SEC" }],
  ["4201", "رسوم تسجيل وقبول", "REVENUE", "4", { key: "REV_REGISTRATION" }],
  ["4301", "رسوم نقل مدرسي", "REVENUE", "4", { key: "REV_TRANSPORT" }],
  ["4401", "رسوم أنشطة ورحلات", "REVENUE", "4", { key: "REV_ACTIVITIES" }],
  ["4501", "مبيعات الزي والكتب", "REVENUE", "4", { key: "REV_SALES" }],
  ["4601", "مبيعات المقصف", "REVENUE", "4", { key: "REV_CANTEEN" }],
  ["4701", "غرامات تأخير السداد", "REVENUE", "4", { key: "LATE_FEES" }],
  ["4702", "غرامات المكتبة", "REVENUE", "4"],
  ["4801", "إيرادات أخرى (تأجير مرافق)", "REVENUE", "4", { key: "REV_OTHER" }],
  ["4802", "تبرعات ومنح", "REVENUE", "4"],
  ["4901", "خصومات وإعفاءات ومنح دراسية", "REVENUE", "4", { key: "DISCOUNTS", side: "DEBIT" }],
  ["5", "تكلفة الإيراد", "EXPENSE", null, { group: true }],
  ["5101", "تكلفة مبيعات الزي والكتب", "EXPENSE", "5"],
  ["5102", "تكلفة مبيعات المقصف", "EXPENSE", "5"],
  ["6", "المصروفات التشغيلية", "EXPENSE", null, { group: true }],
  ["61", "رواتب وأجور", "EXPENSE", "6", { group: true }],
  ["6101", "رواتب — الهيئة التعليمية", "EXPENSE", "61", { key: "SAL_ACADEMIC" }],
  ["6102", "رواتب — الإداريون", "EXPENSE", "61", { key: "SAL_ADMIN" }],
  ["6103", "رواتب — الخدمات", "EXPENSE", "61", { key: "SAL_SERVICES" }],
  ["6201", "بدلات ومكافآت", "EXPENSE", "6"],
  ["6301", "تأمينات اجتماعية", "EXPENSE", "6"],
  ["6302", "تأمين طبي", "EXPENSE", "6"],
  ["6401", "إيجارات", "EXPENSE", "6"],
  ["65", "مرافق", "EXPENSE", "6", { group: true }],
  ["6501", "كهرباء", "EXPENSE", "65"],
  ["6502", "مياه", "EXPENSE", "65"],
  ["6503", "اتصالات وإنترنت", "EXPENSE", "65"],
  ["6601", "صيانة وإصلاح", "EXPENSE", "6"],
  ["6701", "نقل ووقود", "EXPENSE", "6"],
  ["6801", "مستلزمات تعليمية", "EXPENSE", "6"],
  ["6802", "مستلزمات مكتبية وقرطاسية", "EXPENSE", "6"],
  ["6901", "تسويق وإعلان", "EXPENSE", "6"],
  ["7001", "رسوم حكومية وتراخيص", "EXPENSE", "6"],
  ["7101", "أتعاب مهنية", "EXPENSE", "6"],
  ["7201", "إهلاك", "EXPENSE", "6", { key: "DEPRECIATION" }],
  ["7301", "ديون معدومة ومشكوك فيها", "EXPENSE", "6", { key: "BAD_DEBT" }],
  ["7401", "مصروفات بنكية", "EXPENSE", "6", { key: "BANK_CHARGES" }],
  ["7501", "مصروفات أخرى", "EXPENSE", "6"],
  ["7502", "فروقات الصندوق", "EXPENSE", "6", { key: "CASH_OVER_SHORT" }],
];

const normalSide = (type: AccountType): BalanceSide => (type === "ASSET" || type === "EXPENSE" ? "DEBIT" : "CREDIT");

type Tx = Pick<typeof rootDb, "account" | "taxCode" | "costCenter" | "feeItem" | "installmentPlan" | "discountType" | "fiscalYear" | "fiscalPeriod" | "branch" | "stage">;

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** ينشئ عاماً مالياً ميلادياً بفتراته الشهرية */
type CreateOnly = { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> };
export async function createFiscalYear(dbAny: unknown, tenantId: string, year: number) {
  const db = dbAny as { fiscalYear: CreateOnly; fiscalPeriod: CreateOnly };
  const fy = await db.fiscalYear.create({ data: { tenantId, name: `العام المالي ${year}`, startDate: new Date(Date.UTC(year, 0, 1)), endDate: new Date(Date.UTC(year, 11, 31)) } });
  for (let m = 0; m < 12; m++) {
    await db.fiscalPeriod.create({
      data: { tenantId, fiscalYearId: fy.id, name: `${MONTHS[m]} ${year}`, startDate: new Date(Date.UTC(year, m, 1)), endDate: new Date(Date.UTC(year, m + 1, 0)) },
    });
  }
  return fy;
}

/** الإعداد المالي الافتراضي (يُستدعى عند إنشاء المدرسة؛ آمن للتكرار) */
export async function ensureFinanceSetup(tenantId: string, db: Tx = rootDb) {
  if (await db.account.count({ where: { tenantId } })) return;
  const ids = new Map<string, string>();
  for (const [code, name, type, parent, opts] of DEFAULT_COA) {
    const a = await db.account.create({
      data: { tenantId, code, name, type, normalSide: opts?.side ?? normalSide(type), parentId: parent ? ids.get(parent)! : null, isGroup: opts?.group ?? false, systemKey: opts?.key ?? null, cashFlowGroup: opts?.cf ?? null },
    });
    ids.set(code, a.id);
  }
  const acc = (code: string) => ids.get(code)!;

  // رموز الضريبة (النسب قابلة للتعديل من الإعدادات)
  const vat = await db.taxCode.create({ data: { tenantId, code: "VAT15", name: "ضريبة القيمة المضافة — أساسية", rateBp: 1500, kind: "STANDARD", outputAccountId: acc("2401"), inputAccountId: acc("2402") } });
  const citizen = await db.taxCode.create({ data: { tenantId, code: "VAT-CITIZEN", name: "تعليم المواطنين — تتحمل الدولة الضريبة", rateBp: 0, kind: "ZERO", outputAccountId: acc("2401") } });
  await db.taxCode.create({ data: { tenantId, code: "EXEMPT", name: "معفى", rateBp: 0, kind: "EXEMPT" } });

  // مراكز التكلفة: الفروع والمراحل
  const [branches, stages] = await Promise.all([db.branch.findMany({ where: { tenantId, deletedAt: null } }), db.stage.findMany({ where: { tenantId, deletedAt: null } })]);
  for (const b of branches) await db.costCenter.create({ data: { tenantId, code: `BR-${b.code}`, name: b.name, kind: "BRANCH", branchId: b.id } });
  for (const s of stages) await db.costCenter.create({ data: { tenantId, code: `ST-${s.code}`, name: s.name, kind: "STAGE", stageId: s.id } });
  await db.costCenter.create({ data: { tenantId, code: "DEP-ADMIN", name: "الإدارة العامة", kind: "DEPARTMENT" } });

  // بنود الرسوم
  const items: Array<[string, string, FeeKind, string, string, boolean, string | null, string | null, boolean]> = [
    ["TUITION", "الرسوم الدراسية", "TUITION", "4101", "1201", true, vat.id, citizen.id, true],
    ["REGISTRATION", "رسوم التسجيل والقبول", "REGISTRATION", "4201", "1203", false, vat.id, citizen.id, false],
    ["BOOKS", "رسوم الكتب والمواد", "BOOKS", "4501", "1203", false, vat.id, null, false],
    ["UNIFORM", "الزي المدرسي", "UNIFORM", "4501", "1203", false, vat.id, null, false],
    ["TRANSPORT", "رسوم النقل المدرسي", "TRANSPORT", "4301", "1202", true, vat.id, citizen.id, true],
    ["ACTIVITY", "رسوم الأنشطة والرحلات", "ACTIVITY", "4401", "1203", false, vat.id, null, true],
    ["LATE_FEE", "غرامة تأخير السداد", "LATE_FEE", "4701", "1203", false, null, null, false],
  ];
  for (const [i, [code, name, kind, rev, ar, deferred, tax, citizenTax, refundable]] of items.entries()) {
    await db.feeItem.create({ data: { tenantId, code, name, kind, revenueAccountId: acc(rev), receivableAccountId: acc(ar), deferred, taxCodeId: tax, citizenTaxCodeId: citizenTax, refundable, position: i } });
  }

  // خطط التقسيط (التواريخ تُضبط لكل عام من الإعدادات)
  const y = new Date().getUTCFullYear();
  const plans: Array<[string, string, Array<{ label: string; weight: number; dueDate: string }>, boolean]> = [
    ["دفعة واحدة", "SINGLE", [{ label: "كامل المبلغ", weight: 1, dueDate: `${y}-08-31` }], false],
    ["فصلية (دفعتان)", "TERMLY", [{ label: "الفصل الأول", weight: 1, dueDate: `${y}-08-31` }, { label: "الفصل الثاني", weight: 1, dueDate: `${y + 1}-01-31` }], true],
    [
      "ثلاث دفعات",
      "CUSTOM",
      [
        { label: "الدفعة الأولى", weight: 40, dueDate: `${y}-08-31` },
        { label: "الدفعة الثانية", weight: 30, dueDate: `${y}-11-30` },
        { label: "الدفعة الثالثة", weight: 30, dueDate: `${y + 1}-02-28` },
      ],
      false,
    ],
  ];
  for (const [name, kind, parts, isDefault] of plans) {
    await db.installmentPlan.create({ data: { tenantId, name, kind, parts: parts as Prisma.InputJsonValue, isDefault, lateFeeKind: "FIXED", lateFeeValue: 10000, graceDays: 15 } });
  }
  const monthly = Array.from({ length: 10 }, (_, i) => {
    const d = new Date(Date.UTC(y, 7 + i + 1, 0));
    return { label: `الشهر ${i + 1}`, weight: 1, dueDate: d.toISOString().slice(0, 10) };
  });
  await db.installmentPlan.create({ data: { tenantId, name: "شهرية (١٠ دفعات)", kind: "MONTHLY", parts: monthly as Prisma.InputJsonValue, lateFeeKind: "NONE" } });

  // أنواع الخصومات
  const tuition = await db.feeItem.findFirstOrThrow({ where: { tenantId, code: "TUITION" } });
  const discounts: Array<[string, string, DiscountKind, "PERCENT" | "FIXED", number, Prisma.InputJsonValue | undefined, number | null]> = [
    ["SIBLING", "خصم الأشقاء", "SIBLING", "PERCENT", 0, [{ order: 2, valueBp: 500 }, { order: 3, valueBp: 1000 }, { order: 4, valueBp: 1500 }], null],
    ["STAFF", "خصم أبناء الموظفين", "STAFF", "PERCENT", 5000, undefined, null],
    ["MERIT", "خصم التفوق الدراسي", "MERIT", "PERCENT", 1000, undefined, null],
    ["SCHOLARSHIP", "منحة دراسية كاملة", "SCHOLARSHIP", "PERCENT", 10000, undefined, 0],
    ["EARLY", "خصم السداد المبكر", "EARLY_PAYMENT", "PERCENT", 300, undefined, null],
    ["MANUAL", "خصم استثنائي", "MANUAL", "FIXED", 0, undefined, 200000],
  ];
  for (const [code, name, kind, method, value, tiers, limit] of discounts) {
    await db.discountType.create({ data: { tenantId, code, name, kind, method, value, siblingTiers: tiers, feeItemIds: [tuition.id], approvalLimitMinor: limit } });
  }
  await createFiscalYear(db, tenantId, y);
}
