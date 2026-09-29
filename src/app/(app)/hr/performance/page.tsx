import { Suspense } from "react";
import { PerformancePage } from "@/components/hr/performance";

export default function Page() {
  return (
    <Suspense>
      <PerformancePage />
    </Suspense>
  );
}
