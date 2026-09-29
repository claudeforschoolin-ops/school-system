import { Suspense } from "react";
import { CommitteePage } from "@/components/assessment/exams";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <CommitteePage id={id} />
    </Suspense>
  );
}
