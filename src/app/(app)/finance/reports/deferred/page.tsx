import { Suspense } from "react";
import { DeferredReport } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <DeferredReport />
    </Suspense>
  );
}
