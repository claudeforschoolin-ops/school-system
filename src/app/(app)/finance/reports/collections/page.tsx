import { Suspense } from "react";
import { CollectionsReport } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <CollectionsReport />
    </Suspense>
  );
}
