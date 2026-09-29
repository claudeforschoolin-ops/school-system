import { Suspense } from "react";
import { DiscountsPage } from "@/components/finance/setup";

export default function Page() {
  return (
    <Suspense>
      <DiscountsPage />
    </Suspense>
  );
}
