import { Suspense } from "react";
import { PayrollPage } from "@/components/hr/payroll";

export default function Page() {
  return (
    <Suspense>
      <PayrollPage />
    </Suspense>
  );
}
