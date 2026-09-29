/**
 * تذكيرات السداد الآلية لأولياء الأمور بأربع مراحل:
 * قبل الاستحقاق بثلاثة أيام، يوم الاستحقاق، بعد ٧ أيام تأخير، وإشعار أخير بعد ٣٠ يوماً.
 * رسالة واحدة لكل أسرة في كل تشغيل (بأشد مرحلة مستحقة ومجموع مبالغها)، وكل مرحلة تُرسل مرة واحدة لكل فاتورة.
 * تُستثنى الفواتير الموقوفة تذكيراتها، ويُحترم إعداد «تذكيرات السداد الآلية».
 * تُشغَّل يومياً من /api/cron/finance أو يدوياً من شاشة الفواتير.
 */
import { formatMoney } from "@/lib/money";
import type { SessionTenant } from "@/server/auth/session";
import type { TenantDb } from "@/server/db/tenant";
import { renderTemplate } from "@/server/services/guardian-messages";
import { notify } from "@/server/services/notifications.service";
import { deliver } from "@/server/services/outbox";
import type { TemplateKey } from "@/server/services/template-defaults";
import { readModuleSettings } from "@/server/services/module-settings.service";
import { daysBetween } from "@/lib/finance/calc";
import { dateOnly, isoOf } from "./common";

export const REMINDER_STAGES = [
  { level: 1, key: "reminder_before", label: "قبل الاستحقاق بثلاثة أيام" },
  { level: 2, key: "reminder_due", label: "يوم الاستحقاق" },
  { level: 3, key: "reminder_overdue", label: "بعد ٧ أيام من التأخير" },
  { level: 4, key: "reminder_final", label: "إشعار أخير بعد ٣٠ يوماً" },
] as const satisfies ReadonlyArray<{ level: number; key: TemplateKey; label: string }>;

/** مرحلة التذكير حسب الأيام منذ الاستحقاق (سالبة قبله)؛ صفر = لا تذكير اليوم */
export function reminderLevel(daysSinceDue: number): 0 | 1 | 2 | 3 | 4 {
  if (daysSinceDue >= 30) return 4;
  if (daysSinceDue >= 7) return 3;
  if (daysSinceDue === 0) return 2;
  if (daysSinceDue >= -3 && daysSinceDue < 0) return 1;
  return 0;
}

export async function runPaymentReminders(
  db: TenantDb,
  tenant: SessionTenant,
  actorId: string | null,
  asOfIso: string,
) {
  if (!readModuleSettings(tenant.settings, "finance").remindersEnabled)
    return { families: 0, invoices: 0, disabled: true };
  const asOf = dateOnly(asOfIso);
  const invoices = await db.invoice.findMany({
    where: {
      status: { in: ["ISSUED", "PARTIAL"] },
      deletedAt: null,
      remindersPaused: false,
      guardianId: { not: null },
    },
    include: { installments: { orderBy: { seq: "asc" } }, student: { select: { fullName: true } } },
  });
  type Due = {
    invoiceId: string;
    level: number;
    key: number;
    amount: number;
    days: number;
    dueDate: Date;
    student: string;
  };
  const byFamily = new Map<string, Due[]>();
  for (const inv of invoices) {
    // المتبقي على الأقساط بعد الإشعارات الدائنة (الأقدم أولاً)
    let credited = inv.creditedMinor;
    const unpaid = inv.installments
      .map((i) => {
        let left = i.amountMinor - i.paidMinor;
        const c = Math.min(credited, Math.max(0, left));
        left -= c;
        credited -= c;
        return { seq: i.seq, dueDate: i.dueDate, left };
      })
      .filter((i) => i.left > 0);
    const first = unpaid[0];
    if (!first) continue;
    const days = daysBetween(first.dueDate, asOf);
    const level = reminderLevel(days);
    // المرحلة تُحفظ مركّبة مع رقم القسط (القسط × ١٠ + المرحلة) لتبدأ تذكيرات كل قسط من جديد
    const key = first.seq * 10 + level;
    if (!level || key <= inv.reminderLevel) continue;
    const amount =
      level >= 3 ? unpaid.filter((i) => i.dueDate <= asOf).reduce((s, i) => s + i.left, 0) : first.left;
    const list = byFamily.get(inv.guardianId!) ?? [];
    list.push({
      invoiceId: inv.id,
      level,
      key,
      amount,
      days,
      dueDate: first.dueDate,
      student: inv.student.fullName,
    });
    byFamily.set(inv.guardianId!, list);
  }
  let sentFamilies = 0;
  let marked = 0;
  const guardians = byFamily.size
    ? await db.guardian.findMany({
        where: { id: { in: [...byFamily.keys()] } },
        select: { id: true, phone: true, userId: true },
      })
    : [];
  for (const [guardianId, dues] of byFamily) {
    const top = Math.max(...dues.map((d) => d.level));
    const stage = REMINDER_STAGES.find((s) => s.level === top)!;
    const same = dues.filter((d) => d.level === top);
    const g = guardians.find((x) => x.id === guardianId);
    const body = renderTemplate({ tenant }, stage.key, {
      student: [...new Set(same.map((d) => d.student))].join("، "),
      amount: formatMoney(
        same.reduce((s, d) => s + d.amount, 0),
        { currency: tenant.currency },
      ),
      dueDate: isoOf(same[0]!.dueDate),
      days: Math.max(...same.map((d) => d.days)),
    });
    if (g?.phone) await deliver({ tenantId: tenant.id, channel: "sms", to: g.phone, body });
    if (g?.userId)
      await notify(db, {
        tenantId: tenant.id,
        userIds: [g.userId],
        type: "SYSTEM",
        title: "تذكير بالسداد",
        body,
        link: `/finance/families/${guardianId}`,
        actorId,
        entityType: "Guardian",
        entityId: guardianId,
      });
    sentFamilies++;
    // فواتير المرحلة المرسلة تُعلَّم حتى لا تتكرر؛ الأخف مرحلةً تُذكَّر في تشغيل لاحق
    for (const d of same) {
      await db.invoice.update({
        where: { id: d.invoiceId },
        data: { reminderLevel: d.key, lastReminderAt: new Date() },
      });
      marked++;
    }
  }
  return { families: sentFamilies, invoices: marked, disabled: false };
}
