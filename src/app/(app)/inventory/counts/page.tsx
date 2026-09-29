import { Suspense } from "react";
import { CountsPage } from "@/components/ops/inventory";

export default function Page() {
  return (
    <Suspense>
      <CountsPage />
    </Suspense>
  );
}
