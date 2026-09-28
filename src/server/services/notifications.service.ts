/**
 * الإشعارات: إنشاء إشعارات داخلية للمستخدمين (إشارة، تعليق، إسناد، موافقة...).
 */
import type { NotificationType } from "@/generated/prisma/enums";
import type { TenantDb } from "@/server/db/tenant";

export interface NotifyInput {
  tenantId: string;
  userIds: readonly string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

/** ينشئ إشعاراً لكل مستلم (مع استبعاد الفاعل نفسه والمكرر) */
export async function notify(db: TenantDb, input: NotifyInput): Promise<number> {
  const recipients = [...new Set(input.userIds)].filter((id) => id && id !== input.actorId);
  if (recipients.length === 0) return 0;
  // التأكد أن المستلمين من نفس المستأجر وفعّالون
  const valid = await db.user.findMany({
    where: { id: { in: recipients }, status: "ACTIVE", deletedAt: null },
    select: { id: true },
  });
  if (valid.length === 0) return 0;
  const result = await db.notification.createMany({
    data: valid.map((u) => ({
      tenantId: input.tenantId,
      userId: u.id,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      actorId: input.actorId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
    })),
  });
  return result.count;
}
