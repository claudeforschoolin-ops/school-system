/**
 * صندوق الإرسال: واجهة موحدة لإرسال البريد والرسائل النصية.
 * في المرحلة ١ لا يوجد مزوّد فعلي، فتُحفظ الرسائل في OutboundMessage
 * وتظهر في «صندوق الإرسال» ضمن مركز الإدارة، وتُطبع في سجل الخادم أثناء التطوير.
 */
import { rootDb } from "@/server/db/client";

export type OutboundChannel = "email" | "sms" | "whatsapp" | "push";

export interface OutboundInput {
  tenantId: string;
  channel: OutboundChannel;
  to: string;
  subject?: string;
  body: string;
}

export async function deliver(input: OutboundInput): Promise<void> {
  await rootDb.outboundMessage.create({
    data: {
      tenantId: input.tenantId,
      channel: input.channel,
      to: input.to,
      subject: input.subject ?? null,
      body: input.body,
      status: "LOGGED",
    },
  });
  if (process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test") {
    console.info(`[outbox:${input.channel}] → ${input.to}: ${input.subject ?? ""}\n${input.body}`);
  }
}
