import { Suspense } from "react";
import { AdjustmentsPage } from "@/components/hr/payroll";

export default function Page() {
  return (
    <Suspense>
      <AdjustmentsPage />
    </Suspense>
  );
}
