import { Suspense } from "react";
import { IncidentsPage } from "@/components/ops/safety";

export default function Page() {
  return (
    <Suspense>
      <IncidentsPage />
    </Suspense>
  );
}
