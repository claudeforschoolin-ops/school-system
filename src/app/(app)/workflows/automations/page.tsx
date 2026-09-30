import { Suspense } from "react";
import { AutomationsPage } from "@/components/governance/automations";

export default function Page() {
  return (
    <Suspense>
      <AutomationsPage />
    </Suspense>
  );
}
