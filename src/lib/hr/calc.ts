/**
 * حسابات الموارد البشرية والرواتب (دون قاعدة بيانات) بأعداد صحيحة بأصغر وحدة وتقريب نصف للأعلى:
 * مكافأة نهاية الخدمة (المادتان ٨٤ و٨٥ من نظام العمل)، التأمينات الاجتماعية، الغياب والتأخر،
 * العمل الإضافي (المادة ١٠٧)، سقف الاستقطاعات (المادة ٩٢)، واستحقاق المخصص الشهري.
 */
import { applyBp } from "@/lib/finance/calc";

export const divRound = (num: number, den: number) => {
  if (den <= 0) throw new Error("مقام غير صالح");
  if (num < 0) return -Math.floor((-num * 2 + den) / (den * 2));
  return Math.floor((num * 2 + den) / (den * 2));
};

export interface HrRules {
  gosiSaudiEmployeeBp: number;
  gosiSaudiEmployerBp: number;
  gosiNonSaudiEmployerBp: number;
  gosiCapMinor: number;
  deductAbsence: boolean;
  deductLate: boolean;
  lateMonthlyGraceMinutes: number;
  overtimeRateBp: number;
  monthDays: number;
  eosFirstYearsMonthsBp: number;
  eosLaterYearsMonthsBp: number;
}

export const DEFAULT_HR_RULES: HrRules = {
  gosiSaudiEmployeeBp: 975,
  gosiSaudiEmployerBp: 1175,
  gosiNonSaudiEmployerBp: 200,
  gosiCapMinor: 4_500_000,
  deductAbsence: true,
  deductLate: true,
  lateMonthlyGraceMinutes: 60,
  overtimeRateBp: 15000,
  monthDays: 30,
  eosFirstYearsMonthsBp: 5000,
  eosLaterYearsMonthsBp: 10000,
};

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

/**
 * مكافأة نهاية الخدمة: نصف أجر شهر عن كل سنة من السنوات الخمس الأولى وأجر شهر عن كل سنة بعدها،
 * وتُحتسب كسور السنة بنسبتها (السنة = ٣٦٥ يوماً). الاستقالة (م٨٥): أقل من سنتين لا شيء، ٢–٥ ثلث، ٥–١٠ ثلثان، ١٠+ كاملة.
 * الفصل وفق المادة ٨٠: لا مكافأة.
 */
export function eosAward(wageMinor: number, days: number, reason: EosReason, rules: Pick<HrRules, "eosFirstYearsMonthsBp" | "eosLaterYearsMonthsBp"> = DEFAULT_HR_RULES): EosResult {
  const firstDays = Math.min(days, 5 * 365);
  const laterDays = Math.max(0, days - 5 * 365);
  const fullMinor = divRound(wageMinor * (firstDays * rules.eosFirstYearsMonthsBp + laterDays * rules.eosLaterYearsMonthsBp), 365 * 10000);
  const years = days / 365;
  let factorBp = 10000;
  if (reason === "ARTICLE_80") factorBp = 0;
  else if (reason === "RESIGNATION") factorBp = days < 2 * 365 ? 0 : days < 5 * 365 ? 3333 : days < 10 * 365 ? 6667 : 10000;
  const awardMinor = factorBp === 10000 ? fullMinor : factorBp === 0 ? 0 : factorBp === 3333 ? divRound(fullMinor, 3) : divRound(fullMinor * 2, 3);
  const steps = [
    `مدة الخدمة ${days} يوماً (${(Math.floor(years * 100) / 100).toString()} سنة)`,
    `السنوات الخمس الأولى: ${firstDays} يوماً × نصف أجر شهر لكل سنة`,
    ...(laterDays ? [`ما بعد الخمس: ${laterDays} يوماً × أجر شهر لكل سنة`] : []),
    reason === "RESIGNATION" ? `استقالة: يُستحق ${factorBp === 0 ? "لا شيء (أقل من سنتين)" : factorBp === 3333 ? "الثلث (٢–٥ سنوات)" : factorBp === 6667 ? "الثلثان (٥–١٠ سنوات)" : "كامل المكافأة (١٠ سنوات فأكثر)"}` : reason === "ARTICLE_80" ? "فصل وفق المادة ٨٠: لا مكافأة" : "انتهاء بغير استقالة: كامل المكافأة",
  ];
  return { fullMinor, factorBp, awardMinor, years, steps };
}

