import { Suspense } from "react";
import { ResultsPage } from "@/components/assessment/results";

export default function Page() {
  return (
    <Suspense>
      <ResultsPage />
    </Suspense>
  );
}
