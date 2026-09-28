import { Suspense } from "react";
import { BehaviorHome } from "@/components/student-ops/ops-homes";

export default function Page() {
  return (
    <Suspense>
      <BehaviorHome />
    </Suspense>
  );
}
