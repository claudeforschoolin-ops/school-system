import { Suspense } from "react";
import { SchedulesPage } from "@/components/finance/setup";

export default function Page() {
  return (
    <Suspense>
      <SchedulesPage />
    </Suspense>
  );
}
