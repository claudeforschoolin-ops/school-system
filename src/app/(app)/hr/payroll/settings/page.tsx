import { Suspense } from "react";
import { PayrollSettingsPage } from "@/components/hr/payroll";

export default function Page() {
  return (
    <Suspense>
      <PayrollSettingsPage />
    </Suspense>
  );
}
