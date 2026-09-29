import { Suspense } from "react";
import { CanteenItemsPage } from "@/components/ops/pos";

export default function Page() {
  return (
    <Suspense>
      <CanteenItemsPage />
    </Suspense>
  );
}
