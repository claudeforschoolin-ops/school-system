import { Suspense } from "react";
import { ExamDetailPage } from "@/components/assessment/exams";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ExamDetailPage id={id} />
    </Suspense>
  );
}
