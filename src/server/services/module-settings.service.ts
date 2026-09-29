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
import { forbidden } from "@/server/errors";
import { DEFAULT_TEMPLATES } from "./guardian-messages";

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
    vatNumber: z.string().trim().regex(/^(\d{15})?$/, "الرقم الضريبي ١٥ رقماً"),
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
  messageTemplates: {},
} as const;

/** الوحدة التي تحكم كل مجموعة إعدادات */
const OWNER_MODULE: Record<ModuleSettingsKey, string> = { students: "students", admissions: "admissions", attendance: "attendance", finance: "accounting", messageTemplates: "settings" };

export function readModuleSettings<K extends ModuleSettingsKey>(tenantSettings: unknown, key: K): z.infer<(typeof MODULE_SETTINGS_SCHEMAS)[K]> {
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
  const current = readModuleSettings(tenant.settings, key);
  const parsed = MODULE_SETTINGS_SCHEMAS[key].parse({ ...current, ...((patch ?? {}) as object) });
  const settings = { ...((tenant.settings ?? {}) as Record<string, unknown>), [key]: parsed };
  await db.tenant.update({ where: { id: session.tenant.id }, data: { settings: settings as Prisma.InputJsonValue } });
  return { values: parsed };
}
