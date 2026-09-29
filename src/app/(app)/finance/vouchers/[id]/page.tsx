import { Suspense } from "react";
import { VoucherDetail } from "@/components/finance/banking";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <VoucherDetail key={id} id={id} />
    </Suspense>
  );
}
