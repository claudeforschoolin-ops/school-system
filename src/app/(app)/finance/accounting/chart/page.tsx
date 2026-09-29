import { Suspense } from "react";
import { ChartOfAccounts } from "@/components/finance/accounting";

export default function Page() {
  return (
    <Suspense>
      <ChartOfAccounts />
    </Suspense>
  );
}
