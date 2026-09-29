import { Suspense } from "react";
import { LoansPage } from "@/components/hr/payroll";

export default function Page() {
  return (
    <Suspense>
      <LoansPage />
    </Suspense>
  );
}
