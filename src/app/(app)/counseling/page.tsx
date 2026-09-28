import { Suspense } from "react";
import { CounselingHome } from "@/components/student-ops/ops-homes";

export default function Page() {
  return (
    <Suspense>
      <CounselingHome />
    </Suspense>
  );
}
