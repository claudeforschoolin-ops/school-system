import { Suspense } from "react";
import { EosDetailPage } from "@/components/hr/eos";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <EosDetailPage id={id} />
    </Suspense>
  );
}
