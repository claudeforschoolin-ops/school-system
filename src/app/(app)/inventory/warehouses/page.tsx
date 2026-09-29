import { Suspense } from "react";
import { WarehousesPage } from "@/components/ops/inventory";

export default function Page() {
  return (
    <Suspense>
      <WarehousesPage />
    </Suspense>
  );
}
