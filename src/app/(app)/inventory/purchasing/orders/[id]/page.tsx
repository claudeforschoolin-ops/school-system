import { Suspense } from "react";
import { OrderDetail } from "@/components/ops/procurement";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <OrderDetail id={id} />
    </Suspense>
  );
}
