import { Suspense } from "react";
import { ComplianceSettingsPage } from "@/components/governance/compliance";

export default function Page() {
  return (
    <Suspense>
      <ComplianceSettingsPage />
    </Suspense>
  );
}
