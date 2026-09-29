import { Suspense } from "react";
import { StaffSettingsPage } from "@/components/hr/attendance";

export default function Page() {
  return (
    <Suspense>
      <StaffSettingsPage />
    </Suspense>
  );
}
