import { Suspense } from "react";
import { BalanceSheetReport } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <BalanceSheetReport />
    </Suspense>
  );
}
