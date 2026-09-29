import { Suspense } from "react";
import { OrdersPage } from "@/components/ops/procurement";

export default function Page() {
  return (
    <Suspense>
      <OrdersPage />
    </Suspense>
  );
}
