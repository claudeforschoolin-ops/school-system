import { Suspense } from "react";
import { TaxesPage } from "@/components/finance/setup";

export default function Page() {
  return (
    <Suspense>
      <TaxesPage />
    </Suspense>
  );
}
