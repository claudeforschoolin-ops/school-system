import { Suspense } from "react";
import { AgingReport } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <AgingReport />
    </Suspense>
  );
}
