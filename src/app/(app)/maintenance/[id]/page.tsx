import { Suspense } from "react";
import { RequestPage } from "@/components/ops/maintenance";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <RequestPage id={id} />
    </Suspense>
  );
}
