/**
 * إعدادات الوحدات (تُحفظ في إعدادات المدرسة): المستندات المطلوبة، ترقيم الطلاب، نموذج القبول العام،
 * قواعد الحضور، وقوالب رسائل أولياء الأمور. التعديل يتطلب صلاحية الوحدة على مستوى المدرسة كلها.
 */
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { DOCUMENT_TYPES } from "@/lib/students";
import { resolveScope, can } from "@/lib/rbac/access";
import type { SessionData } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { badRequest, forbidden } from "@/server/errors";
import { DEFAULT_TEMPLATES } from "./guardian-messages";
import { DEFAULT_HR_RULES } from "@/lib/hr/calc";
import { presetRegion, readRegion, validTaxNumber } from "@/lib/region";

/** تعبير نمطي صالح (أو فارغ) */
const REGEX = z
  .string()
  .max(120)
  .refine((v) => {
    try {
      new RegExp(v);
      return true;
    } catch {
      return false;
    }
  }, "تعبير نمطي غير صالح");
const WAGE_BASIS = z.enum(["FULL", "BASIC", "BASIC_HOUSING"]);

export const MODULE_SETTINGS_SCHEMAS = {
  students: z.object({
    requiredDocuments: z.array(z.enum(DOCUMENT_TYPES.map((d) => d.id) as [string, ...string[]])).max(10),
    numberPrefix: z.string().trim().regex(/^[0-9A-Za-z-]{0,8}$/, "البادئة: أرقام أو حروف لاتينية (حتى ٨)").optional(),
    numberPadding: z.number().int().min(3).max(8),
  }),
  admissions: z.object({
    publicFormEnabled: z.boolean(),
    intro: z.string().trim().max(600).optional(),
  }),
  attendance: z.object({
    mode: z.enum(["DAILY", "PERIOD"]),
    lockHours: z.number().int().min(1).max(24 * 30),
    absenceThreshold: z.number().int().min(1).max(60),
    notifyAbsence: z.boolean(),
    notifyLate: z.boolean(),
  }),
  finance: z.object({
    legalName: z.string().trim().max(200),
    vatNumber: z.string().trim().max(30),
    crNumber: z.string().trim().max(20),
    address: z.string().trim().max(300),
    /** سندات الصرف فوق هذا المبلغ تتطلب اعتماد المدير */
    voucherApprovalLimitMinor: z.number().int().min(0),
    registrationDueDays: z.number().int().min(0).max(60),
    /** منع إصدار شهادة النقل مع وجود مديونية */
    blockTransferCertificate: z.boolean(),
    /** منع إعادة القيد للعام الجديد مع وجود مديونية */
    blockReenrollment: z.boolean(),
    remindersEnabled: z.boolean(),
    /** نسبة التحصيل المستهدفة من المستحق (نقاط أساس) */
    collectionTargetBp: z.number().int().min(0).max(10000),
  }),
  assessment: z.object({
    /** رئيس القسم لكل مادة (مراجعة الدرجات قبل اعتماد الوكيل): {subjectId: userId} */
    subjectHeads: z.record(z.string().max(64), z.string().max(64)),
    /** حجب الشهادة عن المدينين عند النشر (افتراضي لكل نشر جديد) */
    withholdOnDebt: z.boolean(),
    /** لا تُحجب الشهادة إن كان المتأخر أقل من هذا المبلغ (بأصغر وحدة) */
    withholdMinOverdueMinor: z.number().int().min(0),
    /** إظهار تقارير المتابعة (أثناء الفصل) لأولياء الأمور */
    progressVisibleToParents: z.boolean(),
    /** تنبيه «متعثر» تحت هذه النسبة (نقاط أساس) */
    atRiskBp: z.number().int().min(0).max(10000),
    /** نص إضافي أسفل الشهادة */
    reportCardFooter: z.string().trim().max(300),
  }),
  hr: z.object({
    /** أنظمة التأمين الاجتماعي (حتى ٦): على المواطن أو غير المواطن أو الجميع */
    insuranceSchemes: z
      .array(z.object({ name: z.string().trim().min(1).max(80), appliesTo: z.enum(["CITIZEN", "NON_CITIZEN", "ALL"]), employeeBp: z.number().int().min(0).max(5000), employerBp: z.number().int().min(0).max(5000) }))
      .max(6),
    /** الأجر الخاضع للتأمينات */
    insuranceBase: WAGE_BASIS,
    /** سقف الأجر الخاضع (بأصغر وحدة؛ 0 = بلا سقف) */
    insuranceCapMinor: z.number().int().min(0),
    /** خصم الغياب بغير عذر بأجر اليوم */
    deductAbsence: z.boolean(),
    /** خصم التأخير بالدقيقة بعد مهلة شهرية */
    deductLate: z.boolean(),
    lateMonthlyGraceMinutes: z.number().int().min(0).max(600),
    /** طريقة أجر الساعة الإضافية */
    overtimeMode: z.enum(["PREMIUM_ON_BASIC", "FULL_WAGE"]),
    /** معامل أجر الساعة الإضافية (نقاط أساس: 15000 = ١٫٥) */
    overtimeRateBp: z.number().int().min(10000).max(30000),
    /** أقل مدة بعد نهاية الدوام تُسجَّل عملاً إضافياً (دقيقة) */
    overtimeMinMinutes: z.number().int().min(0).max(240),
    /** أيام الشهر لاحتساب أجر اليوم */
    monthDays: z.number().int().min(22).max(31),
    /** سقف الاستقطاعات التقديرية من الأجر (نقاط أساس) */
    deductionCapBp: z.number().int().min(1000).max(10000),
    /** التنبيه قبل انتهاء الهوية/الإقامة/الجواز/العقد (أيام) */
    expiryAlertDays: z.number().int().min(7).max(180),
    /** مكافأة نهاية الخدمة */
    eosEnabled: z.boolean(),
    eosFirstYears: z.number().int().min(0).max(40),
    eosFirstYearsMonthsBp: z.number().int().min(0).max(30000),
    eosLaterYearsMonthsBp: z.number().int().min(0).max(30000),
    eosWageBasis: WAGE_BASIS,
    eosResignation: z.array(z.object({ minYears: z.number().min(0).max(40), factorBp: z.number().int().min(0).max(10000) })).max(8),
    eosYearDays: z.number().int().min(360).max(366),
    /** احتساب مخصص نهاية الخدمة شهرياً مع المسير */
    accrueEosMonthly: z.boolean(),
    /** الإجازة السنوية الإضافية بالأقدمية: أيام بعد عدد سنوات (0 = لا) */
    seniorLeaveDays: z.number().int().min(0).max(60),
    seniorLeaveAfterYears: z.number().int().min(0).max(40),
    /** ملف تحويل الرواتب للبنك */
    wpsDelimiter: z.enum(["COMMA", "SEMICOLON", "TAB"]),
    wpsEmployerId: z.string().trim().max(40),
    wpsIncludeHeader: z.boolean(),
    /** أساس بدل رصيد الإجازة عند التصفية */
    leaveEncashmentBasis: WAGE_BASIS,
    /** أقصى السلفة بعدد الرواتب الأساسية (0 = بلا حد) */
    loanMaxSalaries: z.number().int().min(0).max(24),
    /** معالجة الجزاءات: تخفيض مصروف الرواتب أو التزام لصندوق/جهة */
    penaltiesTreatment: z.enum(["REDUCE_EXPENSE", "LIABILITY"]),
  }),
  region: z.object({
    country: z.string().regex(/^[A-Z]{2}$|^INTL$/),
    citizenIdLabel: z.string().trim().min(2).max(40),
    residentIdLabel: z.string().trim().min(2).max(40),
    citizenIdPattern: REGEX,
    residentIdPattern: REGEX,
    idLuhn: z.boolean(),
    dialCode: z.string().regex(/^\d{0,4}$/),
    mobilePattern: REGEX,
    trunkPrefix: z.string().regex(/^\d{0,2}$/),
    mobileHint: z.string().trim().max(30),
    ibanCountry: z.string().regex(/^([A-Z]{2})?$/),
    ibanLength: z.number().int().min(0).max(34),
    taxNumberLabel: z.string().trim().min(2).max(60),
    taxNumberPattern: REGEX,
    weekendDays: z.array(z.number().int().min(0).max(6)).max(3),
  }),
  messageTemplates: z.object(Object.fromEntries(Object.keys(DEFAULT_TEMPLATES).map((k) => [k, z.string().trim().max(500).optional()])) as Record<keyof typeof DEFAULT_TEMPLATES, z.ZodOptional<z.ZodString>>),
} as const;
export type ModuleSettingsKey = keyof typeof MODULE_SETTINGS_SCHEMAS;

