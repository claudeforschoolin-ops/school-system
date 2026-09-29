import { Suspense } from "react";
import { ReceiptsList } from "@/components/finance/collect";

export default function Page() {
  return (
    <Suspense>
      <ReceiptsList />
    </Suspense>
  );
}
