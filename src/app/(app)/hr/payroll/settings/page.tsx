import { Suspense } from "react";
import { PayrollSettingsPage } from "@/components/hr/payroll-settings";

export default function Page() {
  return (
    <Suspense>
      <PayrollSettingsPage />
    </Suspense>
  );
}
