import { Suspense } from "react";
import { CategoriesPage } from "@/components/ops/assets";

export default function Page() {
  return (
    <Suspense>
      <CategoriesPage />
    </Suspense>
  );
}
