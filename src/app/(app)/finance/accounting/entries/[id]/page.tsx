import { Suspense } from "react";
import { EntryDetail } from "@/components/finance/accounting";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <EntryDetail key={id} id={id} />
    </Suspense>
  );
}
