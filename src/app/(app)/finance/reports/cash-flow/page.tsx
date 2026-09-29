import { Suspense } from "react";
import { CashFlowReport } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <CashFlowReport />
    </Suspense>
  );
}
