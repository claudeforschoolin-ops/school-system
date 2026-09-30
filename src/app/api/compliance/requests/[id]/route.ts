/**
 * نسخة بيانات صاحب الطلب (JSON مضغوط): لمسؤول الامتثال، ولمقدّم الطلب بعد اكتماله.
 */
import { getCurrentSession } from "@/server/auth/current";
import { NETWORK_BLOCKED_MESSAGE, requestNetworkAllowed } from "@/server/auth/network";
import { requestExportFile } from "@/server/services/compliance.service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session || session.requires2faChallenge) return new Response("غير مصرح", { status: 401 });
  if (!(await requestNetworkAllowed(session))) return new Response(NETWORK_BLOCKED_MESSAGE, { status: 403 });
  const { id } = await ctx.params;
  try {
    const file = await requestExportFile(session, id);
    return new Response(new Uint8Array(file.buffer), { headers: { "content-type": "application/gzip", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, "cache-control": "private, no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "غير متاح", { status: 403 });
  }
}
