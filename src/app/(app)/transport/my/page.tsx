import { Suspense } from "react";
import { FamilyTransportPage } from "@/components/ops/transport";

export default function Page() {
  return (
    <Suspense>
      <FamilyTransportPage />
    </Suspense>
  );
}
