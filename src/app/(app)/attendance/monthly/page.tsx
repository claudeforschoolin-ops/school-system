import { Suspense } from "react";
import { MonthlyGrid } from "@/components/attendance/attendance-pages";

export default function Page() {
  return (
    <Suspense>
      <MonthlyGrid />
    </Suspense>
  );
}
