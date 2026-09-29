import { Suspense } from "react";
import { TemplatesPage } from "@/components/assessment/report-cards";

export default function Page() {
  return (
    <Suspense>
      <TemplatesPage />
    </Suspense>
  );
}
