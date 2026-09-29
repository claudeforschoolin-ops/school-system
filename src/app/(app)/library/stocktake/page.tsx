import { Suspense } from "react";
import { StockTakePage } from "@/components/ops/library";

export default function Page() {
  return (
    <Suspense>
      <StockTakePage />
    </Suspense>
  );
}
