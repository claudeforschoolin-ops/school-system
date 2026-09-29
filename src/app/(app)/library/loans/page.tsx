import { Suspense } from "react";
import { LoansPage } from "@/components/ops/library";

export default function Page() {
  return (
    <Suspense>
      <LoansPage />
    </Suspense>
  );
}
