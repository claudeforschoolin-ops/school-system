import { Suspense } from "react";
import { Reconciliation } from "@/components/finance/banking";

export default async function Page({ params }: { params: Promise<{ bankAccountId: string }> }) {
  const { bankAccountId } = await params;
  return (
    <Suspense>
      <Reconciliation key={bankAccountId} bankAccountId={bankAccountId} />
    </Suspense>
  );
}
