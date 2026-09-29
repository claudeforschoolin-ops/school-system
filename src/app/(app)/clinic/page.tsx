import { Suspense } from "react";
import { ClinicPage } from "@/components/ops/safety";

export default function Page() {
  return (
    <Suspense>
      <ClinicPage />
    </Suspense>
  );
}
