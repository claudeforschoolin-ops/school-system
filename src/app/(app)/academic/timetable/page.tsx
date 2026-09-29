import { Suspense } from "react";
import { TimetableHome } from "@/components/academic/timetable-pages";

export default function Page() {
  return (
    <Suspense>
      <TimetableHome />
    </Suspense>
  );
}
