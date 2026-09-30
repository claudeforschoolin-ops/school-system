import { Suspense } from "react";
import { WorkflowsPage } from "@/components/governance/workflows";

export default function Page() {
  return (
    <Suspense>
      <WorkflowsPage />
    </Suspense>
  );
}
