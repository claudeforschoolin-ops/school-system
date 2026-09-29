import { Suspense } from "react";
import { FinanceSettingsPage } from "@/components/finance/setup";

export default function Page() {
  return (
    <Suspense>
      <FinanceSettingsPage />
    </Suspense>
  );
}
