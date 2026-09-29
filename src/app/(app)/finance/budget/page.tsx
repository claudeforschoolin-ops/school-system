import { Suspense } from "react";
import { BudgetsPage } from "@/components/ops/budget";

export default function Page() {
  return (
    <Suspense>
      <BudgetsPage />
    </Suspense>
  );
}
