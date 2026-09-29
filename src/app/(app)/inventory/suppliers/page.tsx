import { Suspense } from "react";
import { SuppliersPage } from "@/components/ops/procurement";

export default function Page() {
  return (
    <Suspense>
      <SuppliersPage />
    </Suspense>
  );
}
