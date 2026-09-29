import { Suspense } from "react";
import { AssetDetail } from "@/components/ops/assets";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <AssetDetail id={id} />
    </Suspense>
  );
}
