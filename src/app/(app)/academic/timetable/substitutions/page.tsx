import { Suspense } from "react";
import { SubstitutionsPage } from "@/components/academic/timetable-pages";

export default function Page() {
  return (
    <Suspense>
      <SubstitutionsPage />
    </Suspense>
  );
}
