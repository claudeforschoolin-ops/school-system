import { Suspense } from "react";
import { TrialBalanceReport } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <TrialBalanceReport />
    </Suspense>
  );
}
