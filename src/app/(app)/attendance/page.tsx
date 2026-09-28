import { Suspense } from "react";
import { AttendanceHome } from "@/components/attendance/attendance-pages";

export default function Page() {
  return (
    <Suspense>
      <AttendanceHome />
    </Suspense>
  );
}
