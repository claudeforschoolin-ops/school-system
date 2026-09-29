import { Suspense } from "react";
import { BillDetail } from "@/components/ops/procurement";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <BillDetail id={id} />
    </Suspense>
  );
}
