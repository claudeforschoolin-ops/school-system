import { describe, expect, it } from "vitest";
import { DEFAULT_HR_RULES, eosAward, lateMinutes, leaveEncashment, monthlyEosAccrual, salaryLine, serviceDays, validIban, workingDays, type SalaryInput } from "@/lib/hr/calc";

const base: SalaryInput = { basicMinor: 1_000_000, housingMinor: 250_000, transportMinor: 100_000, otherAllowancesMinor: 0, hoursPerDay: 8, citizen: true, gosiRegistered: true, absentDays: 0, unpaidLeaveDays: 0, lateMinutes: 0, overtimeMinutes: 0, bonusMinor: 0, allowanceAdjMinor: 0, penaltyMinor: 0, otherDeductionMinor: 0, loanDueMinor: 0 };

describe("مكافأة نهاية الخدمة", () => {
  it("نصف شهر لكل سنة من الخمس الأولى وشهر لما بعدها", () => {
    expect(eosAward(1_000_000, 365 * 3, "TERMINATION").awardMinor).toBe(1_500_000);
    // ٥ سنوات × نصف + ٣ × كامل = ٥٫٥ شهر
    expect(eosAward(1_000_000, 365 * 8, "CONTRACT_END").awardMinor).toBe(5_500_000);
  });
  it("الاستقالة: لا شيء قبل سنتين، ثلث، ثلثان، كاملة", () => {
    expect(eosAward(1_000_000, 365, "RESIGNATION").awardMinor).toBe(0);
    expect(eosAward(1_200_000, 365 * 3, "RESIGNATION").awardMinor).toBe(600_000); // ١٫٥ شهر × ⅓
    expect(eosAward(1_200_000, 365 * 6, "RESIGNATION").awardMinor).toBe(2_800_000); // ٣٫٥ × ⅔
    expect(eosAward(1_000_000, 365 * 12, "RESIGNATION").awardMinor).toBe(9_500_000);
    expect(eosAward(1_000_000, 365 * 12, "ARTICLE_80").awardMinor).toBe(0);
  });
  it("كسور السنة بنسبتها، وأيام الخدمة شاملة", () => {
    expect(serviceDays("2024-01-01", "2024-12-31")).toBe(366);
    expect(eosAward(730_000, 365 + 182, "TERMINATION").awardMinor).toBe(Math.floor((730_000 * 547 * 5000 * 2 + 3_650_000) / (3_650_000 * 2)));
  });
  it("بدل الإجازة والمخصص الشهري", () => {
    expect(leaveEncashment(1_350_000, 10)).toBe(450_000);
    expect(monthlyEosAccrual(1_200_000, 400)).toBe(50_000);
    expect(monthlyEosAccrual(1_200_000, 365 * 6)).toBe(100_000);
  });
});

describe("سطر الراتب", () => {
  it("الإجمالي والتأمينات للمواطن (الإعداد الافتراضي)", () => {
    const l = salaryLine(base);
    expect(l.grossMinor).toBe(1_350_000);
    expect(l.gosiEmployeeMinor).toBe(121_875); // 9.75% × 12,500
    expect(l.gosiEmployerMinor).toBe(146_875); // 11.75%
    expect(l.netMinor).toBe(1_350_000 - 121_875);
  });
  it("غير المواطن: حصة صاحب العمل للأخطار المهنية فقط", () => {
    const l = salaryLine({ ...base, citizen: false });
    expect(l.gosiEmployeeMinor).toBe(0);
    expect(l.gosiEmployerMinor).toBe(25_000);
  });
  it("الغياب بالأجر اليومي والتأخر بعد المهلة", () => {
    const l = salaryLine({ ...base, absentDays: 2, lateMinutes: 90 });
    expect(l.absenceMinor).toBe(90_000); // 1,350,000 ÷ 30 × 2
    expect(l.lateMinor).toBe(Math.floor((1_350_000 * 30 * 2 + 14_400) / (14_400 * 2))); // ٣٠ دقيقة محتسبة
  });
  it("العمل الإضافي (م١٠٧): أجر الساعة + ٥٠٪ من الأساسي", () => {
    const l = salaryLine({ ...base, overtimeMinutes: 600 });
    // ساعة كاملة = 1,350,000/240 = 5625، ونصف الأساسي = 1,000,000/240/2 ≈ 2083.3 → ١٠ ساعات ≈ 77,083
    expect(l.overtimeMinor).toBe(77_083);
  });
  it("الاستقطاعات التقديرية بحد نصف الأجر، والصافي لا يكون سالباً", () => {
    const l = salaryLine({ ...base, gosiRegistered: false, loanDueMinor: 900_000, penaltyMinor: 100_000 });
    expect(l.loanMinor + l.penaltyMinor).toBe(675_000);
    expect(l.cappedMinor).toBe(325_000);
    const all = salaryLine({ ...base, absentDays: 40 });
    expect(all.netMinor).toBeGreaterThanOrEqual(0);
  });
  it("الاستحقاق الجزئي لمن عُيّن خلال الشهر", () => {
    const l = salaryLine({ ...base, paidDays: 15, gosiRegistered: false });
    expect(l.grossMinor).toBe(675_000);
  });
  it("القواعد الافتراضية", () => expect(DEFAULT_HR_RULES.monthDays).toBe(30));
});

