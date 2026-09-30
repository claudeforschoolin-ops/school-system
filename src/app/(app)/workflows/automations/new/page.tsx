import { Suspense } from "react";
import { AutomationEditorPage } from "@/components/governance/automations";

export default function Page() {
  return (
    <Suspense>
      <AutomationEditorPage />
    </Suspense>
  );
}
