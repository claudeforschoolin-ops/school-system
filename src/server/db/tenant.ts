/**
 * العميل المقيّد بالمستأجر + التدقيق التلقائي.
 * ---------------------------------------------------------------------
 * - يحقن tenantId في كل استعلام قراءة/كتابة (where/data) إلزامياً.
 * - يرفض أي محاولة لإنشاء/نقل سجل إلى مستأجر آخر.
 * - يسجّل كل إنشاء/تعديل/حذف في AuditLog مع القيمة القديمة والجديدة
 *   (الحقول المتغيرة فقط)، والمستخدم، وعنوان IP، ووكيل المستخدم.
 *
 * اصطلاح: استخدم دائماً مدخلات «غير مفحوصة» (unchecked) أي معرّفات المفاتيح
 * الأجنبية مباشرة (roleId: "...") وليس connect، وتجنّب الإنشاء المتداخل.
 * الاستعلامات الخام ($queryRaw) غير مقيّدة تلقائياً: يجب تمرير tenantId يدوياً.
 */
import { rootDb } from "./client";
import { diffRecords, redact } from "./audit-utils";

export interface TenantContext {
  tenantId: string;
  actor?: { id: string; name: string } | null;
  ip?: string | null;
  userAgent?: string | null;
}

export class TenantIsolationError extends Error {
  constructor(message = "محاولة وصول إلى بيانات مستأجر آخر") {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/** كيانات لا تحمل tenantId */
const UNSCOPED_MODELS = new Set(["Tenant"]);

/** كيانات لا تُسجَّل تعديلاتها تلقائياً (إما سجلات بذاتها أو عالية التكرار بلا قيمة تدقيقية) */
export const NOT_AUDITED_MODELS = new Set([
  "AuditLog",
  "Session",
  "AuthToken",
  "Notification",
  "RecentVisit",
  "OutboundMessage",
  "Mention",
  "AutomationRun",
  "PageVersion",
  "Message",
  "ConversationMember",
  // عدّادات الترقيم: تتغير مع كل سجل جديد ويظهر أثرها في سجل الكيان نفسه
  "Sequence",
]);

const READ_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);
const WHERE_WRITE_OPS = new Set(["update", "updateMany", "updateManyAndReturn", "delete", "deleteMany", "upsert"]);
const CREATE_OPS = new Set(["create", "createMany", "createManyAndReturn"]);

type AnyArgs = Record<string, unknown>;
type Delegate = {
  findFirst: (args: AnyArgs) => Promise<Record<string, unknown> | null>;
};

function delegateOf(model: string): Delegate {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  return (rootDb as unknown as Record<string, Delegate>)[key]!;
}

function withTenant(data: unknown, tenantId: string): AnyArgs {
  const record = (data ?? {}) as AnyArgs;
  if (record.tenantId !== undefined && record.tenantId !== tenantId) throw new TenantIsolationError();
  return { ...record, tenantId };
}

function assertNoTenantChange(data: unknown, tenantId: string): void {
  const record = (data ?? {}) as AnyArgs;
  if (record.tenantId !== undefined && record.tenantId !== tenantId) throw new TenantIsolationError();
}

/** يطبّق قيد المستأجر على وسائط العملية (مُصدَّر للاختبار) */
export function scopeArgs(model: string, operation: string, args: unknown, tenantId: string): AnyArgs {
  const a: AnyArgs = { ...((args ?? {}) as AnyArgs) };

  if (model === "Tenant") {
    if (CREATE_OPS.has(operation) || operation === "delete" || operation === "deleteMany" || operation === "upsert") {
      throw new TenantIsolationError("لا يمكن إنشاء أو حذف مستأجر من سياق مستأجر");
    }
    a.where = { ...((a.where as AnyArgs) ?? {}), id: tenantId };
    return a;
  }
  if (UNSCOPED_MODELS.has(model)) return a;

  if (READ_OPS.has(operation) || WHERE_WRITE_OPS.has(operation)) {
    a.where = { ...((a.where as AnyArgs) ?? {}), tenantId };
  }
  if (operation === "create") a.data = withTenant(a.data, tenantId);
  if (operation === "createMany" || operation === "createManyAndReturn") {
    a.data = Array.isArray(a.data) ? a.data.map((d) => withTenant(d, tenantId)) : withTenant(a.data, tenantId);
  }
  if (operation === "upsert") {
    a.create = withTenant(a.create, tenantId);
    assertNoTenantChange(a.update, tenantId);
  }
  if (operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") {
    assertNoTenantChange(a.data, tenantId);
  }
  return a;
}

/**
 * يحوّل شرط «فريد» (قد يتضمن مفتاحاً مركّباً مثل tenantId_key: {tenantId, key}) إلى شرط يقبله findFirst،
 * لالتقاط الحالة «قبل» التعديل في سجل التدقيق.
 */
export function uniqueToFilter(where: AnyArgs | undefined): AnyArgs {
  const out: AnyArgs = {};
  for (const [k, v] of Object.entries(where ?? {})) {
    const parts = k.split("_");
    if (parts.length > 1 && v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && Object.keys(v).every((f) => parts.includes(f))) {
      Object.assign(out, v);
    } else out[k] = v;
  }
  return out;
}

function labelOf(record: Record<string, unknown> | null | undefined): string | null {
  if (!record) return null;
  for (const key of ["title", "name", "email", "key", "body"]) {
    const v = record[key];
    if (typeof v === "string" && v.trim()) return v.length > 120 ? `${v.slice(0, 117)}...` : v;
  }
  return null;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

/** كتابة قيد تدقيق يدوي (تسجيل دخول، تصدير، تغيير صلاحيات...) */
export async function writeAudit(ctx: TenantContext, entry: AuditEntry): Promise<void> {
  await rootDb.auditLog.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.actor?.id ?? null,
      userName: ctx.actor?.name ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      summary: entry.summary ?? null,
      oldValue: (entry.oldValue ?? undefined) as never,
      newValue: (entry.newValue ?? undefined) as never,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
  });
}

