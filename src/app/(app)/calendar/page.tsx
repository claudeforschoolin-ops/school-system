import type { Metadata } from "next";
import { Suspense } from "react";
import { SchoolCalendar } from "@/components/calendar/school-calendar";

export const metadata: Metadata = { title: "التقويم" };

export default function CalendarPage() {
  return (
    <Suspense>
      <SchoolCalendar />
    </Suspense>
  );
}
