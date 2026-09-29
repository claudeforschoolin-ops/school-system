import { Suspense } from "react";
import { InventoryHome } from "@/components/ops/inventory";

export default function Page() {
  return (
    <Suspense>
      <InventoryHome />
    </Suspense>
  );
}
