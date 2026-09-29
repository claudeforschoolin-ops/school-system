import { Suspense } from "react";
import { CatalogPage } from "@/components/ops/library";

export default function Page() {
  return (
    <Suspense>
      <CatalogPage />
    </Suspense>
  );
}
