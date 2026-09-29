import { Suspense } from "react";
import { BillsPage } from "@/components/ops/procurement";

export default function Page() {
  return (
    <Suspense>
      <BillsPage />
    </Suspense>
  );
}
