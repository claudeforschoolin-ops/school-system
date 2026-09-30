/**
 * تنزيل البيانات الكاملة من نسخة احتياطية (JSON مضغوط): صلاحية التصدير وتحقق بخطوتين، ويُسجَّل في التدقيق.
 */
import { getCurrentSession } from "@/server/auth/current";
import { NETWORK_BLOCKED_MESSAGE, requestNetworkAllowed } from "@/server/auth/network";
import { downloadBackup } from "@/server/services/backup.service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session || session.requires2faChallenge) return new Response("غير مصرح", { status: 401 });
  if (!(await requestNetworkAllowed(session))) return new Response(NETWORK_BLOCKED_MESSAGE, { status: 403 });
  const { id } = await ctx.params;
  try {
    const file = await downloadBackup(session, id);
    return new Response(new Uint8Array(file.buffer), { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, "cache-control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "غير متاح", { status: 403 });
  }
}
