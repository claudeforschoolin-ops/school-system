import { Suspense } from "react";
import { TimetableSettingsPage } from "@/components/academic/timetable-pages";

export default function Page() {
  return (
    <Suspense>
      <TimetableSettingsPage />
    </Suspense>
  );
}
