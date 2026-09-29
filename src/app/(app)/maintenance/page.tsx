import { Suspense } from "react";
import { MaintenanceBoard } from "@/components/ops/maintenance";

export default function Page() {
  return (
    <Suspense>
      <MaintenanceBoard />
    </Suspense>
  );
}
