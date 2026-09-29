import { Suspense } from "react";
import { PickupsPage } from "@/components/ops/safety";

export default function Page() {
  return (
    <Suspense>
      <PickupsPage />
    </Suspense>
  );
}
