import { Suspense } from "react";
import { CyclePage } from "@/components/hr/performance";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <CyclePage id={id} />
    </Suspense>
  );
}
