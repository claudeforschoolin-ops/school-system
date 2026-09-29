import { Suspense } from "react";
import { TripsPage } from "@/components/ops/transport";

export default function Page() {
  return (
    <Suspense>
      <TripsPage />
    </Suspense>
  );
}
