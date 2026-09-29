import { Suspense } from "react";
import { PlansPage } from "@/components/finance/setup";

export default function Page() {
  return (
    <Suspense>
      <PlansPage />
    </Suspense>
  );
}
