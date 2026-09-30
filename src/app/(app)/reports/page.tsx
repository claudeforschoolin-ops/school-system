import { Suspense } from "react";
import { ReportsPage } from "@/components/analytics/reports";

export default function Page() {
  return (
    <Suspense>
      <ReportsPage />
    </Suspense>
  );
}
