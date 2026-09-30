/**
 * تنزيل ملف تشغيل مجدول لتقرير: لمالكه ومستلميه ومن يملك صلاحية مجموعة بياناته فقط.
 */
import { getCurrentSession } from "@/server/auth/current";
import { runFile } from "@/server/services/analytics/reports.service";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session || session.requires2faChallenge) return new Response("غير مصرح", { status: 401 });
  const { id } = await ctx.params;
  try {
    const file = await runFile(session, id);
    return new Response(new Uint8Array(file.buffer), { headers: { "content-type": file.mime, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, "cache-control": "private, no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "غير متاح", { status: 403 });
  }
}
