import { Suspense } from "react";
import { WalletPage } from "@/components/ops/pos";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <WalletPage studentId={id} />
    </Suspense>
  );
}
