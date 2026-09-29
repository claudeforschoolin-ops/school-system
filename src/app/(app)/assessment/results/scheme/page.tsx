import { Suspense } from "react";
import { SchemePage } from "@/components/assessment/results";

export default function Page() {
  return (
    <Suspense>
      <SchemePage />
    </Suspense>
  );
}
