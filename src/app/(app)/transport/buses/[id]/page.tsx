import { Suspense } from "react";
import { BusDetail } from "@/components/ops/transport";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <BusDetail id={id} />
    </Suspense>
  );
}
