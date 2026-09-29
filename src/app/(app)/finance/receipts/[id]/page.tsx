import { Suspense } from "react";
import { ReceiptDetail } from "@/components/finance/collect";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ReceiptDetail key={id} id={id} />
    </Suspense>
  );
}
