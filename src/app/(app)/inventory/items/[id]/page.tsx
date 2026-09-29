import { Suspense } from "react";
import { ItemDetail } from "@/components/ops/inventory";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ItemDetail id={id} />
    </Suspense>
  );
}
