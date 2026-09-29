import { Suspense } from "react";
import { CurriculumHome } from "@/components/academic/curriculum-pages";

export default function Page() {
  return (
    <Suspense>
      <CurriculumHome />
    </Suspense>
  );
}
