import { Suspense } from "react";
import { StaffDayPage } from "@/components/hr/attendance";

export default function Page() {
  return (
    <Suspense>
      <StaffDayPage />
    </Suspense>
  );
}