describe("أدوات الدوام", () => {
  it("أيام العمل والتأخر والآيبان", () => {
    expect(workingDays("2026-09-27", "2026-10-03", [0, 1, 2, 3, 4])).toEqual(["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]);
    expect(lateMinutes("07:12", "07:00", 10)).toBe(12);
    expect(lateMinutes("07:08", "07:00", 10)).toBe(0);
    expect(validIban("SA0380000000608010167519")).toBe(true);
    expect(validIban("SA0380000000608010167518")).toBe(false);
  });
});

describe("القواعد قابلة للتعديل لأي دولة", () => {
  it("أنظمة تأمين مخصصة: على الجميع، بلا سقف، وعلى الأجر الكامل", () => {
    const rules = { ...DEFAULT_HR_RULES, insuranceSchemes: [{ name: "ضمان", appliesTo: "ALL" as const, employeeBp: 700, employerBp: 1400 }], insuranceBase: "FULL" as const, insuranceCapMinor: 0 };
    const l = salaryLine({ ...base, citizen: false }, rules);
    expect(l.gosiEmployeeMinor).toBe(94_500); // 7% × 1,350,000
    expect(l.gosiEmployerMinor).toBe(189_000);
  });
  it("الإضافي بالأجر الكامل × المعامل", () => {
    const l = salaryLine({ ...base, overtimeMinutes: 600 }, { ...DEFAULT_HR_RULES, overtimeMode: "FULL_WAGE", overtimeRateBp: 12500 });
    expect(l.overtimeMinor).toBe(70_313); // 5625 × 1.25 × 10
  });
  it("سقف الاستقطاعات التقديرية من الإعدادات", () => {
    const l = salaryLine({ ...base, gosiRegistered: false, loanDueMinor: 900_000 }, { ...DEFAULT_HR_RULES, deductionCapBp: 2000 });
    expect(l.loanMinor).toBe(270_000);
  });
  it("مكافأة نهاية خدمة بجدول مخصص، أو معطلة", () => {
    const rules = { ...DEFAULT_HR_RULES, eosFirstYears: 3, eosFirstYearsMonthsBp: 7000, eosLaterYearsMonthsBp: 10000, eosResignation: [{ minYears: 1, factorBp: 5000 }] };
    expect(eosAward(1_000_000, 365 * 4, "TERMINATION", rules).awardMinor).toBe(3_100_000);
    expect(eosAward(1_000_000, 365 * 4, "RESIGNATION", rules).awardMinor).toBe(1_550_000);
    expect(eosAward(1_000_000, 365 * 4, "TERMINATION", { ...rules, eosEnabled: false }).awardMinor).toBe(0);
    expect(monthlyEosAccrual(1_200_000, 400, { ...rules, eosEnabled: false })).toBe(0);
  });
});
