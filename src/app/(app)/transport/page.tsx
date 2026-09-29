import { Suspense } from "react";
import { RoutesPage } from "@/components/ops/transport";

export default function Page() {
  return (
    <Suspense>
      <RoutesPage />
    </Suspense>
  );
}
