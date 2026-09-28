import { Suspense } from "react";
import { TodayBoard } from "@/components/attendance/attendance-pages";

export default function Page() {
  return (
    <Suspense>
      <TodayBoard />
    </Suspense>
  );
}
