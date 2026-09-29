import { Suspense } from "react";
import { CostCentersPage } from "@/components/finance/accounting";

export default function Page() {
  return (
    <Suspense>
      <CostCentersPage />
    </Suspense>
  );
}