export function createTenantDb(ctx: TenantContext) {
  const { tenantId } = ctx;

  return rootDb.$extends({
    name: "tenant-scope-and-audit",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scoped = scopeArgs(model, operation, args, tenantId);
          const run = query as (a: AnyArgs) => Promise<unknown>;

          if (NOT_AUDITED_MODELS.has(model) || (model === "Tenant" && !WHERE_WRITE_OPS.has(operation))) {
            return run(scoped);
          }
          if (READ_OPS.has(operation)) return run(scoped);

          const hasSelect = Boolean(scoped.select);

          switch (operation) {
            case "create": {
              const result = (await run(scoped)) as Record<string, unknown>;
              const full = hasSelect && result?.id ? await delegateOf(model).findFirst({ where: { id: result.id } }) : result;
              await writeAudit(ctx, {
                action: "CREATE",
                entityType: model,
                entityId: (full?.id as string) ?? null,
                summary: labelOf(full),
                newValue: redact(full),
              });
              return result;
            }
            case "createMany":
            case "createManyAndReturn": {
              const result = await run(scoped);
              const rows = Array.isArray(scoped.data) ? scoped.data : [scoped.data];
              await writeAudit(ctx, {
                action: "CREATE_MANY",
                entityType: model,
                summary: `${rows.length} سجل`,
                newValue: { count: rows.length },
              });
              return result;
            }
            case "update":
            case "upsert": {
              const before = await delegateOf(model).findFirst({ where: uniqueToFilter(scoped.where as AnyArgs) });
              const result = (await run(scoped)) as Record<string, unknown>;
              const id = (before?.id ?? result?.id) as string | undefined;
              const after = hasSelect && id ? await delegateOf(model).findFirst({ where: { id } }) : result;
              if (!before) {
                await writeAudit(ctx, {
                  action: "CREATE",
                  entityType: model,
                  entityId: id ?? null,
                  summary: labelOf(after),
                  newValue: redact(after),
                });
                return result;
              }
              const diff = diffRecords(before, after);
              if (diff.changed.length === 0) return result;
              let action = "UPDATE";
              if (diff.changed.includes("deletedAt")) {
                action = after?.deletedAt ? "SOFT_DELETE" : "RESTORE";
              }
              await writeAudit(ctx, {
                action,
                entityType: model,
                entityId: id ?? null,
                summary: labelOf(after) ?? labelOf(before),
                oldValue: diff.oldValue,
                newValue: diff.newValue,
              });
              return result;
            }
            case "delete": {
              const before = await delegateOf(model).findFirst({ where: uniqueToFilter(scoped.where as AnyArgs) });
              const result = await run(scoped);
              await writeAudit(ctx, {
                action: "DELETE",
                entityType: model,
                entityId: (before?.id as string) ?? null,
                summary: labelOf(before),
                oldValue: redact(before),
              });
              return result;
            }
            case "updateMany":
            case "updateManyAndReturn":
            case "deleteMany": {
              const result = (await run(scoped)) as { count?: number } | unknown[];
              const count = Array.isArray(result) ? result.length : (result?.count ?? 0);
              if (count > 0) {
                const { tenantId: _t, ...where } = (scoped.where ?? {}) as AnyArgs;
                await writeAudit(ctx, {
                  action: operation === "deleteMany" ? "DELETE_MANY" : "UPDATE_MANY",
                  entityType: model,
                  summary: `${count} سجل`,
                  oldValue: { where },
                  newValue: operation === "deleteMany" ? { count } : { count, data: redact(scoped.data) },
                });
              }
              return result;
            }
            default:
              return run(scoped);
          }
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantDb>;
