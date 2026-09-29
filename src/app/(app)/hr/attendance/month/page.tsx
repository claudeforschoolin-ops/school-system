import { Suspense } from "react";
import { StaffMonthPage } from "@/components/hr/attendance";

export default function Page() {
  return (
    <Suspense>
      <StaffMonthPage />
    </Suspense>
  );
}
