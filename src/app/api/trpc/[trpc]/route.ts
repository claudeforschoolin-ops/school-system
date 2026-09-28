/**
 * نقطة tRPC. تتحقق من أصل الطلب (Origin) للطلبات المعدِّلة كطبقة حماية إضافية من CSRF
 * بجانب ملفات تعريف الارتباط SameSite=Lax.
 */
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createContext } from "@/server/trpc/context";
import { appRouter } from "@/server/trpc/root";

function sameOrigin(req: Request): boolean {
  if (req.method === "GET" || req.method === "HEAD") return true;
  const origin = req.headers.get("origin");
  if (!origin) return true; // طلبات من نفس الصفحة في بعض المتصفحات لا ترسل Origin
  try {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function handler(req: Request) {
  if (!sameOrigin(req)) {
    return new Response(JSON.stringify({ error: "طلب مرفوض: مصدر غير موثوق" }), { status: 403, headers: { "content-type": "application/json" } });
  }
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ req }),
    onError({ error, path }) {
      if (error.code === "INTERNAL_SERVER_ERROR") console.error(`[trpc] ${path}`, error.cause ?? error);
    },
  });
}

export { handler as GET, handler as POST };
