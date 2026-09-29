import { Suspense } from "react";
import { LedgerPage } from "@/components/finance/accounting";

export default async function Page({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  return (
    <Suspense>
      <LedgerPage key={accountId} accountId={accountId} />
    </Suspense>
  );
}
