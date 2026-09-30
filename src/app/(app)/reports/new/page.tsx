import { Suspense } from "react";
import { ReportBuilderPage } from "@/components/analytics/reports";

export default function Page() {
  return (
    <Suspense>
      <ReportBuilderPage />
    </Suspense>
  );
}
