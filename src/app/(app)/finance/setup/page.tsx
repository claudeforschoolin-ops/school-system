import { Suspense } from "react";
import { FeeItemsPage } from "@/components/finance/setup";

export default function Page() {
  return (
    <Suspense>
      <FeeItemsPage />
    </Suspense>
  );
}
