"use client";
/**
 * موفّرو السياق على مستوى التطبيق: tRPC و React Query والتلميحات والإشعارات المنبثقة.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, loggerLink, TRPCClientError } from "@trpc/client";
import { MotionConfig } from "motion/react";
import { Tooltip } from "radix-ui";
import { useState, type ReactNode } from "react";
import superjson from "superjson";
import { trpc } from "@/lib/trpc/client";
import { Toaster, toast } from "@/components/ui/toast";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => {
          if (error instanceof TRPCClientError) {
            const code = (error.data as { code?: string } | undefined)?.code;
            if (code && ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST"].includes(code)) return false;
          }
          return count < 2;
        },
      },
      mutations: {
        onError: (error) => {
          toast.error(error instanceof Error ? error.message : "تعذر تنفيذ العملية");
        },
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        // سجل أخطاء التطوير فقط — ويستثني المصادقة والحساب حتى لا تظهر كلمات المرور والرموز في السجلات
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" && op.direction === "down" && op.result instanceof Error && !/^(auth|account)\./.test(op.result.data?.path ?? "auth."),
        }),
        httpBatchLink({ url: "/api/trpc", transformer: superjson, maxURLLength: 4000 }),
      ],
    }),
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <MotionConfig reducedMotion="user">
          <Tooltip.Provider delayDuration={400} skipDelayDuration={200}>
            {children}
            <Toaster />
          </Tooltip.Provider>
        </MotionConfig>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
