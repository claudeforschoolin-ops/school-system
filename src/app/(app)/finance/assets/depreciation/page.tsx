import { Suspense } from "react";
import { DepreciationPage } from "@/components/ops/assets";

export default function Page() {
  return (
    <Suspense>
      <DepreciationPage />
    </Suspense>
  );
}
