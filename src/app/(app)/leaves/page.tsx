import { Suspense } from "react";
import { LeavesHome } from "@/components/student-ops/ops-homes";

export default function Page() {
  return (
    <Suspense>
      <LeavesHome />
    </Suspense>
  );
}