export const MODULE_SETTINGS_DEFAULTS = {
  students: { requiredDocuments: DOCUMENT_TYPES.filter((d) => d.required).map((d) => d.id), numberPrefix: undefined, numberPadding: 4 },
  admissions: { publicFormEnabled: true, intro: "" },
  attendance: { mode: "DAILY", lockHours: 48, absenceThreshold: 5, notifyAbsence: true, notifyLate: false },
  finance: {
    legalName: "",
    vatNumber: "",
    crNumber: "",
    address: "",
    voucherApprovalLimitMinor: 500000,
    registrationDueDays: 7,
    blockTransferCertificate: true,
    blockReenrollment: false,
    remindersEnabled: true,
    collectionTargetBp: 9000,
  },
  assessment: { subjectHeads: {}, withholdOnDebt: true, withholdMinOverdueMinor: 0, progressVisibleToParents: true, atRiskBp: 6000, reportCardFooter: "" },
  hr: {
    insuranceSchemes: DEFAULT_HR_RULES.insuranceSchemes,
    insuranceBase: DEFAULT_HR_RULES.insuranceBase,
    insuranceCapMinor: DEFAULT_HR_RULES.insuranceCapMinor,
    deductAbsence: true,
    deductLate: true,
    lateMonthlyGraceMinutes: 60,
    overtimeMode: "PREMIUM_ON_BASIC",
    overtimeRateBp: 15000,
    overtimeMinMinutes: 30,
    monthDays: 30,
    deductionCapBp: 5000,
    expiryAlertDays: 60,
    eosEnabled: true,
    eosFirstYears: 5,
    eosFirstYearsMonthsBp: 5000,
    eosLaterYearsMonthsBp: 10000,
    eosWageBasis: "FULL",
    eosResignation: DEFAULT_HR_RULES.eosResignation,
    eosYearDays: 365,
    accrueEosMonthly: true,
    seniorLeaveDays: 30,
    seniorLeaveAfterYears: 5,
    wpsDelimiter: "COMMA",
    wpsEmployerId: "",
    wpsIncludeHeader: true,
    penaltiesTreatment: "REDUCE_EXPENSE",
    loanMaxSalaries: 3,
    leaveEncashmentBasis: "FULL",
  },
  region: presetRegion("SA"),
  messageTemplates: {},
} as const;

