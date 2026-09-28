import { Suspense } from "react";
import { AttendanceReports } from "@/components/attendance/attendance-pages";

export default function Page() {
  return (
    <Suspense>
      <AttendanceReports />
    </Suspense>
  );
}
