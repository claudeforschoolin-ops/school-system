import { Suspense } from "react";
import { AssessmentSettingsPage } from "@/components/assessment/results";

export default function Page() {
  return (
    <Suspense>
      <AssessmentSettingsPage />
    </Suspense>
  );
}
