import { Suspense } from "react";
import { GradeBookPage } from "@/components/assessment/grade-grid";

export default async function Page({ params }: { params: Promise<{ sectionId: string; subjectId: string }> }) {
  const { sectionId, subjectId } = await params;
  return (
    <Suspense>
      <GradeBookPage sectionId={sectionId} subjectId={subjectId} />
    </Suspense>
  );
}
