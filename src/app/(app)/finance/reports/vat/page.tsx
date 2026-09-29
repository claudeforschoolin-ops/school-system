import { Suspense } from "react";
import { VatReport } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <VatReport />
    </Suspense>
  );
}
