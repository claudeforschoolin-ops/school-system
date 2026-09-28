import { Suspense } from "react";
import { TransfersHome } from "@/components/student-ops/ops-homes";

export default function Page() {
  return (
    <Suspense>
      <TransfersHome />
    </Suspense>
  );
}
