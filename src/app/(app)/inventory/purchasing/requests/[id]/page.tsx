import { Suspense } from "react";
import { RequestDetail } from "@/components/ops/procurement";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <RequestDetail id={id} />
    </Suspense>
  );
}
