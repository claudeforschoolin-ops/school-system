import { Suspense } from "react";
import { CashSessionPage } from "@/components/finance/collect";

export default function Page() {
  return (
    <Suspense>
      <CashSessionPage />
    </Suspense>
  );
}
