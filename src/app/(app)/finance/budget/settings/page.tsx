import { Suspense } from "react";
import { BudgetSettingsPage } from "@/components/ops/budget";

export default function Page() {
  return (
    <Suspense>
      <BudgetSettingsPage />
    </Suspense>
  );
}
