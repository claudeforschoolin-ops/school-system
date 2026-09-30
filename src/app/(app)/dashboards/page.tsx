import { Suspense } from "react";
import { DashboardsPage } from "@/components/analytics/dashboards";

export default function Page() {
  return (
    <Suspense>
      <DashboardsPage />
    </Suspense>
  );
}
