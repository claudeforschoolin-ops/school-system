import { Suspense } from "react";
import { SalesReport } from "@/components/ops/pos";

export default function Page() {
  return (
    <Suspense>
      <SalesReport kind="CANTEEN" />
    </Suspense>
  );
}
