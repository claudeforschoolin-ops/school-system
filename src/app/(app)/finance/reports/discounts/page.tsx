import { Suspense } from "react";
import { DiscountsReport } from "@/components/finance/reports";

export default function Page() {
  return (
    <Suspense>
      <DiscountsReport />
    </Suspense>
  );
}
