import { Suspense } from "react";
import { FinanceHome } from "@/components/finance/dashboard";

export default function Page() {
  return (
    <Suspense>
      <FinanceHome />
    </Suspense>
  );
}
