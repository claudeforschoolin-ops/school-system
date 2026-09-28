/**
 * تسلسلات الترقيم لكل مدرسة (رقم أكاديمي، رقم طلب قبول، رقم تحويل…).
 * الزيادة ذرّية في قاعدة البيانات فلا يتكرر رقم مع الطلبات المتزامنة.
 */
import type { TenantDb } from "@/server/db/tenant";

export async function nextSequence(db: TenantDb, tenantId: string, key: string, defaults: { prefix?: string; padding?: number } = {}): Promise<{ value: number; formatted: string }> {
  await db.sequence.upsert({
    where: { tenantId_key: { tenantId, key } },
    create: { tenantId, key, prefix: defaults.prefix ?? "", padding: defaults.padding ?? 5, nextValue: 1 },
    update: {},
  });
  const updated = await db.sequence.update({ where: { tenantId_key: { tenantId, key } }, data: { nextValue: { increment: 1 } } });
  const value = updated.nextValue - 1;
  return { value, formatted: `${updated.prefix}${String(value).padStart(updated.padding, "0")}` };
}

/** رقم تسلسلي بسيط لسجلات الوحدات (يبدأ من ١) */
export async function nextNumber(db: TenantDb, tenantId: string, key: string): Promise<number> {
  return (await nextSequence(db, tenantId, key)).value;
}
