import { Suspense } from "react";
import { GradesHome } from "@/components/assessment/grade-grid";

export default function Page() {
  return (
    <Suspense>
      <GradesHome />
    </Suspense>
  );
}
