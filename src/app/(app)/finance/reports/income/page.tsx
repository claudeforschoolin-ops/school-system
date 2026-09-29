import { Suspense } from "react";
import { IncomeStatementReport } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <IncomeStatementReport />
    </Suspense>
  );
}
