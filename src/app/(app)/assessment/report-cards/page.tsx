import { Suspense } from "react";
import { ReportCardsPage } from "@/components/assessment/report-cards";

export default function Page() {
  return (
    <Suspense>
      <ReportCardsPage />
    </Suspense>
  );
}
