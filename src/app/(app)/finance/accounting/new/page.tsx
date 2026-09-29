import { Suspense } from "react";
import { ManualEntryPage } from "@/components/finance/accounting";

export default function Page() {
  return (
    <Suspense>
      <ManualEntryPage />
    </Suspense>
  );
}