/** الوحدة التي تحكم كل مجموعة إعدادات */
const OWNER_MODULE: Record<ModuleSettingsKey, string> = { students: "students", admissions: "admissions", attendance: "attendance", finance: "accounting", assessment: "grade_entry", hr: "employees", region: "settings", messageTemplates: "settings" };

export function readModuleSettings<K extends ModuleSettingsKey>(tenantSettings: unknown, key: K): z.infer<(typeof MODULE_SETTINGS_SCHEMAS)[K]> {
  if (key === "region") return readRegion(tenantSettings) as z.infer<(typeof MODULE_SETTINGS_SCHEMAS)[K]>;
  const raw = ((tenantSettings ?? {}) as Record<string, unknown>)[key];
  return { ...MODULE_SETTINGS_DEFAULTS[key], ...((raw ?? {}) as object) } as z.infer<(typeof MODULE_SETTINGS_SCHEMAS)[K]>;
}

export function canEditModuleSettings(session: SessionData, key: ModuleSettingsKey) {
  if (can(session.access, "settings", "update")) return true;
  const scope = resolveScope(session.access, OWNER_MODULE[key], "update");
  return scope?.kind === "all";
}

export async function getModuleSettings(db: TenantDb, session: SessionData, key: ModuleSettingsKey) {
  const tenant = await db.tenant.findFirstOrThrow({ where: { id: session.tenant.id }, select: { settings: true } });
  return { values: readModuleSettings(tenant.settings, key), canEdit: canEditModuleSettings(session, key) };
}

export async function updateModuleSettings(db: TenantDb, session: SessionData, key: ModuleSettingsKey, patch: unknown) {
  if (!canEditModuleSettings(session, key)) throw forbidden("تعديل إعدادات الوحدة يتطلب صلاحيتها على مستوى المدرسة كاملة");
  const tenant = await db.tenant.findFirstOrThrow({ where: { id: session.tenant.id }, select: { settings: true } });
  let current: object = readModuleSettings(tenant.settings, key);
  const p = (patch ?? {}) as Record<string, unknown>;
  // تغيير الدولة يبدأ من قيمها الافتراضية ثم يطبق ما عُدّل صراحة
  if (key === "region" && typeof p.country === "string" && p.country !== (current as { country: string }).country) current = presetRegion(p.country);
  const parsed = MODULE_SETTINGS_SCHEMAS[key].parse({ ...current, ...p });
  if (key === "finance") {
    const region = readRegion(tenant.settings);
    if (!validTaxNumber((parsed as { vatNumber: string }).vatNumber, region)) throw badRequest(`${region.taxNumberLabel}: الصيغة غير صحيحة لإعدادات الدولة`);
  }
  const settings = { ...((tenant.settings ?? {}) as Record<string, unknown>), [key]: parsed };
  await db.tenant.update({ where: { id: session.tenant.id }, data: { settings: settings as Prisma.InputJsonValue } });
  return { values: parsed };
}
