import { Suspense } from "react";
import { DrillsPage } from "@/components/ops/safety";

export default function Page() {
  return (
    <Suspense>
      <DrillsPage />
    </Suspense>
  );
}
