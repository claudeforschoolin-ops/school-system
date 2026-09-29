import { Suspense } from "react";
import { BulkBilling } from "@/components/finance/bulk";

export default function Page() {
  return (
    <Suspense>
      <BulkBilling />
    </Suspense>
  );
}
