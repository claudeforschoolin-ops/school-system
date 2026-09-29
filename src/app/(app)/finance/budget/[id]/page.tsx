import { Suspense } from "react";
import { BudgetDetail } from "@/components/ops/budget";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <BudgetDetail id={id} />
    </Suspense>
  );
}
