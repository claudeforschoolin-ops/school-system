import { Suspense } from "react";
import { ReviewPage } from "@/components/hr/performance";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ReviewPage id={id} />
    </Suspense>
  );
}
