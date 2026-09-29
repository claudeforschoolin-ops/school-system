import { Suspense } from "react";
import { StaffLeavesPage } from "@/components/hr/attendance";

export default function Page() {
  return (
    <Suspense>
      <StaffLeavesPage />
    </Suspense>
  );
}
