import { Suspense } from "react";
import { AssetsPage } from "@/components/ops/assets";

export default function Page() {
  return (
    <Suspense>
      <AssetsPage />
    </Suspense>
  );
}
