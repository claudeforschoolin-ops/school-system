import { Suspense } from "react";
import { MyResultsPage } from "@/components/assessment/report-cards";

export default function Page() {
  return (
    <Suspense>
      <MyResultsPage />
    </Suspense>
  );
}
