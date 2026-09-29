/**
 * حسابات الموارد البشرية والرواتب (دون قاعدة بيانات) بأعداد صحيحة بأصغر وحدة وتقريب نصف للأعلى:
 * مكافأة نهاية الخدمة، التأمينات الاجتماعية، الغياب والتأخر، العمل الإضافي، سقف الاستقطاعات،
 * واستحقاق المخصص الشهري. كل النسب من إعدادات المدرسة؛ القيم الافتراضية لنظام العمل السعودي.
 */
import { applyBp } from "@/lib/finance/calc";

export const divRound = (num: number, den: number) => {
  if (den <= 0) throw new Error("مقام غير صالح");
  if (num < 0) return -Math.floor((-num * 2 + den) / (den * 2));
  return Math.floor((num * 2 + den) / (den * 2));
};

export interface InsuranceScheme {
  name: string;
  /** على من يُطبق: المواطن (جنسية دولة المدرسة)، غير المواطن، أو الجميع */
  appliesTo: "CITIZEN" | "NON_CITIZEN" | "ALL";
  employeeBp: number;
  employerBp: number;
}

export type WageBasis = "FULL" | "BASIC" | "BASIC_HOUSING";
export const WAGE_BASIS_LABEL: Record<WageBasis, string> = { FULL: "الأجر الفعلي: أساسي + كل البدلات الثابتة", BASIC: "الأساسي فقط", BASIC_HOUSING: "الأساسي + السكن" };

/** قواعد الرواتب — كلها من «إعدادات الرواتب» ولا شيء مثبّت لدولة بعينها */
export interface HrRules {
  insuranceSchemes: InsuranceScheme[];
  /** الأجر الخاضع للتأمينات */
  insuranceBase: WageBasis;
  /** سقف الأجر الخاضع (0 = بلا سقف) */
  insuranceCapMinor: number;
  deductAbsence: boolean;
  deductLate: boolean;
  lateMonthlyGraceMinutes: number;
  /** PREMIUM_ON_BASIC: أجر الساعة الفعلي + (المعامل−١) × أجر الساعة الأساسي؛ FULL_WAGE: أجر الساعة الفعلي × المعامل */
  overtimeMode: "PREMIUM_ON_BASIC" | "FULL_WAGE";
  overtimeRateBp: number;
  monthDays: number;
  /** سقف السلف والجزاءات والاستقطاعات التقديرية من الأجر (نقاط أساس؛ 10000 = بلا سقف) */
  deductionCapBp: number;
  eosEnabled: boolean;
  /** عدد السنوات الأولى ذات المعدل الأول */
  eosFirstYears: number;
  eosFirstYearsMonthsBp: number;
  eosLaterYearsMonthsBp: number;
  eosWageBasis: WageBasis;
  /** نسبة الاستحقاق عند الاستقالة حسب سنوات الخدمة (أقل من أول حد = لا شيء) */
  eosResignation: Array<{ minYears: number; factorBp: number }>;
  /** أيام السنة في احتساب الخدمة */
  eosYearDays: number;
}

export const DEFAULT_HR_RULES: HrRules = {
  insuranceSchemes: [
    { name: "تأمينات المواطنين", appliesTo: "CITIZEN", employeeBp: 975, employerBp: 1175 },
    { name: "الأخطار المهنية لغير المواطنين", appliesTo: "NON_CITIZEN", employeeBp: 0, employerBp: 200 },
  ],
  insuranceBase: "BASIC_HOUSING",
  insuranceCapMinor: 4_500_000,
  deductAbsence: true,
  deductLate: true,
  lateMonthlyGraceMinutes: 60,
  overtimeMode: "PREMIUM_ON_BASIC",
  overtimeRateBp: 15000,
  monthDays: 30,
  deductionCapBp: 5000,
  eosEnabled: true,
  eosFirstYears: 5,
  eosFirstYearsMonthsBp: 5000,
  eosLaterYearsMonthsBp: 10000,
  eosWageBasis: "FULL",
  eosResignation: [
    { minYears: 2, factorBp: 3333 },
    { minYears: 5, factorBp: 6667 },
    { minYears: 10, factorBp: 10000 },
  ],
  eosYearDays: 365,
};

/** الأجر حسب الأساس المختار */
export function wageBy(basis: WageBasis, c: { basicMinor: number; housingMinor: number; transportMinor: number; otherAllowancesMinor: number }) {
  return basis === "BASIC" ? c.basicMinor : basis === "BASIC_HOUSING" ? c.basicMinor + c.housingMinor : c.basicMinor + c.housingMinor + c.transportMinor + c.otherAllowancesMinor;
}

