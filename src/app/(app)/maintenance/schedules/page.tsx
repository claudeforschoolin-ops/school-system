import { Suspense } from "react";
import { SchedulesPage } from "@/components/ops/maintenance";

export default function Page() {
  return (
    <Suspense>
      <SchedulesPage />
    </Suspense>
  );
}