/** بدل رصيد الإجازة غير المستخدم: الأجر اليومي × الأيام */
export function leaveEncashment(monthlyWageMinor: number, days: number, monthDays = 30) {
  return days > 0 ? divRound(monthlyWageMinor * days, monthDays) : 0;
}

/** استحقاق المخصص الشهري لمكافأة نهاية الخدمة حسب سنة الخدمة الحالية */
export function monthlyEosAccrual(wageMinor: number, daysServedAtMonthEnd: number, rules: Pick<HrRules, "eosFirstYearsMonthsBp" | "eosLaterYearsMonthsBp"> = DEFAULT_HR_RULES) {
  const rate = daysServedAtMonthEnd <= 5 * 365 ? rules.eosFirstYearsMonthsBp : rules.eosLaterYearsMonthsBp;
  return divRound(wageMinor * rate, 12 * 10000);
}

export interface SalaryInput {
  basicMinor: number;
  housingMinor: number;
  transportMinor: number;
  otherAllowancesMinor: number;
  hoursPerDay: number;
  saudi: boolean;
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
  // م١٠٧: أجر الساعة الإضافية = أجر الساعة الفعلي + ٥٠٪ من أجر الساعة الأساسي
  const overtime = i.overtimeMinutes > 0 ? divRound(i.overtimeMinutes * (fixedMonthly * 10000 + i.basicMinor * (rules.overtimeRateBp - 10000)), md * i.hoursPerDay * 60 * 10000) : 0;
  const gross = basic + housing + transport + other + overtime + i.bonusMinor + i.allowanceAdjMinor;

  const gosiBase = Math.min(i.basicMinor + i.housingMinor, rules.gosiCapMinor);
  const gosiEmployee = i.gosiRegistered && i.saudi ? applyBp(prorate(gosiBase), rules.gosiSaudiEmployeeBp) : 0;
  const gosiEmployer = i.gosiRegistered ? applyBp(prorate(gosiBase), i.saudi ? rules.gosiSaudiEmployerBp : rules.gosiNonSaudiEmployerBp) : 0;
  const absence = rules.deductAbsence ? dailyWage * i.absentDays : 0;
  const unpaid = dailyWage * i.unpaidLeaveDays;
  const lateBillable = Math.max(0, i.lateMinutes - rules.lateMonthlyGraceMinutes);
  const late = rules.deductLate && lateBillable ? divRound(fixedMonthly * lateBillable, md * i.hoursPerDay * 60) : 0;
  if (lateBillable && rules.deductLate) notes.push(`تأخر محتسب ${lateBillable} دقيقة بعد مهلة ${rules.lateMonthlyGraceMinutes}`);

  // الاستقطاعات النظامية لا تتجاوز الإجمالي
  const statutory = Math.min(gross, gosiEmployee + absence + unpaid + late);
  // الاستقطاعات التقديرية بحد نصف الأجر المستحق (م٩٢)
  const room = Math.max(0, Math.min(Math.floor(gross / 2), gross - statutory));
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
  if (cappedMinor) notes.push("خُفّضت الاستقطاعات التقديرية لسقف نصف الأجر (المادة ٩٢)");
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

/** رقم آيبان سعودي صالح (فحص MOD-97) */
export function validIban(iban: string) {
  const s = iban.replace(/\s/g, "").toUpperCase();
  if (!/^SA\d{22}$/.test(s)) return false;
  const moved = s.slice(4) + s.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of digits) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}
