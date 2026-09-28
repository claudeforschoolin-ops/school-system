import { Suspense } from "react";
import { AttendanceSettings } from "@/components/attendance/attendance-pages";

export default function Page() {
  return (
    <Suspense>
      <AttendanceSettings />
    </Suspense>
  );
}
