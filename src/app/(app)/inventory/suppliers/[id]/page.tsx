import { Suspense } from "react";
import { SupplierDetail } from "@/components/ops/procurement";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <SupplierDetail id={id} />
    </Suspense>
  );
}
