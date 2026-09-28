import { Suspense } from "react";
import { StudentProfile } from "@/components/students/student-profile";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <StudentProfile key={id} id={id} />
    </Suspense>
  );
}
