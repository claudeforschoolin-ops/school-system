import { Suspense } from "react";
import { BusesPage } from "@/components/ops/transport";

export default function Page() {
  return (
    <Suspense>
      <BusesPage />
    </Suspense>
  );
}
