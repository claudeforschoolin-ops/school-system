import { Suspense } from "react";
import { QuickReceipt } from "@/components/finance/collect";

export default function Page() {
  return (
    <Suspense>
      <QuickReceipt />
    </Suspense>
  );
}
