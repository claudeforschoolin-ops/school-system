import { Suspense } from "react";
import { PrintCardsPage } from "@/components/assessment/report-cards";

export default function Page() {
  return (
    <Suspense>
      <PrintCardsPage />
    </Suspense>
  );
}
