import { Suspense } from "react";
import { RequestsPage } from "@/components/ops/procurement";

export default function Page() {
  return (
    <Suspense>
      <RequestsPage />
    </Suspense>
  );
}
