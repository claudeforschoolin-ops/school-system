import { Suspense } from "react";
import { ProcurementSettingsPage } from "@/components/ops/inventory";

export default function Page() {
  return (
    <Suspense>
      <ProcurementSettingsPage />
    </Suspense>
  );
}
