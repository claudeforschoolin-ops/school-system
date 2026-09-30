import { Suspense } from "react";
import { WorkflowMonitorPage } from "@/components/governance/workflows";

export default function Page() {
  return (
    <Suspense>
      <WorkflowMonitorPage />
    </Suspense>
  );
}
