import { Suspense } from "react";
import { RequestEditor } from "@/components/ops/procurement";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <RequestEditor id={id} />
    </Suspense>
  );
}
