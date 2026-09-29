import { Suspense } from "react";
import { VisitorsPage } from "@/components/ops/safety";

export default function Page() {
  return (
    <Suspense>
      <VisitorsPage />
    </Suspense>
  );
}
