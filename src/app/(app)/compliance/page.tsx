import { Suspense } from "react";
import { ComplianceOverviewPage } from "@/components/governance/compliance";

export default function Page() {
  return (
    <Suspense>
      <ComplianceOverviewPage />
    </Suspense>
  );
}
