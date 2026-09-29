import { Suspense } from "react";
import { ExamsHome } from "@/components/assessment/exams";

export default function Page() {
  return (
    <Suspense>
      <ExamsHome />
    </Suspense>
  );
}
