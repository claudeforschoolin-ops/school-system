import { Suspense } from "react";
import { ReportsIndex } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <ReportsIndex />
    </Suspense>
  );
}
