import { Suspense } from "react";
import { PeriodsPage } from "@/components/finance/accounting";

export default function Page() {
  return (
    <Suspense>
      <PeriodsPage />
    </Suspense>
  );
}
