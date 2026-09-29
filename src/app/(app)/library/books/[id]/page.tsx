import { Suspense } from "react";
import { BookDetail } from "@/components/ops/library";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <BookDetail id={id} />
    </Suspense>
  );
}
