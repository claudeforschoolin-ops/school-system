import { Suspense } from "react";
import { DailyCashReport } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <DailyCashReport />
    </Suspense>
  );
}