/** نسب التأمين المطبقة على موظف (مجموع كل الأنظمة المنطبقة) */
export function insuranceRates(rules: Pick<HrRules, "insuranceSchemes">, citizen: boolean) {
  const applies = rules.insuranceSchemes.filter((x) => x.appliesTo === "ALL" || (x.appliesTo === "CITIZEN") === citizen);
  return { employeeBp: applies.reduce((t, x) => t + x.employeeBp, 0), employerBp: applies.reduce((t, x) => t + x.employerBp, 0) };
}

/** أيام الخدمة بين تاريخين (شاملة يوم البداية) */
export function serviceDays(hireIso: string, endIso: string): number {
  const a = Date.parse(`${hireIso}T00:00:00Z`);
  const b = Date.parse(`${endIso}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1);
}

export type EosReason = "RESIGNATION" | "TERMINATION" | "CONTRACT_END" | "RETIREMENT" | "DEATH" | "ARTICLE_80";

export interface EosResult {
  /** المكافأة الكاملة قبل عامل الاستقالة */
  fullMinor: number;
  /** نسبة الاستحقاق (نقاط أساس) حسب سبب الانتهاء ومدة الخدمة */
  factorBp: number;
  awardMinor: number;
  years: number;
  steps: string[];
}

type EosRules = Pick<HrRules, "eosFirstYears" | "eosFirstYearsMonthsBp" | "eosLaterYearsMonthsBp" | "eosResignation" | "eosYearDays" | "eosEnabled">;

const pct = (bp: number) => `${(bp / 100).toString()}٪`;

/**
 * مكافأة نهاية الخدمة من الإعدادات: معدل (أشهر لكل سنة) للسنوات الأولى ومعدل لما بعدها، وكسور السنة بنسبتها.
 * الاستقالة: نسبة حسب جدول سنوات الخدمة. الفصل التأديبي: لا مكافأة. باقي الأسباب: كاملة.
 * الافتراضي نظام العمل السعودي (م٨٤ و٨٥)، ويُعدَّل لأي دولة من «إعدادات الرواتب».
 */
export function eosAward(wageMinor: number, days: number, reason: EosReason, rules: EosRules = DEFAULT_HR_RULES): EosResult {
  if (!rules.eosEnabled) return { fullMinor: 0, factorBp: 0, awardMinor: 0, years: days / rules.eosYearDays, steps: ["مكافأة نهاية الخدمة غير مفعّلة في إعدادات الرواتب"] };
  const yd = rules.eosYearDays;
  const firstDays = Math.min(days, rules.eosFirstYears * yd);
  const laterDays = Math.max(0, days - rules.eosFirstYears * yd);
  const fullMinor = divRound(wageMinor * (firstDays * rules.eosFirstYearsMonthsBp + laterDays * rules.eosLaterYearsMonthsBp), yd * 10000);
  const years = days / yd;
  let factorBp = 10000;
  if (reason === "ARTICLE_80") factorBp = 0;
  else if (reason === "RESIGNATION") {
    const tiers = [...rules.eosResignation].sort((x, y) => x.minYears - y.minYears);
    factorBp = tiers.filter((t) => days >= t.minYears * yd).pop()?.factorBp ?? 0;
  }
  const awardMinor = factorBp === 10000 ? fullMinor : factorBp === 0 ? 0 : factorBp === 3333 ? divRound(fullMinor, 3) : factorBp === 6667 ? divRound(fullMinor * 2, 3) : divRound(fullMinor * factorBp, 10000);
  const months = (bp: number) => (bp === 5000 ? "نصف أجر شهر" : bp === 10000 ? "أجر شهر" : `${(bp / 10000).toString()} من أجر الشهر`);
  const steps = [
    `مدة الخدمة ${days} يوماً (${(Math.floor(years * 100) / 100).toString()} سنة)`,
    `السنوات ${rules.eosFirstYears} الأولى: ${firstDays} يوماً × ${months(rules.eosFirstYearsMonthsBp)} لكل سنة`,
    ...(laterDays ? [`ما بعدها: ${laterDays} يوماً × ${months(rules.eosLaterYearsMonthsBp)} لكل سنة`] : []),
    reason === "RESIGNATION" ? `استقالة: يُستحق ${factorBp === 0 ? "لا شيء (دون الحد الأدنى للخدمة)" : factorBp === 10000 ? "كامل المكافأة" : pct(factorBp) + " من المكافأة"}` : reason === "ARTICLE_80" ? "فصل تأديبي: لا مكافأة" : "انتهاء بغير استقالة: كامل المكافأة",
  ];
  return { fullMinor, factorBp, awardMinor, years, steps };
}

/** بدل رصيد الإجازة غير المستخدم: الأجر اليومي × الأيام */
export function leaveEncashment(monthlyWageMinor: number, days: number, monthDays = 30) {
  return days > 0 ? divRound(monthlyWageMinor * days, monthDays) : 0;
}

/** استحقاق المخصص الشهري لمكافأة نهاية الخدمة حسب سنة الخدمة الحالية */
export function monthlyEosAccrual(wageMinor: number, daysServedAtMonthEnd: number, rules: EosRules = DEFAULT_HR_RULES) {
  if (!rules.eosEnabled) return 0;
  const rate = daysServedAtMonthEnd <= rules.eosFirstYears * rules.eosYearDays ? rules.eosFirstYearsMonthsBp : rules.eosLaterYearsMonthsBp;
  return divRound(wageMinor * rate, 12 * 10000);
}

export interface SalaryInput {
  basicMinor: number;
  housingMinor: number;
  transportMinor: number;
  otherAllowancesMinor: number;
  hoursPerDay: number;
  /** مواطن دولة المدرسة (لتحديد أنظمة التأمين المنطبقة) */
  citizen: boolean;
  gosiRegistered: boolean;
  /** أيام الاستحقاق في الشهر (للمعيّن أو المنتهي خلال الشهر)؛ الافتراضي الشهر كاملاً */
  paidDays?: number;
  absentDays: number;
  unpaidLeaveDays: number;
  lateMinutes: number;
  /** دقائق العمل الإضافي المعتمدة */
  overtimeMinutes: number;
  bonusMinor: number;
  allowanceAdjMinor: number;
  penaltyMinor: number;
  otherDeductionMinor: number;
  loanDueMinor: number;
}

export interface SalaryLine {
  basicMinor: number;
  housingMinor: number;
  transportMinor: number;
  otherAllowancesMinor: number;
  overtimeMinor: number;
  bonusMinor: number;
  grossMinor: number;
  gosiEmployeeMinor: number;
  gosiEmployerMinor: number;
  absenceMinor: number;
  lateMinor: number;
  unpaidLeaveMinor: number;
  loanMinor: number;
  penaltyMinor: number;
  otherDeductionMinor: number;
  deductionsMinor: number;
  netMinor: number;
  /** ما خُفّض من الاستقطاعات التقديرية لسقف ٥٠٪ */
  cappedMinor: number;
  notes: string[];
}

/**
 * سطر الراتب: الإجمالي = الثابت (بنسبة أيام الاستحقاق) + الإضافي + المكافآت والبدلات المتغيرة.
 * الاستقطاعات: التأمينات (حصة الموظف السعودي من الأساسي+السكن بحد أعلى)، الغياب والإجازة غير المدفوعة بالأجر اليومي،
 * التأخر بعد مهلة شهرية بأجر الدقيقة، ثم السلف والجزاءات والاستقطاعات الأخرى بحد أقصى نصف الأجر (م٩٢).
 */
export function salaryLine(i: SalaryInput, rules: HrRules = DEFAULT_HR_RULES): SalaryLine {
  const notes: string[] = [];
  const md = rules.monthDays;
  const prorate = (v: number) => (i.paidDays === undefined || i.paidDays >= md ? v : divRound(v * Math.max(0, i.paidDays), md));
  if (i.paidDays !== undefined && i.paidDays < md) notes.push(`استحقاق جزئي: ${i.paidDays} من ${md} يوماً`);
  const basic = prorate(i.basicMinor);
  const housing = prorate(i.housingMinor);
  const transport = prorate(i.transportMinor);
  const other = prorate(i.otherAllowancesMinor);
  const fixedMonthly = i.basicMinor + i.housingMinor + i.transportMinor + i.otherAllowancesMinor;
  const dailyWage = divRound(fixedMonthly, md);
  // PREMIUM_ON_BASIC (م١٠٧ السعودية): أجر الساعة الفعلي + (المعامل−١) × أجر الساعة الأساسي؛ FULL_WAGE: الفعلي × المعامل
  const otNumerator = rules.overtimeMode === "FULL_WAGE" ? fixedMonthly * rules.overtimeRateBp : fixedMonthly * 10000 + i.basicMinor * (rules.overtimeRateBp - 10000);
  const overtime = i.overtimeMinutes > 0 ? divRound(i.overtimeMinutes * otNumerator, md * i.hoursPerDay * 60 * 10000) : 0;
  const gross = basic + housing + transport + other + overtime + i.bonusMinor + i.allowanceAdjMinor;

  const insurable = wageBy(rules.insuranceBase, i);
  const gosiBase = rules.insuranceCapMinor > 0 ? Math.min(insurable, rules.insuranceCapMinor) : insurable;
  const rates = insuranceRates(rules, i.citizen);
  const gosiEmployee = i.gosiRegistered ? applyBp(prorate(gosiBase), rates.employeeBp) : 0;
  const gosiEmployer = i.gosiRegistered ? applyBp(prorate(gosiBase), rates.employerBp) : 0;
  const absence = rules.deductAbsence ? dailyWage * i.absentDays : 0;
  const unpaid = dailyWage * i.unpaidLeaveDays;
  const lateBillable = Math.max(0, i.lateMinutes - rules.lateMonthlyGraceMinutes);
  const late = rules.deductLate && lateBillable ? divRound(fixedMonthly * lateBillable, md * i.hoursPerDay * 60) : 0;
  if (lateBillable && rules.deductLate) notes.push(`تأخر محتسب ${lateBillable} دقيقة بعد مهلة ${rules.lateMonthlyGraceMinutes}`);

  // الاستقطاعات النظامية لا تتجاوز الإجمالي
  const statutory = Math.min(gross, gosiEmployee + absence + unpaid + late);
  // الاستقطاعات التقديرية بحد نسبة من الأجر المستحق (الافتراضي النصف — م٩٢ السعودية)
  const room = Math.max(0, Math.min(Math.floor((gross * Math.min(10000, rules.deductionCapBp)) / 10000), gross - statutory));
  let left = room;
  const take = (v: number) => {
    const t = Math.min(v, left);
    left -= t;
    return t;
  };
  const loan = take(i.loanDueMinor);
  const penalty = take(i.penaltyMinor);
  const otherDed = take(i.otherDeductionMinor);
  const cappedMinor = i.loanDueMinor + i.penaltyMinor + i.otherDeductionMinor - (loan + penalty + otherDed);
  if (cappedMinor) notes.push(`خُفّضت الاستقطاعات التقديرية لسقف ${pct(rules.deductionCapBp)} من الأجر`);
  // توزيع النظامية بعد قصّها (إن تجاوزت الإجمالي تُقتطع بالترتيب)
  let s = statutory;
  const cut = (v: number) => {
    const t = Math.min(v, s);
    s -= t;
    return t;
  };
  const gosiE = cut(gosiEmployee);
  const abs = cut(absence);
  const unp = cut(unpaid);
  const lt = cut(late);
  const deductions = gosiE + abs + unp + lt + loan + penalty + otherDed;
  return {
    basicMinor: basic,
    housingMinor: housing,
    transportMinor: transport,
    otherAllowancesMinor: other + i.allowanceAdjMinor,
    overtimeMinor: overtime,
    bonusMinor: i.bonusMinor,
    grossMinor: gross,
    gosiEmployeeMinor: gosiE,
    gosiEmployerMinor: gosiEmployer,
    absenceMinor: abs,
    lateMinor: lt,
    unpaidLeaveMinor: unp,
    loanMinor: loan,
    penaltyMinor: penalty,
    otherDeductionMinor: otherDed,
    deductionsMinor: deductions,
    netMinor: gross - deductions,
    cappedMinor,
    notes,
  };
}

/** أيام العمل بين تاريخين حسب أيام الدوام (٠=الأحد) */
export function workingDays(startIso: string, endIso: string, workDays: number[]): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${startIso}T00:00:00Z`), end = Date.parse(`${endIso}T00:00:00Z`); t <= end; t += 86_400_000) {
    const d = new Date(t);
    if (workDays.includes(d.getUTCDay())) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** دقائق التأخر من وقت الحضور وبداية الدوام ومهلة السماح */
export function lateMinutes(checkInHHMM: string, shiftStart: string, grace: number) {
  const m = (s: string) => {
    const [h = 0, mm = 0] = s.split(":").map(Number);
    return h * 60 + mm;
  };
  const diff = m(checkInHHMM) - m(shiftStart);
  return diff > grace ? diff : 0;
}

export { validIban } from "@/lib/region";
