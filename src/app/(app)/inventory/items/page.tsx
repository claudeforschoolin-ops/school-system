import { Suspense } from "react";
import { ItemsPage } from "@/components/ops/inventory";

export default async function Page({ searchParams }: { searchParams: Promise<{ low?: string }> }) {
  const { low } = await searchParams;
  return (
    <Suspense>
      <ItemsPage lowOnly={low === "1"} />
    </Suspense>
  );
}
