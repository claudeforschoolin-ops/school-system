import { Suspense } from "react";
import { ChequesPage } from "@/components/finance/collect";

export default function Page() {
  return (
    <Suspense>
      <ChequesPage />
    </Suspense>
  );
}
