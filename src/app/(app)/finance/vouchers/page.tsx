import { Suspense } from "react";
import { VouchersHome } from "@/components/finance/banking";

export default function Page() {
  return (
    <Suspense>
      <VouchersHome />
    </Suspense>
  );
}
