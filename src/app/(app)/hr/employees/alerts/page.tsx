import { Suspense } from "react";
import { AlertsPage } from "@/components/hr/employees";

export default function Page() {
  return (
    <Suspense>
      <AlertsPage />
    </Suspense>
  );
}
