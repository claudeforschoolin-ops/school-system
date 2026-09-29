import { Suspense } from "react";
import { StatsPage } from "@/components/assessment/stats";

export default function Page() {
  return (
    <Suspense>
      <StatsPage />
    </Suspense>
  );
}
