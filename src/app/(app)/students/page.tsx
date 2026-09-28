import { Suspense } from "react";
import { StudentsHome } from "@/components/students/students-home";

export default function Page() {
  return (
    <Suspense>
      <StudentsHome />
    </Suspense>
  );
}
